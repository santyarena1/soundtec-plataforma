/**
 * Datos acústicos de referencia: coeficientes de absorción por banda de octava
 * de materiales de obra comunes, presets por tipo de sala, ruido de fondo
 * típico (curvas NC) y objetivos de diseño según el uso del sistema.
 *
 * Son valores típicos publicados (tablas de absorción de manuales de acústica
 * arquitectónica, curvas NC de Beranek, ISO 9613-1 para el aire). NO son
 * mediciones de la obra: el motor los marca siempre como estimados y el
 * usuario los puede cambiar por superficie.
 */

/** Bandas de octava del cálculo (Hz). 8 kHz solo entra en el STI. */
export const BANDS = [125, 250, 500, 1000, 2000, 4000, 8000] as const;
export type Band = (typeof BANDS)[number];
/** Bandas que se muestran en el RT60 (125 Hz – 4 kHz). */
export const RT_BANDS = [125, 250, 500, 1000, 2000, 4000] as const;

/** Coeficientes de absorción en 125, 250, 500, 1k, 2k y 4k (8 kHz = 4 kHz, extrapolado). */
export type Absorption = readonly [number, number, number, number, number, number];

export type MaterialKey =
  | "hormigon"
  | "revoque"
  | "durlock"
  | "madera"
  | "vidrio"
  | "ceramico"
  | "vinilico"
  | "piso-madera"
  | "alfombra"
  | "alfombra-bajo"
  | "cielorraso-acustico"
  | "panel-acustico"
  | "cortina";

export type Surface = "floor" | "ceiling" | "walls" | "glass";

export const MATERIALS: Record<MaterialKey, { label: string; alpha: Absorption; surfaces: Surface[] }> = {
  hormigon: { label: "Hormigón / mampostería pintada", alpha: [0.01, 0.01, 0.02, 0.02, 0.02, 0.03], surfaces: ["floor", "ceiling", "walls"] },
  revoque: { label: "Revoque sobre ladrillo", alpha: [0.013, 0.015, 0.02, 0.03, 0.04, 0.05], surfaces: ["ceiling", "walls"] },
  durlock: { label: "Placa de yeso (durlock) sobre bastidor", alpha: [0.29, 0.1, 0.05, 0.04, 0.07, 0.09], surfaces: ["ceiling", "walls"] },
  madera: { label: "Revestimiento de madera sobre listones", alpha: [0.3, 0.25, 0.2, 0.17, 0.15, 0.1], surfaces: ["ceiling", "walls"] },
  vidrio: { label: "Vidrio de ventana común", alpha: [0.35, 0.25, 0.18, 0.12, 0.07, 0.04], surfaces: ["glass", "walls"] },
  ceramico: { label: "Cerámico / porcelanato", alpha: [0.01, 0.01, 0.01, 0.01, 0.02, 0.02], surfaces: ["floor"] },
  vinilico: { label: "Vinílico sobre carpeta", alpha: [0.02, 0.03, 0.03, 0.03, 0.03, 0.02], surfaces: ["floor"] },
  "piso-madera": { label: "Piso de madera / flotante", alpha: [0.15, 0.11, 0.1, 0.07, 0.06, 0.07], surfaces: ["floor"] },
  alfombra: { label: "Alfombra sobre carpeta", alpha: [0.02, 0.06, 0.14, 0.37, 0.6, 0.65], surfaces: ["floor"] },
  "alfombra-bajo": { label: "Alfombra con bajoalfombra", alpha: [0.08, 0.24, 0.57, 0.69, 0.71, 0.73], surfaces: ["floor"] },
  "cielorraso-acustico": { label: "Cielorraso acústico (placa mineral, NRC ≈ 0,70)", alpha: [0.45, 0.55, 0.6, 0.8, 0.8, 0.75], surfaces: ["ceiling"] },
  "panel-acustico": { label: "Panel fonoabsorbente 50 mm (lana de vidrio con tela)", alpha: [0.25, 0.7, 0.99, 0.99, 0.99, 0.95], surfaces: ["ceiling", "walls"] },
  cortina: { label: "Cortina pesada plegada", alpha: [0.14, 0.35, 0.55, 0.72, 0.7, 0.65], surfaces: ["glass", "walls"] },
};

export const SURFACE_LABEL: Record<Surface, string> = { floor: "Piso", ceiling: "Cielorraso", walls: "Paredes", glass: "Vidrio / aberturas" };

