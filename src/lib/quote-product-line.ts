/** Nombre en negrita + descripción corta para la planilla de la COT. */

export type QuoteLineProduct = {
  normalizedName: string;
  shortDescription: string | null;
  brand?: { name: string } | null;
} | null;

export function quoteItemDisplay(input: {
  description: string;
  product?: QuoteLineProduct;
}): { name: string; blurb: string | null } {
  const fromProduct = [input.product?.brand?.name, input.product?.normalizedName].filter(Boolean).join(" — ");
  const name = fromProduct || input.description.split("\n")[0]?.trim() || input.description;
  const blurb = input.product?.shortDescription?.trim() || null;
  return { name, blurb };
}

export function clipToWords(text: string, max = 22) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter(Boolean);
  if (words.length <= max) return cleaned;
  return `${words.slice(0, max).join(" ").replace(/[.,;:]+$/, "")}.`;
}

export function fallbackShortDescription(input: { name: string; brand?: string | null; category?: string | null }) {
  const who = [input.brand, input.name].filter(Boolean).join(" ");
  const use = input.category ? `para ${input.category}` : "para instalación audiovisual profesional";
  return clipToWords(`${who}: solución ${use}.`);
}
