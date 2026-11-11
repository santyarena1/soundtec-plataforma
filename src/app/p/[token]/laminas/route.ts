import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { buildProposalPdf } from "@/server/room-builder/proposal-pdf";
import { findSharedProject } from "@/server/room-builder/share";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Descargas por enlace en la ventana: cada PDF levanta un navegador, no se puede pedir sin límite. */
const LIMIT = 6;
const WINDOW_MS = 10 * 60 * 1000;

/** Láminas técnicas en PDF desde el enlace del cliente (sin sesión; sin vistas 3D: no hay capturas guardadas). */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const project = await findSharedProject(params.token);
  if (!project) return new NextResponse("Enlace no disponible.", { status: 404 });
  const rate = await consumeRateLimit(`room-project-sheets:${project.id}`, LIMIT, WINDOW_MS);
  if (!rate.ok) return new NextResponse("Demasiadas descargas seguidas. Probá de nuevo en unos minutos.", { status: 429, headers: { "Retry-After": String(rate.retryAfterSec ?? 60) } });
  try {
    const { bytes, fileName } = await buildProposalPdf(project.id, [], new URL(req.url).origin);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName.ascii}"; filename*=UTF-8''${encodeURIComponent(fileName.utf8)}`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    console.error(`[p/laminas] ${project.id}`, error);
    return new NextResponse("No se pudieron generar las láminas.", { status: 500 });
  }
}
