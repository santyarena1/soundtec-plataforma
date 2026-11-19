import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { payableLines } from "@/lib/quote-totals";
import { primaryAlternativeItems } from "@/lib/quote-alternatives";

/** Validez por defecto de una cotización (igual que el listado de cotizaciones). */
export const DEFAULT_VALIDITY_DAYS = 5;
/** Ventana para buscar cotizaciones «abiertas»: lo que no se tocó en 4 meses ya no está en juego. */
export const OPEN_QUOTE_WINDOW_DAYS = 120;

/** Cuándo vence una cotización con PDF (fecha de emisión + validez). */
export function quoteExpiresAt(issuedAt: Date | null, validityDays: number | null | undefined): Date | null {
  return issuedAt ? new Date(issuedAt.getTime() + (validityDays ?? DEFAULT_VALIDITY_DAYS) * 86_400_000) : null;
}

/** Abierta: borrador, en revisión, lista, o con PDF todavía vigente. */
export function openQuoteWhere(now: Date): Prisma.QuoteWhereInput {
  const windowStart = new Date(now.getTime() - OPEN_QUOTE_WINDOW_DAYS * 86_400_000);
  return {
    OR: [
      { status: { in: ["DRAFT", "IN_REVIEW", "READY"] }, updatedAt: { gte: windowStart } },
      { status: "ISSUED", issuedAt: { gte: windowStart } },
    ],
  };
}

export const QUOTE_AMOUNT_SELECT = {
  items: { select: { lineTotalUsd: true, excluded: true, optional: true, ivaRate: true, alternativeId: true } },
  alternatives: { select: { id: true, name: true, isDefault: true, sortOrder: true } },
} satisfies Prisma.QuoteSelect;

type AmountRow = Prisma.QuoteGetPayload<{ select: typeof QUOTE_AMOUNT_SELECT }>;

/**
 * Total neto USD de una cotización, igual que el listado de cotizaciones:
 * la alternativa por defecto y sin las filas «dejar afuera».
 */
export function quoteNetUsd(row: AmountRow): number {
  return payableLines(primaryAlternativeItems(row.items, row.alternatives)).reduce((sum, item) => sum + Number(item.lineTotalUsd), 0);
}

/** Suma los netos de varias cotizaciones (por id). */
export async function sumQuoteNet(where: Prisma.QuoteWhereInput): Promise<{ count: number; amount: number }> {
  const rows = await prisma.quote.findMany({ where, select: QUOTE_AMOUNT_SELECT });
  return { count: rows.length, amount: rows.reduce((sum, row) => sum + quoteNetUsd(row), 0) };
}
