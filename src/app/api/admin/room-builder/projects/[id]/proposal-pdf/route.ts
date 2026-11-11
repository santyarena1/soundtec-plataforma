import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth-helpers";
import { buildProposalPdf } from "@/server/room-builder/proposal-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vistas 3D capturadas en el editor (JPEG/PNG en base64). */
const schema = z.object({
  snapshots: z
    .array(z.object({ label: z.string().max(80), dataUrl: z.string().max(3_000_000).regex(/^data:image\/(jpeg|png);base64,/) }))
    .max(3)
    .default([]),
});

/** Láminas técnicas en PDF: de un ambiente (con sus vistas 3D) o del proyecto completo. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  await requireStaff("room_builder.use");
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Vistas inválidas" }, { status: 400 });
  try {
    const { bytes, fileName } = await buildProposalPdf(params.id, parsed.data.snapshots, new URL(req.url).origin);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName.ascii}"; filename*=UTF-8''${encodeURIComponent(fileName.utf8)}`,
      },
    });
  } catch (error) {
    console.error(`[room-builder/proposal-pdf] ${params.id}`, error);
    const message = error instanceof Error ? error.message : "No se pudieron generar las láminas";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
