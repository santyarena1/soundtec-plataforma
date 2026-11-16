/**
 * Campo reverberante de la sala: superficies, volumen, RT60 por banda de
 * octava (Sabine y Eyring, con absorción del aire) y constante de sala.
 *
 *   Sabine:  T = 0,161·V / (Σ Sᵢ·αᵢ + A_personas + A_muebles + 4·m·V)
 *   Eyring:  T = 0,161·V / (−S·ln(1 − ᾱ) + A_personas + A_muebles + 4·m·V)
 *   Constante de sala: R = S·ᾱ' / (1 − ᾱ'), con ᾱ' = (Σ Sᵢ·αᵢ + A_personas + A_muebles + 4·m·V) / S
 *
 * m = coeficiente de atenuación del aire en intensidad (1/m) = dB/m ÷ 4,343.
 * Eyring es el que se usa para el campo reverberante y el STI (más fiel en
 * salas tratadas); Sabine se muestra como referencia.
 */

import { AIR_DB_PER_M, BANDS, FURNISHING, MATERIALS, PERSON_SABINS, alphaAt, type Furnishing, type MaterialKey, type Surface } from "./materials";

export type RoomGeometry = {
  /** Superficie de cada cara (m²). */
  areas: Record<Surface, number>;
  volumeM3: number;
  totalAreaM2: number;
};

export type RoomMaterials = Record<Surface, MaterialKey>;

export type ReverbBand = {
  hz: number;
  sabine: number;
  eyring: number;
  /** Absorción media con aire y personas. */
  alphaMean: number;
  /** Constante de sala (m²). */
  roomConstant: number;
};

/** Área (shoelace) y perímetro de un polígono en metros. */
export function polygonAreaPerimeter(poly: Array<{ x: number; y: number }>): { area: number; perimeter: number } {
  let a = 0;
  let p = 0;
  for (let i = 0; i < poly.length; i++) {
    const u = poly[i]!;
    const v = poly[(i + 1) % poly.length]!;
    a += u.x * v.y - v.x * u.y;
    p += Math.hypot(v.x - u.x, v.y - u.y);
  }
  return { area: Math.abs(a) / 2, perimeter: p };
}

/**
 * Superficies de la sala. `glassM2`: vidrio medido en el plano (ventanas); si no hay, se toma
 * `glassRatio` de las paredes. El vidrio se descuenta de las paredes.
 */
export function roomGeometry(input: { floor: Array<{ x: number; y: number }>; heightM: number; glassM2?: number | null; glassRatio: number }): RoomGeometry {
  const { area, perimeter } = polygonAreaPerimeter(input.floor);
  const wallGross = perimeter * input.heightM;
  const glass = Math.min(wallGross * 0.9, input.glassM2 != null && input.glassM2 > 0 ? input.glassM2 : wallGross * Math.max(0, Math.min(0.9, input.glassRatio)));
  const areas: Record<Surface, number> = { floor: area, ceiling: area, walls: wallGross - glass, glass };
  return { areas, volumeM3: area * input.heightM, totalAreaM2: area * 2 + wallGross };
}

/** RT60 por banda (125 Hz – 8 kHz) con materiales, personas, amoblamiento y aire. */
export function reverbBands(geo: RoomGeometry, materials: RoomMaterials, people: number, furnishing: Furnishing = "none"): ReverbBand[] {
  const S = geo.totalAreaM2;
  const V = geo.volumeM3;
  return BANDS.map((hz, i) => {
    const surf = (Object.keys(geo.areas) as Surface[]).reduce((s, k) => s + geo.areas[k] * alphaAt(MATERIALS[materials[k]].alpha, i), 0);
    const persons = Math.max(0, people) * alphaAt(PERSON_SABINS, i) + geo.areas.floor * alphaAt(FURNISHING[furnishing].perM2, i);
    const air = 4 * (AIR_DB_PER_M[i]! / 4.343) * V;
    const alphaSurf = Math.min(0.99, surf / S);
    const sabine = (0.161 * V) / Math.max(1e-6, surf + persons + air);
    const eyring = (0.161 * V) / Math.max(1e-6, -S * Math.log(1 - alphaSurf) + persons + air);
    const alphaMean = Math.min(0.99, (surf + persons + air) / S);
    return { hz, sabine, eyring, alphaMean, roomConstant: (S * alphaMean) / (1 - alphaMean) };
  });
}

/** RT60 medio en medias frecuencias (500 Hz y 1 kHz), Eyring. */
export function rtMid(bands: ReverbBand[]): number {
  const mid = bands.filter((b) => b.hz === 500 || b.hz === 1000);
  return mid.reduce((s, b) => s + b.eyring, 0) / Math.max(1, mid.length);
}
