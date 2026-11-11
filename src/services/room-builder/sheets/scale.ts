/**
 * Escala del plano impreso: se elige la escala normalizada más grande (más
 * detalle) que entra en el área de dibujo de la lámina. Si la planta no entra
 * ni a 1:100, se pasa a escalas mayores y se marca como fuera de serie.
 */

/** Escalas normalizadas de arquitectura para planos de sala, de mayor a menor detalle. */
export const NORMALIZED_SCALES = [20, 25, 50, 75, 100] as const;
/** Respaldo para plantas grandes (proyecto completo): siguen siendo escalas reales, pero fuera de la serie pedida. */
const FALLBACK_SCALES = [125, 150, 200, 250, 500, 1000] as const;

export type PlanScale = {
  /** Denominador: 50 → 1:50. */
  denominator: number;
  /** true si es una de 1:20, 1:25, 1:50, 1:75, 1:100. */
  normalized: boolean;
};

/** mm de papel que ocupa una medida real (m) a escala 1:N. */
export const mmAtScale = (meters: number, denominator: number) => (meters * 1000) / denominator;

/** La escala más grande en la que la planta (m) entra en el área (mm). */
export function pickScale(extent: { widthM: number; depthM: number }, area: { widthMm: number; heightMm: number }): PlanScale {
  const fits = (n: number) => mmAtScale(extent.widthM, n) <= area.widthMm && mmAtScale(extent.depthM, n) <= area.heightMm;
  for (const n of NORMALIZED_SCALES) if (fits(n)) return { denominator: n, normalized: true };
  for (const n of FALLBACK_SCALES) if (fits(n)) return { denominator: n, normalized: false };
  return { denominator: FALLBACK_SCALES[FALLBACK_SCALES.length - 1], normalized: false };
}

/** Largo de la escala gráfica (m): el tramo redondo que ocupa entre 30 y 80 mm de papel. */
export function scaleBarMeters(denominator: number): number {
  const options = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50];
  return options.find((m) => mmAtScale(m, denominator) >= 30 && mmAtScale(m, denominator) <= 80) ?? options.find((m) => mmAtScale(m, denominator) >= 30) ?? 1;
}

export const scaleLabel = (s: PlanScale) => `1:${s.denominator}`;
