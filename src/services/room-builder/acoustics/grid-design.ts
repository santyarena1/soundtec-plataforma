/**
 * Diseñador de grilla de parlantes de techo. Con la cobertura del parlante y
 * la distancia techo–oído se calcula el radio de cobertura en el plano de
 * escucha (r = (h_techo − h_oído) · tan(θ/2), θ = ángulo a −6 dB) y la
 * separación según el criterio:
 *
 *   borde a borde   s = 2·r     (los círculos se tocan: menos parlantes, huecos en las diagonales)
 *   mínimo solape   s = √2·r    (grilla cuadrada sin huecos: los círculos cubren las esquinas)
 *   borde a centro  s = r       (cada parlante llega al centro del vecino: máxima uniformidad)
 *
 * La cantidad es la mínima de la grilla que cumple la separación en el área
 * (filas × columnas sobre la caja del piso, sin las que caen fuera de la
 * forma real). Después se elige el menor tap de 70/100 V que lleva el SPL
 * promedio al objetivo del uso + margen para picos, con el mismo motor del
 * mapa (directo + reverberante).
 */

import { pointInPolygon } from "../plan-polygon";
import type { LineVolts } from "../amp-load";
import { USE_TARGETS } from "./materials";
import { computeSoundMap, operatingLevel, type SoundStats } from "./sound-map";
import type { ResolvedAcoustics } from "./settings";
import { ceilingAxes, type SoundSource } from "./source";

export type GridCriterion = "edge-to-edge" | "min-overlap" | "edge-to-center";

export const GRID_CRITERIA: Record<GridCriterion, { label: string; factor: number; hint: string }> = {
  "edge-to-edge": { label: "Borde a borde", factor: 2, hint: "menos parlantes; música de fondo" },
  "min-overlap": { label: "Mínimo solape", factor: Math.SQRT2, hint: "sin huecos; voz y música" },
  "edge-to-center": { label: "Borde a centro", factor: 1, hint: "máxima uniformidad; voz crítica" },
};

/** Margen sobre el nivel de operación para los picos del programa (dB). */
export const PEAK_HEADROOM_DB = 6;
/** Distancia del parlante al cielorraso (m), la misma de la escena. */
const CEILING_DROP_M = 0.05;
/** Radio mínimo de cobertura para no proponer grillas absurdas en techos bajos (m). */
const MIN_RADIUS_M = 0.5;

type Pt = { x: number; y: number };

export type GridSpeaker = {
  label: string;
  sensitivityDb: number;
  /** Ángulo de cobertura cónico a −6 dB (°): el menor entre horizontal y vertical. */
  coverageDeg: number;
  /** Taps del transformador en la tensión elegida (W); vacío = baja impedancia. */
  taps: number[];
  volts: LineVolts | null;
  /** Potencia continua de ficha (W), tope en baja impedancia. */
  continuousW: number | null;
  estimates: string[];
};

export type GridProposal = {
  criterion: GridCriterion;
  positions: Pt[];
  count: number;
  spacingM: number;
  radiusM: number;
  /** Tap elegido (70/100 V) o null en baja impedancia. */
  tapW: number | null;
  volts: LineVolts | null;
  /** Baja impedancia: potencia por parlante necesaria (W). */
  requiredW: number | null;
  /** Nivel promedio buscado (operación + margen de picos). */
  targetDb: number;
  reaches: boolean;
  stats: SoundStats | null;
  notes: string[];
};

const fmt = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

/** Radio de cobertura en el plano de escucha (m). */
export function coverageRadius(ceilingM: number, earM: number, coverageDeg: number): number {
  const h = Math.max(0.3, ceilingM - CEILING_DROP_M - earM);
  return Math.max(MIN_RADIUS_M, h * Math.tan(((Math.min(170, Math.max(20, coverageDeg)) / 2) * Math.PI) / 180));
}

/** Posiciones de la grilla: centros de filas × columnas dentro del piso. */
export function gridPositions(floor: Pt[], spacingM: number): Pt[] {
  const xs = floor.map((p) => p.x);
  const ys = floor.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const W = Math.max(...xs) - minX;
  const D = Math.max(...ys) - minY;
  const cols = Math.max(1, Math.ceil(W / spacingM - 1e-6));
  const rows = Math.max(1, Math.ceil(D / spacingM - 1e-6));
  const pts: Pt[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = { x: Math.round((minX + (W / cols) * (c + 0.5)) * 100) / 100, y: Math.round((minY + (D / rows) * (r + 0.5)) * 100) / 100 };
      if (pointInPolygon(p, floor)) pts.push(p);
    }
  }
  if (!pts.length) pts.push({ x: minX + W / 2, y: minY + D / 2 });
  return pts;
}

