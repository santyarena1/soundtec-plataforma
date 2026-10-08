import type { DesignRole, DeviceCoverage } from "./types";

const ROLE_LIMITS: Record<
  string,
  { hfov?: [number, number]; range?: [number, number]; micRadius?: [number, number] }
> = {
  camera: { hfov: [30, 120], range: [1, 25] },
  mic: { micRadius: [0.5, 12] },
  display: {},
  speaker: {},
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function pctBand(base: number, pct: number, absolute: [number, number]): [number, number] {
  const lo = Math.max(absolute[0], base * (1 - pct));
  const hi = Math.min(absolute[1], base * (1 + pct));
  return [lo, hi];
}

/** Aplica un override de cobertura con límites (modificable, no libre). */
export function applyCoverageOverride(
  role: DesignRole,
  base: DeviceCoverage,
  patch: Partial<DeviceCoverage>,
): DeviceCoverage {
  const limits = ROLE_LIMITS[role] ?? {};
  const next: DeviceCoverage = { ...base, ...patch, source: "project_override" };

  if (next.hfovDeg != null && base.hfovDeg != null && limits.hfov) {
    const [lo, hi] = pctBand(base.hfovDeg, 0.2, limits.hfov);
    next.hfovDeg = clamp(next.hfovDeg, lo, hi);
  } else if (next.hfovDeg != null && limits.hfov) {
    next.hfovDeg = clamp(next.hfovDeg, limits.hfov[0], limits.hfov[1]);
  }

  if (next.maxRangeM != null && base.maxRangeM != null && limits.range) {
    const [lo, hi] = pctBand(base.maxRangeM, 0.25, limits.range);
    next.maxRangeM = clamp(next.maxRangeM, lo, hi);
  }

  if (next.micRadiusM != null && base.micRadiusM != null && limits.micRadius) {
    const [lo, hi] = pctBand(base.micRadiusM, 0.25, limits.micRadius);
    next.micRadiusM = clamp(next.micRadiusM, lo, hi);
  }

  if (next.viewMinM != null && next.viewMaxM != null && next.viewMinM > next.viewMaxM) {
    const tmp = next.viewMinM;
    next.viewMinM = next.viewMaxM;
    next.viewMaxM = tmp;
  }

  if (base.viewMinM != null && next.viewMinM != null) {
    const [lo, hi] = pctBand(base.viewMinM, 0.2, [0.5, 40]);
    next.viewMinM = clamp(next.viewMinM, lo, hi);
  }
  if (base.viewMaxM != null && next.viewMaxM != null) {
    const [lo, hi] = pctBand(base.viewMaxM, 0.2, [0.5, 40]);
    next.viewMaxM = clamp(next.viewMaxM, lo, hi);
  }

  return next;
}

export function resetCoverageToBase(base: DeviceCoverage): DeviceCoverage {
  return { ...base, source: base.source === "missing" ? "missing" : "datasheet" };
}

/**
 * Fit 0..1 de cobertura de cámara respecto al ancho de zona objetivo
 * (aprox. mesa / fila de asientos) a una distancia dada.
 */
export function cameraCoverageFit(input: {
  hfovDeg: number | null | undefined;
  maxRangeM: number | null | undefined;
  targetWidthM: number;
  distanceM: number;
}): number | null {
  if (input.hfovDeg == null || !Number.isFinite(input.hfovDeg) || input.hfovDeg <= 0) {
    return null;
  }
  if (input.distanceM <= 0 || input.targetWidthM <= 0) return 0;
  if (input.maxRangeM != null && input.distanceM > input.maxRangeM) {
    return 0.15;
  }
  const halfAngle = (input.hfovDeg * Math.PI) / 360;
  const coveredWidth = 2 * input.distanceM * Math.tan(halfAngle);
  const ratio = coveredWidth / input.targetWidthM;
  if (ratio >= 1.05 && ratio <= 1.6) return 1;
  if (ratio >= 0.9 && ratio < 1.05) return 0.85;
  if (ratio > 1.6 && ratio <= 2.2) return 0.75;
  if (ratio >= 0.7) return 0.55;
  return clamp(ratio, 0, 0.45);
}

/** Fit de mic: radio vs diagonal de zona de asientos. */
export function micCoverageFit(input: {
  radiusM: number | null | undefined;
  zoneRadiusM: number;
}): number | null {
  if (input.radiusM == null || !Number.isFinite(input.radiusM) || input.radiusM <= 0) {
    return null;
  }
  if (input.zoneRadiusM <= 0) return 0;
  const ratio = input.radiusM / input.zoneRadiusM;
  if (ratio >= 0.95 && ratio <= 1.4) return 1;
  if (ratio >= 0.8) return 0.8;
  if (ratio >= 0.6) return 0.55;
  if (ratio > 1.4 && ratio <= 2) return 0.7;
  return clamp(ratio, 0, 0.4);
}

/** Fit de display por distancia de visionado. */
export function displayViewingFit(input: {
  viewMinM: number | null | undefined;
  viewMaxM: number | null | undefined;
  seatingDistanceM: number;
}): number | null {
  if (
    (input.viewMinM == null && input.viewMaxM == null) ||
    input.seatingDistanceM <= 0
  ) {
    return null;
  }
  const min = input.viewMinM ?? 0;
  const max = input.viewMaxM ?? Number.POSITIVE_INFINITY;
  if (input.seatingDistanceM >= min && input.seatingDistanceM <= max) return 1;
  if (input.seatingDistanceM < min) {
    const gap = min - input.seatingDistanceM;
    return clamp(1 - gap / Math.max(min, 0.5), 0.2, 0.7);
  }
  const gap = input.seatingDistanceM - max;
  return clamp(1 - gap / Math.max(max, 1), 0.15, 0.65);
}

/** Heurística de viewing distance por diagonal en pulgadas (si no hay ficha). */
export function viewingDistanceFromDiagonalIn(diagonalIn: number): {
  viewMinM: number;
  viewMaxM: number;
} {
  const d = Math.max(24, diagonalIn);
  // ~1x–3.2x diagonal (regla UC simplificada), diagonal en metros
  const diagM = (d * 0.0254);
  return {
    viewMinM: Math.round(diagM * 1.0 * 100) / 100,
    viewMaxM: Math.round(diagM * 3.2 * 100) / 100,
  };
}

export type SeatCoverageLabel = "optimal" | "acceptable" | "insufficient" | "no_data";

export function labelFromFit(fit: number | null): SeatCoverageLabel {
  if (fit == null) return "no_data";
  if (fit >= 0.85) return "optimal";
  if (fit >= 0.55) return "acceptable";
  return "insufficient";
}
