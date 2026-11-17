/**
 * Qué productos puede recomendar el asistente.
 *
 * El dato fuerte es `isDiscontinued` (lo carga el sync del fabricante). Pero
 * hay fichas que el flag no alcanzó y que dicen en el texto que el producto
 * ya no se fabrica ("Discontinued SKU", "This product has been discontinued",
 * "Producto discontinuado."). Esas también quedan afuera.
 *
 * El texto se mira con cuidado: muchas fichas nombran un modelo discontinuado
 * para decir que lo reemplazan ("replaces the discontinued TSW-760"). Por eso
 * solo cuentan las frases que afirman que ESTE producto está discontinuado.
 */

/** Filtro de base: activo y no marcado como discontinuado. */
export const AVAILABLE_PRODUCT_WHERE = { isActive: true, isDiscontinued: false } as const;

const DISCONTINUED_PATTERNS: RegExp[] = [
  // "This product has been discontinued", "This item is discontinued".
  /\bthis\s+(?:product|item|model|unit|sku)\s+(?:has\s+been|is|was)\s+(?:now\s+)?discontinued\b/i,
  // "Discontinued SKU - New version expected…", "Discontinued." al arrancar una frase.
  /(?:^|[.!:;\n•|-]\s*)discontinued\s*(?:sku|product|item|model)?\s*(?:[.!:;\n-]|$)/i,
  // "Product discontinued", "Model discontinued" como frase propia.
  /(?:^|[.!:;\n•|]\s*)(?:product|model|item)\s+(?:is\s+)?discontinued\b/i,
  // "Producto discontinuado.", "Este modelo fue discontinuado".
  /(?:^|[.!:;\n•|]\s*)(?:este\s+|el\s+)?(?:producto|modelo|art[ií]culo|equipo)\s+(?:fue\s+|est[áa]\s+|ha\s+sido\s+|se\s+encuentra\s+)?discontinuad[oa]\b/i,
];

function plain(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿El texto afirma que el producto está discontinuado? */
export function textSaysDiscontinued(value: string | null | undefined): boolean {
  const text = plain(value);
  if (!text || !/discontinu/i.test(text)) return false;
  return DISCONTINUED_PATTERNS.some((pattern) => pattern.test(text));
}

export interface AvailabilityFields {
  isActive?: boolean | null;
  isDiscontinued?: boolean | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  htmlContent?: string | null;
}

/** El producto se puede recomendar: activo, sin flag y sin texto de discontinuado. */
export function isRecommendable(row: AvailabilityFields): boolean {
  if (row.isActive === false) return false;
  if (row.isDiscontinued) return false;
  return !(
    textSaysDiscontinued(row.shortDescription) ||
    textSaysDiscontinued(row.longDescription) ||
    textSaysDiscontinued(row.htmlContent)
  );
}

export function onlyRecommendable<T extends AvailabilityFields>(rows: T[]): T[] {
  return rows.filter(isRecommendable);
}
