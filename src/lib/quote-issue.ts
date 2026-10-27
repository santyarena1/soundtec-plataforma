import type { loadQuoteForUser } from "@/lib/quote-access";

export type QuoteForIssue = NonNullable<Awaited<ReturnType<typeof loadQuoteForUser>>["quote"]>;

export function quoteIssueCheck(quote: QuoteForIssue) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!quote.clientId && !quote.clientName?.trim()) errors.push("Falta el cliente: elegilo o escribí su nombre.");
  if (quote.items.length === 0) errors.push("No hay ítems en la planilla.");
  if (quote.items.some((i) => !i.excluded && !(Number(i.quantity) > 0))) errors.push("Hay cantidades en cero o negativas.");
  // Una fila sin plazo propio usa el plazo general de las condiciones (también en el PDF):
  // antes había que completarlo fila por fila y bloqueaba sin decir dónde.
  const rowsWithoutDelivery = quote.showDeliveryColumn && quote.items.some((i) => !i.deliveryKey && !i.excluded && !i.optional);
  if (rowsWithoutDelivery && !quote.terms?.deliveryText?.trim()) {
    errors.push("Falta el plazo de entrega: cargalo en Condiciones (vale para todas las filas).");
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
