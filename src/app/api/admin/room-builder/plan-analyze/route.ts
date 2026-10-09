import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/auth-helpers";
import { analyzePlanImage } from "@/server/room-builder/plan-ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** La lectura con IA de un plano grande puede tardar. */
export const maxDuration = 120;

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
/** Nítido para leer cotas, liviano para la IA y para guardar. */
const PLAN_MAX_SIDE = 2000;

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
  try {
    const { data, info } = await sharp(Buffer.from(await file.arrayBuffer()), { animated: false })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: PLAN_MAX_SIDE, height: PLAN_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    image = { data, width: info.width, height: info.height };
  } catch (error) {
    console.error("[room-builder/plan-analyze] imagen ilegible", error);
    return NextResponse.json({ ok: false, error: "No pudimos leer esa imagen. Probá con un PNG o JPG." }, { status: 400 });
  }

  const dataUrl = `data:image/webp;base64,${image.data.toString("base64")}`;
  try {
    const analysis = await analyzePlanImage(dataUrl);
    return NextResponse.json({ ok: true, analysis, image: { dataUrl, widthPx: image.width, heightPx: image.height } });
  } catch (error) {
    console.error("[room-builder/plan-analyze] IA", error);
    const message = error instanceof Error ? error.message : "No se pudo leer el plano";
    // La imagen igual vuelve: se pueden marcar los ambientes a mano.
    return NextResponse.json({ ok: true, analysis: { kind: "otro", summary: "", rooms: [] }, warning: message, image: { dataUrl, widthPx: image.width, heightPx: image.height } });
  }
}