/** Absorción de una persona sentada con su silla (m² Sabine por banda, 8 kHz = 4 kHz). Valor típico. */
export const PERSON_SABINS: Absorption = [0.15, 0.25, 0.35, 0.42, 0.45, 0.45];

/** Amoblamiento: absorción equivalente por m² de piso (m² Sabine / m²), valores típicos de diseño. */
export type Furnishing = "none" | "light" | "furnished";
export const FURNISHING: Record<Furnishing, { label: string; perM2: Absorption }> = {
  none: { label: "Sin muebles (sala vacía)", perM2: [0, 0, 0, 0, 0, 0] },
  light: { label: "Muebles livianos (mesas, sillas, escritorios)", perM2: [0.04, 0.06, 0.08, 0.1, 0.1, 0.1] },
  furnished: { label: "Amoblado (sillones, cortinas, alfombras sueltas)", perM2: [0.1, 0.15, 0.22, 0.27, 0.28, 0.28] },
};

/** Uso del sistema: define el SPL objetivo, la uniformidad y el STI pedido. */
export type SoundUse = "voz" | "musica" | "eventos";

export const USE_TARGETS: Record<SoundUse, { label: string; splMin: number; splMax: number | null; uniformityDb: number; stiMin: number; source: string }> = {
  voz: { label: "Voz (refuerzo / VC)", splMin: 70, splMax: 75, uniformityDb: 3, stiMin: 0.6, source: "SPL 70–75 dBA; uniformidad ±3 dB (AVIXA A102 para voz); STI ≥ 0,60 (IEC 60268-16, «bueno»)" },
  musica: { label: "Música funcional", splMin: 75, splMax: 80, uniformityDb: 4, stiMin: 0.5, source: "SPL 75–80 dBA; uniformidad ±4 dB (criterio de diseño); STI ≥ 0,50 para avisos" },
  eventos: { label: "Eventos", splMin: 85, splMax: null, uniformityDb: 3, stiMin: 0.5, source: "SPL ≥ 85 dBA; uniformidad ±3 dB; STI ≥ 0,50" },
};

export type RoomPreset = {
  floor: MaterialKey;
  ceiling: MaterialKey;
  walls: MaterialKey;
  glass: MaterialKey;
  /** Parte de la superficie de paredes que es vidrio (0..1), si el plano no marca ventanas. */
  glassRatio: number;
  /** Ruido de fondo típico (curva NC). */
  nc: number;
  /** Altura de oído: sentado 1,2 m / de pie 1,7 m. */
  earM: number;
  use: SoundUse;
  furnishing: Furnishing;
  /** Personas por m² de piso (ocupación típica de diseño). */
  peoplePerM2: number;
  /** RT60 recomendado en medias frecuencias (500 Hz–1 kHz), en s. */
  rtMax: number;
};

const SEATED = 1.2;
const STANDING = 1.7;

/** Presets por tipo de sala (todos editables en el panel). */
export const ROOM_PRESETS: Record<string, RoomPreset> = {
  videoconference: { floor: "alfombra", ceiling: "cielorraso-acustico", walls: "durlock", glass: "vidrio", glassRatio: 0.15, nc: 30, earM: SEATED, use: "voz", furnishing: "light", peoplePerM2: 0.35, rtMax: 0.6 },
  office: { floor: "alfombra", ceiling: "cielorraso-acustico", walls: "durlock", glass: "vidrio", glassRatio: 0.2, nc: 35, earM: SEATED, use: "voz", furnishing: "light", peoplePerM2: 0.1, rtMax: 0.6 },
  classroom: { floor: "vinilico", ceiling: "cielorraso-acustico", walls: "revoque", glass: "vidrio", glassRatio: 0.2, nc: 30, earM: SEATED, use: "voz", furnishing: "light", peoplePerM2: 0.5, rtMax: 0.7 },
  training: { floor: "alfombra", ceiling: "cielorraso-acustico", walls: "durlock", glass: "vidrio", glassRatio: 0.15, nc: 30, earM: SEATED, use: "voz", furnishing: "light", peoplePerM2: 0.4, rtMax: 0.7 },
  "control-room": { floor: "vinilico", ceiling: "cielorraso-acustico", walls: "durlock", glass: "vidrio", glassRatio: 0.1, nc: 35, earM: SEATED, use: "voz", furnishing: "light", peoplePerM2: 0.15, rtMax: 0.6 },
  hotel: { floor: "alfombra", ceiling: "durlock", walls: "durlock", glass: "vidrio", glassRatio: 0.2, nc: 35, earM: SEATED, use: "musica", furnishing: "furnished", peoplePerM2: 0.1, rtMax: 0.8 },
  residential: { floor: "ceramico", ceiling: "durlock", walls: "revoque", glass: "vidrio", glassRatio: 0.2, nc: 30, earM: SEATED, use: "musica", furnishing: "furnished", peoplePerM2: 0.08, rtMax: 0.6 },
  lobby: { floor: "ceramico", ceiling: "durlock", walls: "revoque", glass: "vidrio", glassRatio: 0.3, nc: 45, earM: STANDING, use: "musica", furnishing: "light", peoplePerM2: 0.1, rtMax: 1.2 },
  commercial: { floor: "ceramico", ceiling: "durlock", walls: "revoque", glass: "vidrio", glassRatio: 0.3, nc: 45, earM: STANDING, use: "musica", furnishing: "light", peoplePerM2: 0.2, rtMax: 1.0 },
  signage: { floor: "ceramico", ceiling: "durlock", walls: "revoque", glass: "vidrio", glassRatio: 0.3, nc: 45, earM: STANDING, use: "musica", furnishing: "none", peoplePerM2: 0.1, rtMax: 1.2 },
  common: { floor: "ceramico", ceiling: "durlock", walls: "revoque", glass: "vidrio", glassRatio: 0.1, nc: 40, earM: STANDING, use: "musica", furnishing: "none", peoplePerM2: 0.05, rtMax: 1.0 },
  event: { floor: "vinilico", ceiling: "cielorraso-acustico", walls: "durlock", glass: "vidrio", glassRatio: 0.05, nc: 35, earM: SEATED, use: "eventos", furnishing: "light", peoplePerM2: 0.8, rtMax: 1.0 },
};

