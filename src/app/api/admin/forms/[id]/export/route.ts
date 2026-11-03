import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireStaff } from "@/lib/auth-helpers";
import { sanitizeSpreadsheetCell } from "@/lib/expo/spreadsheet";
import { loadFormResponses } from "@/lib/forms/responses";

/** Respuestas de un formulario en Excel: una fila por persona, una columna por pregunta. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireStaff("forms.manage");
  const { id } = await ctx.params;
  const data = await loadFormResponses(id);
  if (!data) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const header = ["Fecha", ...data.columns.map((c) => (c.removed ? `${c.title} (quitada)` : c.title))];
  const rows = data.rows.map((r) => [
    r.submittedAt.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }),
    ...data.columns.map((c) => sanitizeSpreadsheetCell(r.cells[c.id] ?? "")),
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = header.map((h, i) => ({ wch: i === 0 ? 20 : Math.min(48, Math.max(14, h.length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Respuestas");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
  const slug = data.form.title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "formulario";
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${slug}-respuestas-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
