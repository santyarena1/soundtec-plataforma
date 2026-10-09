import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/auth-helpers";
import { analyzePlanImage, analyzePlanRegions } from "@/server/room-builder/plan-ai";
import { mergeSameNamedNeighbors, type PlanAnalysis, type PlanBox } from "@/services/room-builder/plan-analysis";
import { regionPolygon } from "@/services/room-builder/plan-contour";
import { isAxisRect } from "@/services/room-builder/plan-polygon";
import { openContact, placeRooms, segmentRegions } from "@/services/room-builder/plan-segment";
import { snapBoxToWalls, type GrayImage } from "@/services/room-builder/plan-snap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** La lectura con IA de un plano grande puede tardar. */
export const maxDuration = 120;

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
/** Nítido para leer cotas, liviano para la IA y para guardar. */
const PLAN_MAX_SIDE = 2000;
/** Con más espacios que esto el plano no se segmentó bien: se usa la lectura libre. */
const MAX_MARKS = 40;
/** Celdas de contacto sin muro para unir dos sectores con el mismo nombre. */
const MIN_OPEN_CONTACT = 6;

/** Orden de lectura (arriba-abajo, izquierda-derecha) para numerar. */
function readingOrder(a: PlanBox, b: PlanBox): number {
  const rowA = Math.round(((a.y0 + a.y1) / 2) * 12);
  const rowB = Math.round(((b.y0 + b.y1) / 2) * 12);
  return rowA - rowB || (a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2;
}

/** Margen alrededor de cada recorte (para que entre el texto pegado a los muros). */
const CROP_PAD = 0.01;
/** Lado máximo de cada recorte (se manda en baja resolución a la IA). */
const CROP_MAX_SIDE = 512;

/** Recorte de un espacio del plano, como data URL. */
async function cropRegion(webp: Buffer, width: number, height: number, b: PlanBox): Promise<string> {
  const left = Math.max(0, Math.floor((b.x0 - CROP_PAD) * width));
  const top = Math.max(0, Math.floor((b.y0 - CROP_PAD) * height));
  const right = Math.min(width, Math.ceil((b.x1 + CROP_PAD) * width));
  const bottom = Math.min(height, Math.ceil((b.y1 + CROP_PAD) * height));
  const out = await sharp(webp)
    .extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
    .resize({ width: CROP_MAX_SIDE, height: CROP_MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  return `data:image/webp;base64,${out.toString("base64")}`;
}

/**
 * Lectura del plano: primero se detectan los espacios cerrados en la imagen;
 * si salen bien, cada uno va recortado y la IA solo lee qué es. Si no, la
 * IA ubica los ambientes y se ajustan a los espacios / muros.
 */
async function readPlan(webp: Buffer, dataUrl: string, gray: GrayImage): Promise<PlanAnalysis> {
  const { regions, grid, closeCells } = segmentRegions(gray);
  if (regions.length >= 1 && regions.length <= MAX_MARKS) {
    const sorted = [...regions].sort((a, b) => readingOrder(a.box, b.box));
    const boxes = sorted.map((r) => r.box);
    const crops = await Promise.all(boxes.map((b) => cropRegion(webp, gray.width, gray.height, b)));
    const read = await analyzePlanRegions(dataUrl, crops, boxes);
    // Cada ambiente numerado lleva la forma real de su espacio (r1 = primer espacio, etc.).
    const labelsById = new Map(sorted.map((r, i) => [`r${i + 1}`, [r.label]]));
    const polygonById = new Map(sorted.map((r, i) => [`r${i + 1}`, r.polygon]));
    // Los que la IA vio sin recorte vienen aproximados: se pegan a los muros.
    const rooms = read.rooms.map((r) =>
      r.id.startsWith("m") ? { ...r, box: snapBoxToWalls(r.box, gray) } : polygonById.get(r.id) ? { ...r, polygon: polygonById.get(r.id) } : r,
    );
    // Los vecinos con el mismo nombre se unen, con la forma de la unión.
    const union = (a: { id: string }, b: { id: string }) => {
      const la = labelsById.get(a.id);
      const lb = labelsById.get(b.id);
      if (!la || !lb) return undefined;
      const merged = [...la, ...lb];
      labelsById.set(a.id, merged);
      const poly = regionPolygon(grid, merged, closeCells);
      return poly && !isAxisRect(poly) ? poly : undefined;
    };
    // Solo se unen si se comunican sin muro (sectores de un mismo baño; no dos baños pegados).
    const canMerge = (a: { id: string }, b: { id: string }) => {
      const la = labelsById.get(a.id);
      const lb = labelsById.get(b.id);
      return Boolean(la && lb && openContact(grid, la, lb) >= MIN_OPEN_CONTACT);
    };
    return { ...read, rooms: mergeSameNamedNeighbors(rooms, union, canMerge) };
  }
  const read = await analyzePlanImage(dataUrl);
  const placed = placeRooms(read.rooms, gray);
  const extras = placed.extras.map((box, i) => ({
    id: `x${i + 1}`,
    name: `Ambiente sin nombre ${i + 1}`,
    templateKey: null,
    box,
    widthM: null,
    depthM: null,
    include: false,
  }));
  return { ...read, rooms: [...placed.rooms, ...extras] };
}

/** Lee un plano: tipo de proyecto y ambientes. Devuelve también la imagen comprimida. */
export async function POST(req: NextRequest) {
  await requireAdmin();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No llegó el plano" }, { status: 400 });
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "Subí el plano como imagen (PNG, JPG o WebP). Si es PDF, exportá la página como imagen." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ ok: false, error: "La imagen pesa más de 12 MB" }, { status: 400 });

  let image: { data: Buffer; width: number; height: number };
  let gray: GrayImage;
  try {
    const { data, info } = await sharp(Buffer.from(await file.arrayBuffer()), { animated: false })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: PLAN_MAX_SIDE, height: PLAN_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    image = { data, width: info.width, height: info.height };
    const g = await sharp(data).greyscale().raw().toBuffer({ resolveWithObject: true });
    gray = { data: new Uint8Array(g.data), width: g.info.width, height: g.info.height };
  } catch (error) {
    console.error("[room-builder/plan-analyze] imagen ilegible", error);
    return NextResponse.json({ ok: false, error: "No pudimos leer esa imagen. Probá con un PNG o JPG." }, { status: 400 });
  }

  const dataUrl = `data:image/webp;base64,${image.data.toString("base64")}`;
  const imagePayload = { dataUrl, widthPx: image.width, heightPx: image.height };
  try {
    const analysis = await readPlan(image.data, dataUrl, gray);
    return NextResponse.json({ ok: true, analysis, image: imagePayload });
  } catch (error) {
    console.error("[room-builder/plan-analyze] IA", error);
    const message = error instanceof Error ? error.message : "No se pudo leer el plano";
    // La imagen igual vuelve: se pueden marcar los ambientes a mano.
    return NextResponse.json({ ok: true, analysis: { kind: "otro", summary: "", rooms: [] }, warning: message, image: imagePayload });
  }
}
