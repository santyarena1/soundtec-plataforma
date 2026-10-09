/**
 * Dimensionado de equipos según el ambiente: tamaño de pantalla por
 * distancia de visión y elección del producto según el nivel (esencial,
 * recomendado, premium) sin dejar lugares vacíos por un puntaje mal escalado.
 */

import type { BriefTier } from "./brief";

/** Tamaños comerciales de pantalla (pulgadas). */
export const DISPLAY_SIZES_IN = [32, 43, 50, 55, 65, 75, 85, 98] as const;
const IN_TO_M = 0.0254;
/** Alto de imagen 16:9 = 0.4903 × diagonal; ancho = 0.8716 × diagonal. */
const H_PER_DIAG = 0.4903;
const W_PER_DIAG = 0.8716;
/**
 * Corporativo/educación (AVIXA, lectura de detalle): el último espectador a
 * no más de 6 alturas de imagen. Hogar/hotel (SMPTE ~30°): diagonal ≈ 0.62 ×
 * distancia al sillón.
 */
const AVIXA_HEIGHTS = 6;
const CINEMA_DIAG_PER_DIST = 0.615;
/** Dónde se sienta el más lejano / el sillón, en fracción de la profundidad. */
const FARTHEST_SEAT = 0.85;
const SOFA_SEAT = 0.6;
const HOME_CATEGORIES = new Set(["residential", "hotel"]);

/** Pulgadas recomendadas para la pantalla principal del ambiente. */
export function targetDisplayInches(dims: { depthM: number }, category: string): number {
  const home = HOME_CATEGORIES.has(category);
  const distance = Math.max(1.5, dims.depthM * (home ? SOFA_SEAT : FARTHEST_SEAT));
  const diagM = home ? distance * CINEMA_DIAG_PER_DIST : distance / AVIXA_HEIGHTS / H_PER_DIAG;
  const inches = diagM / IN_TO_M;
  return DISPLAY_SIZES_IN.find((s) => s >= inches) ?? DISPLAY_SIZES_IN[DISPLAY_SIZES_IN.length - 1];
}

/** Pulgadas escritas en el nombre ("TV 65\"", "75 pulgadas", "QM85C"). */
export function inchesFromName(name: string | null | undefined): number | null {
  if (!name) return null;
  const explicit = /(\d{2,3})\s*(?:"|”|''|pulgadas|pulg\.?|in\b|inch)/i.exec(name);
  const n = explicit ? Number(explicit[1]) : null;
  return n && n >= 20 && n <= 120 ? n : null;
}

/** Pulgadas a partir del ancho real del equipo (cm). */
export function inchesFromWidthCm(widthCm: number | null | undefined): number | null {
  if (!widthCm || widthCm < 40 || widthCm > 300) return null;
  return Math.round(widthCm / 100 / W_PER_DIAG / IN_TO_M);
}

/** Lo mínimo que tiene que tener una fila del ranking para elegirla. */
export type PickRow = { productId: string; compatible: boolean; score: number; priceUsd: number | null; preferredBrand?: boolean; diagonalIn?: number | null };

/** Puntaje mínimo (modo recomendado, 0..100) para asignar solo. */
export const AUTO_FILL_MIN_SCORE = 25;
/** Margen alrededor del tamaño ideal de pantalla (pulgadas). */
const DISPLAY_SLACK_IN = { below: 10, above: 13 };

/**
 * Elige el producto para un lugar. Las filas vienen ordenadas por el modo
 * "recomendado" (calidad); el nivel solo decide entre las que pasan el corte:
 * esencial = la más barata, premium = la más cara, recomendado = la mejor.
 */
export function pickForTier<T extends PickRow>(rows: T[], tier: BriefTier, opts?: { targetInches?: number | null; minScore?: number }): T | null {
  const min = opts?.minScore ?? AUTO_FILL_MIN_SCORE;
  let pool = rows.filter((r) => r.compatible && r.score >= min);
  if (!pool.length) return null;
  // Marcas pedidas primero.
  if (pool.some((r) => r.preferredBrand)) pool = pool.filter((r) => r.preferredBrand);
  // Pantallas: del tamaño que corresponde al ambiente, si hay.
  const target = opts?.targetInches;
  if (target) {
    const sized = pool.filter((r) => r.diagonalIn != null && r.diagonalIn >= target - DISPLAY_SLACK_IN.below && r.diagonalIn <= target + DISPLAY_SLACK_IN.above);
    if (sized.length) pool = [...sized].sort((a, b) => Math.abs((a.diagonalIn ?? 0) - target) - Math.abs((b.diagonalIn ?? 0) - target));
  }
  const priced = pool.filter((r) => r.priceUsd != null && r.priceUsd > 0);
  if (tier === "esencial" && priced.length) return priced.reduce((a, b) => ((b.priceUsd ?? 0) < (a.priceUsd ?? 0) ? b : a));
  if (tier === "premium" && priced.length) return priced.reduce((a, b) => ((b.priceUsd ?? 0) > (a.priceUsd ?? 0) ? b : a));
  return pool[0] ?? null;
}

/** Clave de modelo 3D de una pantalla ("tv_75") con sus pulgadas reales: ficha, nombre o ancho. */
export function displayProxyKey(p: { diagonalIn?: unknown; name?: string | null; widthCm?: unknown }): string | null {
  const fromProfile = p.diagonalIn == null ? null : Number(p.diagonalIn);
  const inches =
    (fromProfile && Number.isFinite(fromProfile) && fromProfile >= 20 && fromProfile <= 120 ? Math.round(fromProfile) : null) ??
    inchesFromName(p.name) ??
    inchesFromWidthCm(p.widthCm == null ? null : Number(p.widthCm));
  return inches ? `tv_${inches}` : null;
}
