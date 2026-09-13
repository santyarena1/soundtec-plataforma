/** Nombre en negrita + descripción corta para la planilla de la COT. */

export type QuoteLineProduct = {
  normalizedName: string;
  shortDescription: string | null;
  brand?: { name: string } | null;
} | null;

/**
 * La primera línea de la descripción es el título de la fila; lo que venga
 * debajo es la descripción de ESA línea.
 *
 * Antes el texto de abajo salía siempre de la ficha del producto, así que
 * ajustarlo para una cotización puntual obligaba a editar el catálogo y
 * cambiaba todas las demás. Con esto, cada cotización puede decir lo suyo y la
 * ficha queda como respaldo cuando no se escribió nada.
 */
export function quoteItemDisplay(input: {
  description: string;
  product?: QuoteLineProduct;
}): { name: string; blurb: string | null } {
  const fromProduct = [input.product?.brand?.name, input.product?.normalizedName].filter(Boolean).join(" — ");
  const [firstLine, ...rest] = input.description.split("\n");
  const name = firstLine?.trim() || fromProduct || input.description;
  const ownBlurb = rest.join("\n").trim();
  const blurb = ownBlurb || input.product?.shortDescription?.trim() || null;
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
