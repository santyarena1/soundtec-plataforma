"use server";

import { loadQuoteForUser } from "@/lib/quote-access";
import { computeQuoteTotals } from "@/lib/quote-totals";
import { quoteItemDisplay } from "@/lib/quote-product-line";

/** Resumen chico de una cotización para el desplegable del listado (solo lectura). */
export type QuoteSummary =
  | {
      ok: true;
      client: string | null;
      contact: string | null;
      reference: string | null;
      owner: string;
      validityDays: number | null;
      paymentTerms: string | null;
      taxMode: string;
      items: Array<{ id: string; name: string; quantity: number; unit: string; unitPriceUsd: number; lineTotalUsd: number; note: "opcional" | "afuera" | null }>;
      totals: { net: number; tax: number; total: number };
    }
  | { ok: false; error: string };

export async function loadQuoteSummary(quoteId: string): Promise<QuoteSummary> {
  const { quote } = await loadQuoteForUser(quoteId);
  if (!quote) return { ok: false, error: "No tenés acceso a esta cotización." };
  const totals = computeQuoteTotals(quote.items, quote.taxMode);
  return {
    ok: true,
    client: quote.client?.companyName ?? quote.clientName ?? null,
    contact: quote.contactName,
    reference: quote.reference,
    owner: quote.owner.name ?? "",
    validityDays: quote.terms?.validityDays ?? null,
    paymentTerms: quote.terms?.paymentTerms ?? null,
    taxMode: quote.taxMode,
    items: quote.items.map((item) => ({
      id: item.id,
      name: quoteItemDisplay({ description: item.description, product: item.product }).name,
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPriceUsd: Number(item.unitPriceUsd),
      lineTotalUsd: Number(item.lineTotalUsd),
      note: item.excluded ? "afuera" : item.optional ? "opcional" : null,
    })),
    totals: { net: totals.net, tax: totals.tax, total: totals.total },
  };
}
