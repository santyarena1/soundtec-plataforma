/**
 * Orden de las secciones en el documento: el de la plantilla (QUOTE_MODULES),
 * no el guardado en cada cotización (en las viejas quedó mezclado, ej. la
 * garantía antes de la carta). Los módulos agregados a mano van antes del
 * cierre, en el orden en que se agregaron.
 */
export function orderQuoteSections<T extends { type: string; sortOrder: number }>(sections: T[], moduleOrder: readonly string[]): T[] {
  const rank = new Map(moduleOrder.map((key, index) => [key, index]));
  const closingRank = rank.get("closing") ?? moduleOrder.length;
  const keyOf = (s: T) => {
    const known = rank.get(s.type);
    // Los agregados a mano quedan justo antes del cierre, entre sí por sortOrder.
    return known ?? closingRank - 0.5;
  };
  return [...sections].sort((a, b) => keyOf(a) - keyOf(b) || a.sortOrder - b.sortOrder);
}
