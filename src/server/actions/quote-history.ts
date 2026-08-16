"use server";

import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireQuotePermission } from "@/lib/quote-access";
import { revalidatePath } from "next/cache";

function cellText(v: unknown) {
  if (v == null) return "";
  return String(v).trim();
}

function looksLibre(name: string) {
  return /^libre/i.test(name.trim());
}

export async function ingestHistoricalWorkbook(formData: FormData): Promise<{ ok: boolean; error?: string; sheets?: number; lines?: number }> {
  await requireQuotePermission("quotes.manage_library");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Subí el Excel de planillas." };
  if (file.size > 40 * 1024 * 1024) {
    return { ok: false, error: "El archivo supera los 40 MB. Dividí el Excel y subilo por partes." };
  }

  let sheets = 0;
  let lines = 0;

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });

    for (const sheetName of wb.SheetNames) {
      if (looksLibre(sheetName)) continue;
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: "" });
      const parsed: { description: string; quantity: number | null }[] = [];
      for (const row of rows) {
        const cells = Array.isArray(row) ? row.map(cellText) : [];
        const qtyCell = cells.find(
          (c) => /^\d+([.,]\d+)?$/.test(c) && Number(c.replace(",", ".")) > 0 && Number(c.replace(",", ".")) < 10000
        );
        const desc = cells
          .filter((c) => c.length > 8 && !/^\d+([.,]\d+)?$/.test(c))
          .sort((a, b) => b.length - a.length)[0];
        if (!desc) continue;
        if (/cantidad|descripcion|detalle|unitario|total|sku/i.test(desc) && desc.length < 40) continue;
        parsed.push({
          description: desc.slice(0, 2000),
          quantity: qtyCell ? Number(qtyCell.replace(",", ".")) : null,
        });
      }
      if (parsed.length < 2) continue;

      const capped = parsed.slice(0, 200);
      const sheet = await prisma.historicalQuoteSheet.create({
        data: {
          sheetName,
          sourceFile: file.name || "Planillas de Cotizacion.xlsx",
          projectHint: sheetName,
        },
      });
      await prisma.historicalQuoteLine.createMany({
        data: capped.map((p) => ({
          sheetId: sheet.id,
          description: p.description,
          quantity: p.quantity != null ? new Prisma.Decimal(p.quantity) : null,
        })),
      });
      sheets += 1;
      lines += capped.length;
    }
  } catch (error) {
    console.error("ingestHistoricalWorkbook", error);
    const detail = error instanceof Error ? error.message : "error desconocido";
    return { ok: false, error: `No se pudo leer el Excel (${detail}). Verificá que sea .xlsx o .xls válido.`, sheets, lines };
  }

  revalidatePath("/admin/quotes/history");
  if (sheets === 0) {
    return { ok: false, error: "No se encontraron hojas con planillas reconocibles en el archivo.", sheets, lines };
  }
  return { ok: true, sheets, lines };
}

export async function suggestHistoricalCompanions(productIds: string[]) {
  if (productIds.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, normalizedName: true, modelNumber: true, supplierSku: true, brand: { select: { name: true } } },
  });
  const tokens = products
    .flatMap((p) => [p.modelNumber, p.supplierSku, p.normalizedName.split(/\s+/).pop()])
    .filter((t): t is string => Boolean(t && t.length >= 3));
  if (tokens.length === 0) return [];

  const lines = await prisma.historicalQuoteLine.findMany({
    where: {
      OR: tokens.slice(0, 12).map((t) => ({ description: { contains: t, mode: "insensitive" as const } })),
    },
    take: 80,
    select: { sheetId: true },
  });
  const sheetIds = [...new Set(lines.map((l) => l.sheetId))];
  if (sheetIds.length === 0) return [];
  const companions = await prisma.historicalQuoteLine.findMany({
    where: { sheetId: { in: sheetIds } },
    take: 400,
    select: { description: true },
  });
  const already = new Set(tokens.map((t) => t.toLowerCase()));
  const counts = new Map<string, number>();
  for (const c of companions) {
    const key = c.description.slice(0, 80);
    if (already.has(key.toLowerCase())) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([description, count]) => ({ description, count }));
}
