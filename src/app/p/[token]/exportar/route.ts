import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { exportBomCsv, exportCablesCsv, exportDrawings } from "@/server/room-builder/exports";
import { findSharedProject } from "@/server/room-builder/share";
import { CSV_BOM, exportFileName } from "@/services/room-builder/exports/csv";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Exportaciones por enlace en la ventana: cada una lee todo el proyecto. */
const LIMIT = 30;
const WINDOW_MS = 10 * 60 * 1000;

const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

/**
 * Exportaciones desde el enlace del cliente (sin sesión): ?kind=bom (lista de
 * materiales SIN precios), cables (planilla con ID F501) o drawings (SVG de
 * plano y diagrama, los mismos que ya muestra la página, para el PNG).
 */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const project = await findSharedProject(params.token);
  if (!project) return new NextResponse("Enlace no disponible.", { status: 404, headers });
  const rate = await consumeRateLimit(`room-project-exports:${project.id}`, LIMIT, WINDOW_MS);
  if (!rate.ok) return new NextResponse("Demasiadas descargas seguidas. Probá de nuevo en unos minutos.", { status: 429, headers: { ...headers, "Retry-After": String(rate.retryAfterSec ?? 60) } });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  try {
    if (kind === "bom" || kind === "cables") {
      // El cliente nunca recibe precios.
      const { csv, name } = kind === "bom" ? await exportBomCsv(project.id, { prices: false, origin: url.origin }) : await exportCablesCsv(project.id, url.origin);
      const file = exportFileName(kind === "bom" ? "Materiales" : "Planilla_cables", name, "csv");
      return new NextResponse(CSV_BOM + csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"` } });
    }
    if (kind === "drawings") return NextResponse.json({ ok: true, ...(await exportDrawings(project.id)) }, { headers });
    return new NextResponse("Exportación desconocida.", { status: 400, headers });
  } catch (error) {
    console.error(`[p/exportar] ${project.id} ${kind}`, error);
    return new NextResponse("No se pudo exportar.", { status: 500, headers });
  }
}
