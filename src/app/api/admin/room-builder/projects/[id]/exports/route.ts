import { NextResponse } from "next/server";
import { canSeeSalePricesNow } from "@/lib/auth-helpers";
import { requireRoomProjectAccess } from "@/server/room-builder/access";
import { exportBomCsv, exportCablesCsv, exportDrawings } from "@/server/room-builder/exports";
import { CSV_BOM, exportFileName } from "@/services/room-builder/exports/csv";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const csvResponse = (csv: string, fileName: string) =>
  new NextResponse(CSV_BOM + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "private, no-store" } });

/**
 * Exportaciones del panel: ?kind=bom (lista de materiales; &prices=1 con
 * precios de venta si el usuario puede verlos), cables (planilla F501) o
 * drawings (SVG de plano y diagrama para pasarlos a PNG en el navegador).
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  await requireRoomProjectAccess(params.id);
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  try {
    if (kind === "bom") {
      const prices = url.searchParams.get("prices") === "1" && (await canSeeSalePricesNow());
      const { csv, name } = await exportBomCsv(params.id, { prices, origin: url.origin });
      return csvResponse(csv, exportFileName(prices ? "Materiales_con_precios" : "Materiales", name, "csv"));
    }
    if (kind === "cables") {
      const { csv, name } = await exportCablesCsv(params.id, url.origin);
      return csvResponse(csv, exportFileName("Planilla_cables", name, "csv"));
    }
    if (kind === "drawings") return NextResponse.json({ ok: true, ...(await exportDrawings(params.id)) });
    return NextResponse.json({ ok: false, error: "Exportación desconocida" }, { status: 400 });
  } catch (error) {
    console.error(`[room-builder/exports] ${params.id} ${kind}`, error);
    return NextResponse.json({ ok: false, error: "No se pudo exportar" }, { status: 500 });
  }
}
