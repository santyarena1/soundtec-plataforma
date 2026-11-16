/**
 * Identificación de cables según ANSI/AVIXA F501.01 (rotulado de cables en
 * sistemas audiovisuales). Lo que la norma pide y cómo lo cumplimos:
 *
 * - Cada cable tiene un identificador ÚNICO en toda la instalación, el mismo
 *   en la documentación (planilla, plano, diagrama) y en el cable.
 * - Se rotula en AMBAS puntas, cerca de la terminación y legible sin
 *   desconectar; cada etiqueta dice además de dónde viene y a dónde va.
 * - Etiqueta impresa a máquina (no a mano) y del mismo esquema en toda la obra.
 *
 * Esquema elegido (documentado en la planilla y en la hoja de etiquetas):
 *
 *     SALA-SEÑAL-NNN      ej. DIR-HDMI-001, DIR-NET-012, AUD2-SPEAKER-003
 *
 * - SALA: código del ambiente (3 letras del nombre, con número si se repite:
 *   el mismo de la planilla del proyecto). Hace único el ID entre ambientes.
 * - SEÑAL: familia del cable (HDMI, NET, USB, AUDIO, SPEAKER, HDBASET…).
 * - NNN: correlativo de tres cifras por señal dentro del ambiente.
 *
 * Las etiquetas que ya puso el sistema o el integrador en el plano técnico
 * ("HDMI-001") se conservan y se les antepone la sala. Si dos cables
 * terminan con el mismo ID se desempatan con sufijo (-B, -C…): nunca se
 * imprimen dos cables iguales.
 *
 * Formato físico: 51 × 25 mm (2 × 1"), plana. Variantes: bandera (51 × 50 mm
 * que se dobla sobre el cable y deja la misma cara a los dos lados) y
 * autolaminable (zona impresa de 51 × 25 mm más cola transparente que envuelve
 * y protege la impresión).
 */

export type F501Variant = "plana" | "bandera" | "autolaminable";

export const F501_VARIANTS: Record<F501Variant, { label: string; widthMm: number; heightMm: number; note: string }> = {
  plana: { label: "Plana 51 × 25 mm", widthMm: 51, heightMm: 25, note: "Etiqueta plana adhesiva o termocontraíble." },
  bandera: { label: "Bandera 51 × 50 mm", widthMm: 51, heightMm: 50, note: "Se dobla por la línea central alrededor del cable: queda una bandera de 51 × 25 mm legible de los dos lados." },
  autolaminable: { label: "Autolaminable 51 × 25 mm + cola", widthMm: 51, heightMm: 63, note: "La zona impresa (51 × 25 mm) va sobre el cable y la cola transparente la envuelve y la protege." },
};

export const parseF501Variant = (v: unknown): F501Variant => (typeof v === "string" && v in F501_VARIANTS ? (v as F501Variant) : "plana");

/** Explicación del esquema para las láminas y los CSV. */
export const F501_SCHEME = "ID de cable ANSI/AVIXA F501.01: SALA-SEÑAL-NNN (código del ambiente, familia de señal y correlativo), único en toda la obra y rotulado en las dos puntas.";

/** Formato válido de un ID (letras y números en mayúscula separados por guiones, termina en número o sufijo de desempate). */
export const F501_ID_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/;

/** Código corto de señal: mayúsculas sin símbolos ("Red / LAN" → "REDLAN"; "speaker" → "SPEAKER"). */
export const signalCode = (s: string) => s.normalize("NFD").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8) || "CBL";

/** Código de sala limpio (mayúsculas, sin símbolos). */
const roomPart = (code: string | null | undefined) => (code ?? "").normalize("NFD").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** Etiqueta del plano técnico en el formato del sistema ("HDMI-001", "NET-12"). */
const SYSTEM_LABEL_RE = /^([A-Z0-9]+)-(\d+)$/;

export type F501Input = {
  /** Etiqueta puesta en el plano técnico (null si no tiene). */
  label: string | null;
  /** Familia de señal del cable (para el correlativo de los que no tienen etiqueta). */
  signal: string;
};

/**
 * IDs F501 de los cables de un ambiente, en el mismo orden. `taken` son IDs ya
 * usados en otros ambientes de la obra (se completa con los de este).
 */
export function assignF501Ids(cables: F501Input[], room: string | null, taken: Set<string> = new Set()): string[] {
  const prefix = roomPart(room);
  const withRoom = (s: string) => (prefix ? `${prefix}-${s}` : s);
  // Correlativos ya usados por las etiquetas del plano técnico, para que los nuevos no se pisen.
  const used = new Map<string, Set<number>>();
  for (const c of cables) {
    const m = c.label ? SYSTEM_LABEL_RE.exec(c.label.trim().toUpperCase()) : null;
    if (m) {
      const set = used.get(m[1]!) ?? new Set<number>();
      set.add(Number(m[2]));
      used.set(m[1]!, set);
    }
  }
  const next = new Map<string, number>();
  return cables.map((c) => {
    let base: string;
    const own = c.label?.trim().toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9-]/g, "") ?? "";
    const m = SYSTEM_LABEL_RE.exec(own);
    if (m) base = withRoom(`${m[1]}-${m[2]!.padStart(3, "0")}`);
    else if (own) base = withRoom(own);
    else {
      const code = signalCode(c.signal);
      const set = used.get(code) ?? new Set<number>();
      let k = next.get(code) ?? 0;
      do k++;
      while (set.has(k));
      next.set(code, k);
      set.add(k);
      used.set(code, set);
      base = withRoom(`${code}-${String(k).padStart(3, "0")}`);
    }
    return unique(base, taken);
  });
}

/** Desempate de IDs repetidos: -B, -C… (la primera aparición queda sin sufijo). */
function unique(base: string, taken: Set<string>): string {
  let id = base;
  for (let i = 1; taken.has(id); i++) id = `${base}-${suffix(i)}`;
  taken.add(id);
  return id;
}

/** 1 → B, 2 → C … 25 → Z, 26 → BA (la A queda implícita en el original). */
function suffix(i: number): string {
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  } while (n > 0);
  return s;
}
