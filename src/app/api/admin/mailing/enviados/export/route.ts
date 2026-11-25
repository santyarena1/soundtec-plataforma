import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { sanitizeSpreadsheetCell } from "@/lib/expo/spreadsheet";
import { lastEvent, parseSentFilters, sentWhere, stageOf } from "@/lib/mailing/sent-table";

const MAX_ROWS = 50_000;

/** «Enviados» de campañas con los mismos filtros de la pantalla, en Excel. */
export async function GET(req: Request) {
  await requireStaff("marketing.manage");
  const filters = parseSentFilters(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await prisma.mailCampaignRecipient.findMany({
    where: sentWhere(filters),
    orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    take: MAX_ROWS,
    select: {
      email: true,
      name: true,
      company: true,
      status: true,
      sentAt: true,
      deliveredAt: true,
      openedAt: true,
      openCount: true,
      clickedAt: true,
      clickCount: true,
      bouncedAt: true,
      bounceType: true,
      complainedAt: true,
      unsubscribedAt: true,
      lastError: true,
      campaign: { select: { name: true } },
    },
  });
  const date = (d: Date | null | undefined) => (d ? d.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "");
  const header = ["Email", "Nombre", "Empresa", "Campaña", "Enviado", "Estado", "Último evento", "Fecha último evento", "Entregado", "Abrió", "Aperturas", "Clic", "Clics", "Rebote", "Queja de spam", "Baja", "Detalle"];
  const data = rows.map((r) => {
    const last = lastEvent(r);
    return [
      r.email,
      r.name ?? "",
      r.company ?? "",
      r.campaign.name,
      date(r.sentAt),
      stageOf(r).label,
      last?.label ?? "",
      date(last?.at),
      date(r.deliveredAt),
      date(r.openedAt),
      String(r.openCount),
      date(r.clickedAt),
      String(r.clickCount),
      r.bouncedAt ? `${date(r.bouncedAt)} ${r.bounceType ?? ""}`.trim() : "",
      date(r.complainedAt),
      date(r.unsubscribedAt),
      r.lastError ?? "",
    ].map((v) => sanitizeSpreadsheetCell(v));
  });
  const sheet = XLSX.utils.aoa_to_sheet([header, ...data]);
  sheet["!cols"] = header.map((h, i) => ({ wch: i === 0 ? 32 : i === 3 ? 30 : Math.min(40, Math.max(12, h.length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Enviados");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="campanas-enviados-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
