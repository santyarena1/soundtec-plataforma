/**
 * El logo de Crestron Home es un isotipo casi cuadrado dentro del mismo lienzo
 * ancho (960×240) que usan las demás marcas. Con «contain» quedaba diminuto al
 * lado de los logos horizontales; con «cover» se recorta el aire de los
 * costados y queda del mismo peso visual que el resto.
 */
const COMPACT_LOGO_IDS = new Set(["crestron-home"]);

export function brandLogoFit(brandId: string): { compact: boolean } {
  return { compact: COMPACT_LOGO_IDS.has(brandId) };
}
