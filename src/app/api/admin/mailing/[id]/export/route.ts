import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { sanitizeSpreadsheetCell } from "@/lib/expo/spreadsheet";
import { recipientStage } from "@/lib/mailing/stats";

/** Destinatarios de una campaña con su estado, en Excel. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireStaff("marketing.manage");
  const { id } = await ctx.params;
  const campaign = await prisma.mailCampaign.findUnique({ where: { id }, select: { name: true } });
  if (!campaign) return NextResponse.json({ error: "No existe" }, { status: 404 });
  const recipients = await prisma.mailCampaignRecipient.findMany({ where: { campaignId: id }, orderBy: { createdAt: "asc" } });
  const date = (d: Date | null) => (d ? d.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "");
  const header = ["Email", "Nombre", "Empresa", "Estado", "Enviado", "Entregado", "Abrió", "Aperturas", "Clic", "Clics", "Último enlace", "Rebote", "Queja de spam", "Baja", "Detalle"];
  const rows = recipients.map((r) =>
    [
      r.email,
      r.name ?? "",
      r.company ?? "",
      recipientStage(r).label,
      date(r.sentAt),
      date(r.deliveredAt),
      date(r.openedAt),
      String(r.openCount),
      date(r.clickedAt),
      String(r.clickCount),
      r.lastClickUrl ?? "",
      r.bouncedAt ? `${date(r.bouncedAt)} ${r.bounceType ?? ""}`.trim() : "",
      date(r.complainedAt),
      date(r.unsubscribedAt),
      r.lastError ?? "",
    ].map((v) => sanitizeSpreadsheetCell(v))
  );
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = header.map((h, i) => ({ wch: i === 0 ? 32 : Math.min(40, Math.max(12, h.length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Destinatarios");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
  const slug = campaign.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "campana";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${slug}-resultados-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
