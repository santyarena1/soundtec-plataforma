/**
 * Fuente sonora (una unidad de parlante): posición, eje, cobertura, nivel a
 * 1 m y directividad. Campo directo:
 *
 *   Lp(d, θ) = S + 10·log10(W) − 20·log10(d) − A(θ) − a_aire·d
 *
 * S = sensibilidad (dB 1 W / 1 m), W = potencia aplicada (tap en 70/100 V o
 * potencia de canal), d = distancia (m), A(θ) = atenuación fuera de eje.
 *
 * Directividad a partir de la cobertura de ficha (ángulo a −6 dB, horizontal
 * y vertical): el ángulo fuera de eje se normaliza contra el semiángulo de la
 * elipse de cobertura en esa dirección (r = θ / θ½); A = 6·r² dentro del
 * ángulo (−6 dB justo en el borde) y A = 6 + 10·(r − 1) fuera, con tope de
 * 25 dB (parlante empotrado: atrás del bafle no radia). Es un modelo de haz
 * suave de banda ancha, no un balloon medido.
 *
 * Factor de directividad Q (para el campo reverberante), fórmula de Molloy:
 *   Q = 180° / asin( sen(H/2) · sen(V/2) )
 */

export type Vec3 = { x: number; y: number; z: number };

export type SoundSource = {
  id: string;
  label: string;
  /** Equipo de la escena al que pertenece. */
  deviceId: string;
  pos: Vec3;
  /** Eje de radiación (unitario). */
  axis: Vec3;
  /** Eje de referencia horizontal de la cobertura (unitario, perpendicular al eje). */
  ref: Vec3;
  coverage: { horizontal: number; vertical: number };
  sensitivityDb: number;
  watts: number;
  /** Datos que no salieron de la ficha (se muestran como estimados). */
  estimates: string[];
};

/** Atenuación máxima fuera de eje (dB). */
export const MAX_OFF_AXIS_DB = 25;
/** Distancia mínima para el campo directo (dentro de esto el modelo de punto no vale). */
export const MIN_DISTANCE_M = 0.3;
/** Cobertura típica de un parlante de techo cuando falta en la ficha (°). */
export const TYPICAL_CEILING_COVERAGE = 90;
/** Sensibilidad típica de un parlante de techo de 6,5" cuando falta en la ficha (dB 1 W/1 m). */
export const TYPICAL_SENSITIVITY_DB = 88;

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Atenuación fuera de eje (dB) en la dirección `dir` (unitaria) desde la fuente. */
export function offAxisDb(src: Pick<SoundSource, "axis" | "ref" | "coverage">, dir: Vec3): number {
  const c = Math.max(-1, Math.min(1, dot(dir, src.axis)));
  const theta = Math.acos(c);
  if (theta < 1e-6) return 0;
  // Dirección dentro del plano perpendicular al eje: define qué semiángulo de la elipse aplica.
  const up = cross(src.axis, src.ref);
  const pu = dot(dir, src.ref);
  const pv = dot(dir, up);
  const pl = Math.hypot(pu, pv);
  // Justo atrás (o adelante) no hay dirección en el plano: se toma la horizontal.
  const cos = pl > 1e-9 ? pu / pl : 1;
  const sin = pl > 1e-9 ? pv / pl : 0;
  const hh = rad(Math.max(10, src.coverage.horizontal) / 2);
  const hv = rad(Math.max(10, src.coverage.vertical) / 2);
  const half = 1 / Math.sqrt((cos * cos) / (hh * hh) + (sin * sin) / (hv * hv));
  const r = theta / half;
  const att = r <= 1 ? 6 * r * r : 6 + 10 * (r - 1);
  return Math.min(MAX_OFF_AXIS_DB, att);
}

/** Factor de directividad Q (Molloy) a partir de la cobertura a −6 dB. */
export function directivityQ(coverage: { horizontal: number; vertical: number }): number {
  const h = rad(Math.min(180, Math.max(10, coverage.horizontal)) / 2);
  const v = rad(Math.min(180, Math.max(10, coverage.vertical)) / 2);
  const q = 180 / ((Math.asin(Math.sin(h) * Math.sin(v)) * 180) / Math.PI);
  return Math.max(1, Math.min(30, q));
}

/** Nivel a 1 m en eje con la potencia aplicada (dB SPL). */
export const onAxis1m = (s: Pick<SoundSource, "sensitivityDb" | "watts">) => s.sensitivityDb + 10 * Math.log10(Math.max(1e-6, s.watts));

/** Potencia acústica de la fuente (dB re 1 pW): Lw = Lp(1 m) − 10·log10(Q) + 11. */
export const soundPowerDb = (s: SoundSource) => onAxis1m(s) - 10 * Math.log10(directivityQ(s.coverage)) + 11;

/**
 * Campo directo de una fuente en un punto (dB SPL), con absorción del aire
 * `airDbPerM` (banda de 1 kHz para el mapa de banda ancha).
 */
export function directSpl(s: SoundSource, p: Vec3, airDbPerM = 0.0037): number {
  const dx = p.x - s.pos.x;
  const dy = p.y - s.pos.y;
  const dz = p.z - s.pos.z;
  const d = Math.max(MIN_DISTANCE_M, Math.hypot(dx, dy, dz));
  const dir = { x: dx / d, y: dy / d, z: dz / d };
  return onAxis1m(s) - 20 * Math.log10(d) - offAxisDb(s, dir) - airDbPerM * d;
}

/** Ejes de una fuente de techo (mira hacia abajo; la referencia horizontal sigue su giro). */
export function ceilingAxes(rotYDeg: number): { axis: Vec3; ref: Vec3 } {
  const r = rad(rotYDeg);
  return { axis: { x: 0, y: -1, z: 0 }, ref: { x: Math.cos(r), y: 0, z: -Math.sin(r) } };
}

/**
 * Ejes de una fuente de pared o de piso: mira hacia adelante según su giro
 * (convención de la escena: rotY 0 mira a +Z) e inclinada hacia abajo `tiltDeg`.
 */
export function wallAxes(rotYDeg: number, tiltDeg: number): { axis: Vec3; ref: Vec3 } {
  const r = rad(rotYDeg);
  const t = rad(tiltDeg);
  const fwd = { x: Math.sin(r), y: 0, z: Math.cos(r) };
  const axis = norm({ x: fwd.x * Math.cos(t), y: -Math.sin(t), z: fwd.z * Math.cos(t) });
  return { axis, ref: { x: Math.cos(r), y: 0, z: -Math.sin(r) } };
}
