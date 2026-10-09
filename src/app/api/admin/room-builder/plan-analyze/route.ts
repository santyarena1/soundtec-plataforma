import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/auth-helpers";
import { analyzeMarkedPlan, analyzePlanImage } from "@/server/room-builder/plan-ai";
import type { PlanAnalysis, PlanBox } from "@/services/room-builder/plan-analysis";
import { placeRooms, segmentRegions } from "@/services/room-builder/plan-segment";
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
const MARK_COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#dc2626", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5"];

/** Orden de lectura (arriba-abajo, izquierda-derecha) para numerar. */
function readingOrder(a: PlanBox, b: PlanBox): number {
  const rowA = Math.round(((a.y0 + a.y1) / 2) * 12);
  const rowB = Math.round(((b.y0 + b.y1) / 2) * 12);
  return rowA - rowB || (a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2;
}

/** Plano con cada espacio recuadrado y numerado (para que la IA solo tenga que leer). */
async function markedPlan(webp: Buffer, width: number, height: number, boxes: PlanBox[]): Promise<string> {
  const r = Math.round(Math.max(width, height) * 0.013);
  const marks = boxes
    .map((b, i) => {
      const color = MARK_COLORS[i % MARK_COLORS.length];
      const x = b.x0 * width;
      const y = b.y0 * height;
      const cx = x + r * 1.4;
      const cy = y + r * 1.4;
      return `<rect x="${x}" y="${y}" width="${(b.x1 - b.x0) * width}" height="${(b.y1 - b.y0) * height}" fill="${color}" fill-opacity="0.07" stroke="${color}" stroke-width="${Math.max(2, r / 5)}"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>
<text x="${cx}" y="${cy + r * 0.38}" font-family="Arial, sans-serif" font-size="${r * 1.1}" font-weight="700" fill="white" text-anchor="middle">${i + 1}</text>`;
    })
    .join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${marks}</svg>`;
  const out = await sharp(webp).composite([{ input: Buffer.from(svg) }]).webp({ quality: 85 }).toBuffer();
  return `data:image/webp;base64,${out.toString("base64")}`;
}

/**
 * Lectura del plano: primero se detectan los espacios cerrados en la imagen;
 * si salen bien, se numeran y la IA solo dice qué es cada número. Si no, la
 * IA ubica los ambientes y se ajustan a los espacios / muros.
 */
async function readPlan(webp: Buffer, dataUrl: string, gray: GrayImage): Promise<PlanAnalysis> {
  const { regions } = segmentRegions(gray);
  if (regions.length >= 1 && regions.length <= MAX_MARKS) {
    const boxes = regions.map((r) => r.box).sort(readingOrder);
    const read = await analyzeMarkedPlan(await markedPlan(webp, gray.width, gray.height, boxes), boxes);
    // Los ambientes sin número (no cerrados) vienen aproximados: se pegan a los muros.
    return { ...read, rooms: read.rooms.map((r) => (r.id.startsWith("m") ? { ...r, box: snapBoxToWalls(r.box, gray) } : r)) };
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
