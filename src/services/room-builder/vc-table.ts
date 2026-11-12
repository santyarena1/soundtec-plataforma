/**
 * Mesa de la sala de reuniones: perpendicular a la pantalla (pared del frente,
 * +z) con la cabecera hacia ella, así todos ven la pantalla y la cámara los
 * toma de frente. Si la sala no da el largo, queda paralela (como antes).
 * La comparten el mobiliario y la ubicación del touch de mesa.
 */

export type VcSize = "S" | "M" | "L";
export type VcTable = {
  /** true = el largo de la mesa va hacia la pantalla. */
  perpendicular: boolean;
  /** Centro de la mesa (m). */
  x: number;
  z: number;
  /** Medida en x (ancho de sala) y en z (fondo) de la mesa (m). */
  w: number;
  d: number;
  /** Extremo de la mesa más cercano a la pantalla (z). */
  headZ: number;
  sideChairs: number;
  endChairs: number;
};

const NOMINAL: Record<VcSize, { length: number; width: number; chairs: number }> = {
  S: { length: 1.6, width: 0.9, chairs: 4 },
  M: { length: 2.6, width: 1.2, chairs: 8 },
  L: { length: 3.8, width: 1.45, chairs: 12 },
};
/** Silla (0,45 desde el borde) + respaldo + paso, de la mesa a la pared (m). */
export const TABLE_CLEARANCE_M = 1.1;
/** Silla y paso detrás de ella, desde el borde de la mesa (m). */
export const CHAIR_BEHIND_TABLE_M = 1.05;
/** Paso libre entre la cabecera y la pared de la pantalla (m). */
const HEAD_GAP_M = 0.9;
/** Largo mínimo para que la mesa perpendicular tenga sentido (m). */
const MIN_PERPENDICULAR_M = 1.4;
/** Lugar por silla a lo largo de la mesa (m). */
const SEAT_PITCH_M = 0.75;

export function vcTable(dims: { widthM: number; depthM: number }, size: VcSize): VcTable {
  const n = NOMINAL[size];
  const width = Math.min(n.width, Math.max(0.8, dims.widthM - TABLE_CLEARANCE_M * 2));
  const length = Math.min(n.length, dims.depthM - HEAD_GAP_M - CHAIR_BEHIND_TABLE_M);
  if (length >= MIN_PERPENDICULAR_M) {
    const headZ = dims.depthM / 2 - HEAD_GAP_M;
    const sideChairs = Math.max(1, Math.min(Math.floor((n.chairs - 1) / 2), Math.floor(length / SEAT_PITCH_M)));
    return { perpendicular: true, x: 0, z: headZ - length / 2, w: width, d: length, headZ, sideChairs, endChairs: 1 };
  }
  // Sala sin fondo suficiente: mesa paralela, centrada.
  const w = Math.min(n.length, Math.max(1.2, dims.widthM - TABLE_CLEARANCE_M * 2));
  const d = Math.min(n.width, Math.max(0.8, dims.depthM - TABLE_CLEARANCE_M * 2));
  return { perpendicular: false, x: 0, z: 0, w, d, headZ: d / 2, sideChairs: 0, endChairs: 0 };
}

/**
 * El códec / PC de sala va detrás de la pantalla, en su mitad de abajo y corrido hacia un costado
 * (montaje VESA o de pared): no ocupa el lugar de la barra/parlante que va bajo la pantalla.
 */
const CODEC_BELOW_DISPLAY_M = 0.3;
const CODEC_ASIDE_M = 0.35;
const CODEC_MIN_Y_M = 0.4;

/**
 * Lugar del códec / PC de sala cuando la sala no tiene rack central: detrás (o debajo) de la
 * pantalla principal, así el HDMI a la pantalla y el USB a la cámara (arriba de la pantalla) son
 * cortos. El resto del equipamiento de rack sigue en el mueble técnico (rack-place.ts).
 */
export function codecBehindDisplay(display: { x: number; y: number; z: number; rotY: number }): { x: number; y: number; z: number; rotY: number } {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { x: r2(display.x + CODEC_ASIDE_M), y: r2(Math.max(CODEC_MIN_Y_M, display.y - CODEC_BELOW_DISPLAY_M)), z: display.z, rotY: display.rotY };
}
