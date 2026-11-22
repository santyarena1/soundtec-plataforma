/**
 * Texto del chip de serie en la tarjeta del catálogo: «Serie Horizon». Solo la
 * serie del fabricante (ProductLine); la familia vieja («Accessory», «Grille»,
 * «Comercial») no se muestra nunca.
 */
export function seriesChipLabel(item: { seriesName?: string | null }): string | null {
  const name = item.seriesName?.trim();
  return name ? `Serie ${name}` : null;
}

/** Título del bloque de la ficha: «Más de la serie Landscape». */
export function moreFromSeriesTitle(seriesName: string): string {
  return `Más de la serie ${seriesName.trim()}`;
}
