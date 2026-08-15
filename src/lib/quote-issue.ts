import type { loadQuoteForUser } from "@/lib/quote-access";

export type QuoteForIssue = NonNullable<Awaited<ReturnType<typeof loadQuoteForUser>>["quote"]>;

export function quoteIssueCheck(quote: QuoteForIssue) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!quote.clientId) errors.push("Falta asignar cliente.");
  if (quote.items.length === 0) errors.push("No hay ítems en la planilla.");
  if (quote.items.some((i) => Number(i.quantity) <= 0)) errors.push("Hay cantidades en cero o negativas.");
  if (quote.showDeliveryColumn && quote.items.some((i) => !i.deliveryKey && !i.excluded && !i.optional)) {
    errors.push("Falta completar entrega en filas no opcionales.");
  }
  const placeholders = quote.sections.filter((s) => s.included && /\[a confirmar\]|TODO|lorem/i.test(s.body));
  if (placeholders.length) warnings.push("Hay textos con placeholder ([a confirmar]).");
  if (!quote.owner.quoteSignName && !quote.owner.name) warnings.push("Cargá el nombre de firma.");
  if (quote.items.some((i) => i.kind === "PRODUCT" && !i.productId)) errors.push("Hay un producto sin vínculo al catálogo.");
  if (!quote.assets.some((a) => a.kind === "PRODUCT") && quote.items.some((i) => i.productId)) {
    warnings.push("Faltan fotos de producto. Completalas en el paso Imágenes.");
  }
  return { errors, warnings };
}
