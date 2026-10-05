import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { slugify } from "@/lib/utils";
import { sanitizeSpreadsheetCell } from "@/lib/expo/spreadsheet";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission("settings.manage");
  const { id } = await params;
  const event = await prisma.expoEvent.findUnique({ where: { id }, select: { name: true } });
  if (!event) return NextResponse.json({ error: "No existe" }, { status: 404 });
  const leads = await prisma.visitorLead.findMany({ where: { eventId: id }, orderBy: { createdAt: "asc" }, include: { qr: { select: { label: true } } } });
  // Todo lo que tipeó el visitante (y la etiqueta del QR) pasa por el sanitizador anti-fórmulas.
  const cell = (value: string | null | undefined) => sanitizeSpreadsheetCell(value ?? "");
  const rows = [
    ["Fecha", "Mail", "Nombre", "Empresa", "Teléfono", "Interés", "QR"],
    ...leads.map((l) => [
      l.createdAt.toISOString().slice(0, 16).replace("T", " "),
      cell(l.email), cell(l.name), cell(l.company), cell(l.phone), cell(l.interest), cell(l.qr?.label),
    ]),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Leads");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="leads-${slugify(event.name)}.xlsx"`,
    },
  });
}
