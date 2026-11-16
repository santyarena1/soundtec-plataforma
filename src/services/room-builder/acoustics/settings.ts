/**
 * Parámetros acústicos del ambiente: lo que el usuario fijó (guardado en la
 * escena) completado con el preset del tipo de sala. Todo lo que sale del
 * preset queda listado como estimado.
 */

import { FURNISHING, MATERIALS, presetFor, USE_TARGETS, type Furnishing, type MaterialKey, type SoundUse, type Surface } from "./materials";
import type { RoomMaterials } from "./reverb";

/** Lo que se guarda en la escena (todo opcional: lo que falta sale del preset). */
export type SceneAcoustics = {
  materials?: Partial<Record<Surface, MaterialKey>> | null;
  /** Parte de las paredes que es vidrio (0..1). */
  glassRatio?: number | null;
  /** Ruido de fondo (curva NC). */
  nc?: number | null;
  /** Altura de oído (m). */
  earM?: number | null;
  use?: SoundUse | null;
  /** Amoblamiento (absorción de muebles). */
  furnishing?: Furnishing | null;
  /** Personas en la sala (absorción). */
  people?: number | null;
  /** Tap por parlante en 70/100 V fijado por el usuario o por la grilla sugerida (W). */
  tapW?: number | null;
  /** Paso de la grilla de cálculo (m). */
  gridStepM?: number | null;
};

export type ResolvedAcoustics = {
  materials: RoomMaterials;
  glassRatio: number;
  nc: number;
  earM: number;
  use: SoundUse;
  people: number;
  furnishing: Furnishing;
  tapW: number | null;
  stepM: number;
  /** Margen a las paredes del área de audiencia (m). */
  wallMarginM: number;
  rtMax: number;
  estimates: string[];
};

const SURFACES: Surface[] = ["floor", "ceiling", "walls", "glass"];
const fmt = (n: number, d = 1) => n.toFixed(d).replace(".", ",");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Paso de grilla automático: 0,25 m en salas chicas, hasta 0,5 m en grandes (≈ 1200 puntos). */
export function autoGridStep(areaM2: number): number {
  return Math.round(clamp(Math.sqrt(Math.max(1, areaM2) / 1200), 0.25, 0.5) * 20) / 20;
}

export function resolveAcoustics(category: string | null | undefined, saved: SceneAcoustics | null | undefined, areaM2: number): ResolvedAcoustics {
  const p = presetFor(category);
  const s = saved ?? {};
  const estimates: string[] = [];
  const materials = {} as RoomMaterials;
  const fromPreset: Surface[] = [];
  for (const k of SURFACES) {
    const m = s.materials?.[k];
    if (m && MATERIALS[m]) materials[k] = m;
    else {
      materials[k] = p[k];
      fromPreset.push(k);
    }
  }
  if (fromPreset.length) estimates.push(`materiales típicos del tipo de sala (no relevados en obra): ${fromPreset.map((k) => MATERIALS[materials[k]].label.toLowerCase()).join(", ")}`);
  const glassRatio = s.glassRatio != null ? clamp(s.glassRatio, 0, 0.9) : p.glassRatio;
  const nc = s.nc != null ? clamp(s.nc, 15, 55) : p.nc;
  if (s.nc == null) estimates.push(`ruido de fondo NC-${nc} típico del tipo de sala (no medido)`);
  const earM = s.earM != null ? clamp(s.earM, 0.8, 2) : p.earM;
  const use = s.use && USE_TARGETS[s.use] ? s.use : p.use;
  const people = s.people != null ? Math.max(0, Math.round(s.people)) : Math.round(areaM2 * p.peoplePerM2);
  if (s.people == null) estimates.push(`ocupación de diseño: ${people} persona(s) (${fmt(p.peoplePerM2, 2)} por m²)`);
  const furnishing = s.furnishing && FURNISHING[s.furnishing] ? s.furnishing : p.furnishing;
  if (!s.furnishing) estimates.push(`amoblamiento típico: ${FURNISHING[furnishing].label.toLowerCase()}`);
  if (s.glassRatio == null) estimates.push(`vidrio: ${Math.round(glassRatio * 100)} % de las paredes típico (si el plano no marca ventanas)`);
  return {
    materials,
    glassRatio,
    nc,
    earM,
    use,
    people,
    furnishing,
    tapW: s.tapW != null && s.tapW > 0 ? s.tapW : null,
    stepM: s.gridStepM != null ? clamp(s.gridStepM, 0.25, 1) : autoGridStep(areaM2),
    wallMarginM: 0.5,
    rtMax: p.rtMax,
    estimates,
  };
}