export function presetFor(category: string | null | undefined): RoomPreset {
  return ROOM_PRESETS[category ?? ""] ?? ROOM_PRESETS.office!;
}

/**
 * Curvas NC por banda de octava 125 Hz – 8 kHz (dB SPL). Beranek / ANSI S12.2.
 * Entre curvas se interpola.
 */
const NC_TABLE: Record<number, readonly number[]> = {
  15: [36, 29, 22, 17, 14, 12, 11],
  20: [40, 33, 26, 22, 19, 17, 16],
  25: [44, 37, 31, 27, 24, 22, 21],
  30: [48, 41, 35, 31, 29, 28, 27],
  35: [52, 45, 40, 36, 34, 33, 32],
  40: [56, 50, 45, 41, 39, 38, 37],
  45: [60, 54, 49, 46, 44, 43, 42],
  50: [64, 58, 54, 51, 49, 48, 47],
  55: [67, 62, 58, 56, 54, 53, 52],
};

/** Ruido de fondo por banda (125 Hz – 8 kHz) para una curva NC. */
export function ncSpectrum(nc: number): number[] {
  const keys = Object.keys(NC_TABLE).map(Number).sort((a, b) => a - b);
  const n = Math.min(keys[keys.length - 1]!, Math.max(keys[0]!, nc));
  const lo = [...keys].reverse().find((k) => k <= n)!;
  const hi = keys.find((k) => k >= n)!;
  const t = hi === lo ? 0 : (n - lo) / (hi - lo);
  return NC_TABLE[lo]!.map((v, i) => v + (NC_TABLE[hi]![i]! - v) * t);
}

/** Ponderación A por banda (125 Hz – 8 kHz). */
export const A_WEIGHT = [-16.1, -8.6, -3.2, 0, 1.2, 1.0, -1.1] as const;

/** Suma energética de niveles (dB). */
export function sumDb(levels: number[]): number {
  const e = levels.reduce((s, l) => s + 10 ** (l / 10), 0);
  return e > 0 ? 10 * Math.log10(e) : -Infinity;
}

/** Nivel A de un espectro por bandas. */
export function aWeighted(bands: number[]): number {
  return sumDb(bands.map((l, i) => l + (A_WEIGHT[i] ?? 0)));
}

/**
 * Absorción del aire (dB/m) por banda, 20 °C y 50 % HR (ISO 9613-1).
 * 125 Hz … 8 kHz.
 */
export const AIR_DB_PER_M = [0.0004, 0.001, 0.0019, 0.0037, 0.0097, 0.0328, 0.117] as const;

/** Coeficiente de un material por banda (8 kHz toma el de 4 kHz). */
export function alphaAt(alpha: Absorption, bandIndex: number): number {
  return alpha[Math.min(bandIndex, alpha.length - 1)]!;
}
