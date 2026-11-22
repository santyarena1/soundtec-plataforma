import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { sanitizeSpreadsheetCell } from "@/lib/expo/spreadsheet";
import type { ReviewRow } from "@/lib/price-review/diff";

export const dynamic = "force-dynamic";

const STATUS = { PENDING: "Pendiente", APPLIED: "Aplicada", DISCARDED: "Descartada" } as const;

/** Excel de una revisión de cambio de precio: producto, lista, precio actual, nuevo, diferencia y %. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireStaff(["margins.manage", "discounts.manage"], { costs: true });
  const review = await prisma.priceReview.findUnique({ where: { id: params.id } });
  if (!review) return NextResponse.json({ error: "No existe." }, { status: 404 });
  const rows = (Array.isArray(review.items) ? review.items : []) as unknown as ReviewRow[];
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      Producto: sanitizeSpreadsheetCell(r.name),
      SKU: sanitizeSpreadsheetCell(r.sku ?? ""),
      Marca: sanitizeSpreadsheetCell(r.brand ?? ""),
      Lista: sanitizeSpreadsheetCell(r.audience),
      "Precio actual USD": r.beforeUsd,
      "Precio nuevo USD": r.afterUsd,
      "Diferencia USD": r.diffUsd,
      "Variación %": r.pct,
    }))
  );
  const info = XLSX.utils.aoa_to_sheet([
    ["Cambio", sanitizeSpreadsheetCell(review.title)],
    ["Estado", STATUS[review.status]],
    ["Pidió", sanitizeSpreadsheetCell(review.createdByName ?? "")],
    ["Fecha", review.createdAt.toISOString()],
    ["Decidió", sanitizeSpreadsheetCell(review.decidedByName ?? "")],
    ["Productos que cambian", review.affectedProducts],
    ["Total antes USD", review.totalBeforeUsd],
    ["Total después USD", review.totalAfterUsd],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Cambios");
  XLSX.utils.book_append_sheet(book, info, "Resumen");
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="revision-precios-${review.id}.xlsx"`,
    },
  });
}
