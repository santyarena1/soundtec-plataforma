/**
 * Mapa de sonido de un ambiente: grilla del plano de escucha (altura de
 * oído), SPL directo + reverberante de cada punto, STI, uniformidad y
 * cumplimiento de objetivos según el uso.
 *
 *   Directo (por parlante):  ver source.ts
 *   Reverberante (por banda): L_rev = Lw + 10·log10(4 / R)   (R = constante de sala, Eyring)
 *   Total:                    suma energética de todos los directos + reverberante (1 kHz)
 *
 * El STI usa la voz al nivel de operación: el sistema se ajusta para que el
 * promedio del área de audiencia quede en el objetivo del uso (o en lo
 * máximo que da, si no llega), conservando la variación entre puntos.
 */

import { pointInPolygon } from "../plan-polygon";
import { aWeighted, AIR_DB_PER_M, BANDS, ncSpectrum, sumDb, USE_TARGETS, type SoundUse } from "./materials";
import { polygonAreaPerimeter, reverbBands, roomGeometry, rtMid, type ReverbBand } from "./reverb";
import type { ResolvedAcoustics } from "./settings";
import { directSpl, soundPowerDb, type SoundSource } from "./source";
import { SPEECH_SPECTRUM, stiFromBands } from "./sti";

type Pt = { x: number; y: number };

export type SoundGrid = {
  /** Esquina del primer punto (m, x / z de la sala) y paso. */
  x0: number;
  z0: number;
  step: number;
  cols: number;
  rows: number;
  /** SPL total por punto (dB), null fuera del piso. Fila por fila (z), columna (x). */
  spl: Array<number | null>;
  /** STI por punto (null fuera del piso). */
  sti: Array<number | null>;
  /** SPL del campo directo solo (dB), null fuera del piso. */
  direct: Array<number | null>;
  /** El punto está en el área de audiencia (dentro del piso, lejos de las paredes). */
  audience: boolean[];
};

export type CheckStatus = "ok" | "warn" | "fail" | "na";
export type SoundCheck = { key: string; label: string; value: string; target: string; status: CheckStatus };

export type SoundStats = {
  splAvg: number;
  splMin: number;
  splMax: number;
  /** Uniformidad: ± la mitad del rango (máx − mín) en el área de audiencia (dB). */
  uniformityDb: number;
  /** Uniformidad solo del campo directo (cobertura de la grilla, sin el reverberante que la empareja). */
  directUniformityDb: number;
  stiAvg: number;
  stiMin: number;
  /** Corrección aplicada para llevar la voz al nivel de operación (dB, ≤ 0). */
  operatingOffsetDb: number;
  /** Puntos del área de audiencia. */
  points: number;
};

export type SoundMapResult = {
  grid: SoundGrid;
  stats: SoundStats | null;
  reverb: ReverbBand[];
  rtMid: number;
  /** Ruido de fondo (dBA) y su curva. */
  noiseDbA: number;
  nc: number;
  volumeM3: number;
  areaM2: number;
  use: SoundUse;
  earM: number;
  checks: SoundCheck[];
  /** Datos no verificados (de la sala, de los parlantes o del modelo). */
  estimates: string[];
  sources: SoundSource[];
};

export type SoundMapInput = {
  floor: Pt[];
  heightM: number;
  /** Vidrio medido en el plano (m²), si hay ventanas dibujadas. */
  glassM2?: number | null;
  sources: SoundSource[];
  settings: ResolvedAcoustics;
};

const fmt = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

/** Distancia de un punto al contorno del polígono. */
function distanceToEdges(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (ex * ex + ey * ey || 1)));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * ex), p.y - (a.y + t * ey)));
  }
  return best;
}

/** Nivel de voz de operación (dBA) para el uso: el centro del rango, o el mínimo si no tiene techo. */
export function operatingLevel(use: SoundUse): number {
  const t = USE_TARGETS[use];
  return t.splMax != null ? (t.splMin + t.splMax) / 2 : t.splMin;
}

const I = (db: number) => 10 ** (db / 10);