function gridSources(positions: Pt[], ceilingM: number, spk: GridSpeaker, watts: number): SoundSource[] {
  const y = ceilingM - CEILING_DROP_M;
  return positions.map((p, i) => ({
    id: `grid#${i}`,
    label: `${spk.label} (${i + 1})`,
    deviceId: "grid",
    pos: { x: p.x, y, z: p.y },
    ...ceilingAxes(0),
    coverage: { horizontal: spk.coverageDeg, vertical: spk.coverageDeg },
    sensitivityDb: spk.sensitivityDb,
    watts,
    estimates: spk.estimates,
  }));
}

/** Propuesta de grilla para un criterio: posiciones, tap y resultado del mapa con esa grilla. */
export function designGrid(input: { floor: Pt[]; heightM: number; speaker: GridSpeaker; settings: ResolvedAcoustics; criterion: GridCriterion }): GridProposal {
  const { floor, heightM, speaker, settings, criterion } = input;
  const radius = coverageRadius(heightM, settings.earM, speaker.coverageDeg);
  const spacing = radius * GRID_CRITERIA[criterion].factor;
  const positions = gridPositions(floor, spacing);
  const target = operatingLevel(settings.use) + PEAK_HEADROOM_DB;
  // Todas las unidades con la misma potencia: el SPL escala exacto con 10·log10(W).
  const ref = computeSoundMap({ floor, heightM, sources: gridSources(positions, heightM, speaker, 1), settings });
  const avg1 = ref.stats?.splAvg ?? -Infinity;
  const needW = 10 ** ((target - avg1) / 10);
  const notes: string[] = [];
  let tapW: number | null = null;
  let requiredW: number | null = null;
  let watts: number;
  const taps = [...speaker.taps].filter((t) => t > 0).sort((a, b) => a - b);
  if (taps.length) {
    tapW = taps.find((t) => t >= needW - 1e-9) ?? taps[taps.length - 1]!;
    watts = tapW;
    if (tapW < needW) notes.push(`Ni el tap mayor (${fmt(tapW, 0)} W) llega a ${fmt(target)} dB: subí la cantidad (criterio más denso) o elegí un parlante más sensible.`);
  } else {
    requiredW = Math.round(needW * 10) / 10;
    watts = speaker.continuousW != null ? Math.min(needW, speaker.continuousW) : needW;
    notes.push(`Baja impedancia: cada parlante necesita ≈ ${fmt(requiredW)} W para ${fmt(target)} dB (sin taps: el nivel lo fija el amplificador).`);
    if (speaker.continuousW != null && needW > speaker.continuousW) notes.push(`Supera la potencia continua del parlante (${fmt(speaker.continuousW, 0)} W).`);
  }
  const final = computeSoundMap({ floor, heightM, sources: gridSources(positions, heightM, speaker, watts), settings });
  const reaches = (final.stats?.splAvg ?? -Infinity) >= target - 0.5;
  notes.push(`Radio de cobertura ${fmt(radius, 2)} m a ${fmt(settings.earM, 1)} m de altura de oído; separación ${fmt(spacing, 2)} m (${GRID_CRITERIA[criterion].label.toLowerCase()}).`);
  notes.push(`Objetivo: ${fmt(operatingLevel(settings.use))} dB de operación (${USE_TARGETS[settings.use].label.toLowerCase()}) + ${PEAK_HEADROOM_DB} dB de margen para picos.`);
  return { criterion, positions, count: positions.length, spacingM: spacing, radiusM: radius, tapW, volts: tapW != null ? speaker.volts : null, requiredW, targetDb: target, reaches, stats: final.stats, notes };
}

/** Las tres propuestas (de menos a más parlantes). */
export function designGrids(input: Omit<Parameters<typeof designGrid>[0], "criterion">): GridProposal[] {
  return (Object.keys(GRID_CRITERIA) as GridCriterion[]).map((criterion) => designGrid({ ...input, criterion }));
}