export function computeSoundMap(input: SoundMapInput): SoundMapResult {
  const s = input.settings;
  const floor = input.floor.length >= 3 ? input.floor : [{ x: -2, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 2 }, { x: -2, y: 2 }];
  const geo = roomGeometry({ floor, heightM: input.heightM, glassM2: input.glassM2, glassRatio: s.glassRatio });
  const reverb = reverbBands(geo, s.materials, s.people, s.furnishing);
  const noise = ncSpectrum(s.nc);
  const noiseDbA = aWeighted(noise);
  const estimates = [...s.estimates, ...input.sources.flatMap((x) => x.estimates)];

  // Grilla: centros de celdas que cubren la caja del piso.
  const xs = floor.map((p) => p.x);
  const ys = floor.map((p) => p.y);
  const minX = Math.min(...xs);
  const minZ = Math.min(...ys);
  const step = s.stepM;
  const cols = Math.max(1, Math.ceil((Math.max(...xs) - minX) / step));
  const rows = Math.max(1, Math.ceil((Math.max(...ys) - minZ) / step));
  const x0 = minX + step / 2;
  const z0 = minZ + step / 2;

  // Potencia acústica de cada fuente → campo reverberante por banda (igual en toda la sala).
  const lwSum = input.sources.length ? sumDb(input.sources.map(soundPowerDb)) : -Infinity;
  const revBand = reverb.map((b) => I(lwSum + 10 * Math.log10(4 / Math.max(1e-3, b.roomConstant))));
  const K1 = BANDS.indexOf(1000);

  const n = cols * rows;
  const spl: Array<number | null> = new Array(n).fill(null);
  const direct: number[] = new Array(n).fill(0);
  const audience: boolean[] = new Array(n).fill(false);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const p = { x: x0 + c * step, y: z0 + r * step };
      if (!pointInPolygon(p, floor)) continue;
      const ear = { x: p.x, y: s.earM, z: p.y };
      const d = input.sources.reduce((acc, src) => acc + I(directSpl(src, ear, AIR_DB_PER_M[K1])), 0);
      direct[i] = d;
      spl[i] = input.sources.length ? 10 * Math.log10(d + revBand[K1]!) : null;
      audience[i] = distanceToEdges(p, floor) >= s.wallMarginM;
    }
  }
  // Sala muy chica: si el margen deja el área vacía, cuenta todo el piso.
  if (!audience.some(Boolean)) for (let i = 0; i < n; i++) audience[i] = spl[i] != null;

  const sti: Array<number | null> = new Array(n).fill(null);
  let stats: SoundStats | null = null;
  const inAud = spl.map((v, i) => (v != null && audience[i] ? v : null)).filter((v): v is number => v != null);
  if (input.sources.length && inAud.length) {
    const avg = 10 * Math.log10(inAud.reduce((a, v) => a + I(v), 0) / inAud.length);
    const offset = Math.min(0, operatingLevel(s.use) - avg);
    for (let i = 0; i < n; i++) {
      const L = spl[i];
      if (L == null) continue;
      const d = direct[i]!;
      const ref = d + revBand[K1]!;
      sti[i] = stiFromBands(
        BANDS.map((_, k) => {
          const band = d + revBand[k]!;
          return {
            speechDb: L + offset + SPEECH_SPECTRUM[k]! + 10 * Math.log10(band / ref),
            directRatio: d / band,
            rt60: reverb[k]!.eyring,
            noiseDb: noise[k]!,
          };
        }),
      );
    }
    const stiAud = sti.filter((v, i): v is number => v != null && audience[i]!);
    const min = Math.min(...inAud);
    const max = Math.max(...inAud);
    const dirAud = direct.filter((v, i) => spl[i] != null && audience[i] && v > 0).map((v) => 10 * Math.log10(v));
    stats = {
      splAvg: avg,
      splMin: min,
      splMax: max,
      uniformityDb: (max - min) / 2,
      directUniformityDb: dirAud.length ? (Math.max(...dirAud) - Math.min(...dirAud)) / 2 : 0,
      stiAvg: stiAud.reduce((a, v) => a + v, 0) / Math.max(1, stiAud.length),
      stiMin: Math.min(...stiAud),
      operatingOffsetDb: offset,
      points: inAud.length,
    };
  }
  const { area } = polygonAreaPerimeter(floor);
  const mid = rtMid(reverb);
  const result: SoundMapResult = {
    grid: { x0, z0, step, cols, rows, spl, sti, audience, direct: direct.map((v, i) => (spl[i] != null && v > 0 ? 10 * Math.log10(v) : null)) },
    stats,
    reverb,
    rtMid: mid,
    noiseDbA,
    nc: s.nc,
    volumeM3: geo.volumeM3,
    areaM2: area,
    use: s.use,
    earM: s.earM,
    checks: [],
    estimates: [...new Set(estimates)],
    sources: input.sources,
  };
  result.checks = soundChecks(result, s.rtMax);
  return result;
}

/** Semáforo de objetivos: SPL, uniformidad, STI, RT60 y relación señal/ruido. */
export function soundChecks(r: Pick<SoundMapResult, "stats" | "use" | "rtMid" | "noiseDbA">, rtMax: number): SoundCheck[] {
  const t = USE_TARGETS[r.use];
  const st = r.stats;
  const range = t.splMax != null ? `${t.splMin}–${t.splMax} dB` : `≥ ${t.splMin} dB`;
  const checks: SoundCheck[] = [];
  if (!st) {
    checks.push({ key: "spl", label: "SPL promedio", value: "sin parlantes", target: range, status: "na" });
  } else {
    // Más que el máximo no es falla: se baja el volumen (el STI ya se calcula al nivel de operación).
    const splStatus: CheckStatus = st.splAvg >= t.splMin ? "ok" : st.splAvg >= t.splMin - 3 ? "warn" : "fail";
    checks.push({ key: "spl", label: "SPL máximo disponible", value: `${fmt(st.splAvg)} dB`, target: range, status: splStatus });
    const u = st.uniformityDb;
    checks.push({ key: "uniformity", label: "Uniformidad", value: `±${fmt(u)} dB`, target: `±${t.uniformityDb} dB`, status: u <= t.uniformityDb ? "ok" : u <= t.uniformityDb + 1.5 ? "warn" : "fail" });
    checks.push({ key: "sti", label: "STI promedio", value: fmt(st.stiAvg, 2), target: `≥ ${fmt(t.stiMin, 2)}`, status: st.stiAvg >= t.stiMin ? "ok" : st.stiAvg >= t.stiMin - 0.06 ? "warn" : "fail" });
    const snr = st.splAvg + st.operatingOffsetDb - r.noiseDbA;
    checks.push({ key: "snr", label: "Señal / ruido", value: `${fmt(snr)} dB`, target: "≥ 15 dB", status: snr >= 15 ? "ok" : snr >= 10 ? "warn" : "fail" });
  }
  checks.push({ key: "rt60", label: "RT60 (500 Hz–1 kHz)", value: `${fmt(r.rtMid, 2)} s`, target: `≤ ${fmt(rtMax, 1)} s`, status: r.rtMid <= rtMax ? "ok" : r.rtMid <= rtMax * 1.3 ? "warn" : "fail" });
  return checks;
}
