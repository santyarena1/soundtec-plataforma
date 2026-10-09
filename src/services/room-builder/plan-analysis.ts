/**
 * Lectura de un plano completo: qué tipo de proyecto es y qué ambientes
 * tiene. La IA propone; acá se valida y normaliza, se calcula la escala y
 * se convierten los recuadros del plano en medidas reales.
 * Coordenadas de recuadros: normalizadas 0..1 sobre la imagen.
 */

export const PLAN_KINDS = ["residencial", "corporativo", "hoteleria", "educacion", "comercial", "eventos", "otro"] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

export const PLAN_KIND_LABELS: Record<PlanKind, string> = {
  residencial: "Residencial",
  corporativo: "Corporativo",
  hoteleria: "Hotelería",
  educacion: "Educación",
  comercial: "Comercial / gastronomía",
  eventos: "Eventos",
  otro: "Otro",
};

/** Categoría del proyecto contenedor según el tipo de plano. */
export const PLAN_KIND_CATEGORY: Record<PlanKind, string> = {
  residencial: "residential",
  corporativo: "videoconference",
  hoteleria: "hotel",
  educacion: "classroom",
  comercial: "commercial",
  eventos: "event",
  otro: "residential",
};

export type PlanBox = { x0: number; y0: number; x1: number; y1: number };

export type DetectedRoom = {
  id: string;
  name: string;
  /** null = no lleva equipos (baño, pasillo, lavadero…). */
  templateKey: string | null;
  box: PlanBox;
  /** Medidas leídas del plano (m), si estaban escritas. */
  widthM: number | null;
  depthM: number | null;
  include: boolean;
};

export type PlanAnalysis = {
  kind: PlanKind;
  summary: string;
  rooms: DetectedRoom[];
};

/** Recuadro mínimo (fracción de la imagen) para considerarlo un ambiente. */
const MIN_BOX = 0.02;
const MAX_ROOMS = 40;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Palabras del nombre → tipo de ambiente (respaldo si la IA no da uno válido). */
const KEYWORD_TEMPLATES: Array<[RegExp, string | null]> = [
  [/baño|toilette|toilet|ducha|lavadero|lavandería|pasillo|hall de servicio|depósito|baulera|placard|vestidor|escalera|circulaci/i, null],
  [/cine|home theater|media room/i, "residential-cinema-m"],
  [/dormitorio|habitaci|suite|cuarto|bedroom/i, "residential-bedroom-m"],
  [/cocina|comedor|kitchen|dining|desayunador/i, "residential-dining-m"],
  [/galer|jard|terraza|patio|quincho|balc|parrilla|pileta|piscina|exterior/i, "residential-outdoor-m"],
  [/living|estar|sala de estar|playroom|family/i, "residential-living-m"],
  [/directorio|board/i, "vc-boardroom-m"],
  [/reuni|meeting|conferencia/i, "vc-meeting-m"],
  [/huddle|focus|phone/i, "vc-huddle-s"],
  [/capacitaci|training|sum\b/i, "training-l"],
  [/aula|clase/i, "classroom-m"],
  [/recepci|lobby|hall|acceso/i, "lobby-m"],
  [/restaurant|resto|bar|salón comedor|cafeter/i, "restaurant-m"],
  [/local|tienda|showroom|venta/i, "retail-store-m"],
  [/salón|evento|auditorio/i, "event-banquet-l"],
  [/sala técnica|rack|control|site/i, "control-room-m"],
];

export function templateFromName(name: string): string | null | undefined {
  for (const [re, key] of KEYWORD_TEMPLATES) if (re.test(name)) return key;
  return undefined;
}

function normalizeBox(raw: unknown): PlanBox | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const vals = [num(r.x0), num(r.y0), num(r.x1), num(r.y1)];
  if (vals.some((v) => v == null)) return null;
  let [x0, y0, x1, y1] = vals as number[];
  // Acepta porcentajes (0..100) además de fracciones.
  if (Math.max(x0, y0, x1, y1) > 1.5) [x0, y0, x1, y1] = [x0, y0, x1, y1].map((v) => v / 100);
  const box = { x0: clamp01(Math.min(x0, x1)), y0: clamp01(Math.min(y0, y1)), x1: clamp01(Math.max(x0, x1)), y1: clamp01(Math.max(y0, y1)) };
  return box.x1 - box.x0 >= MIN_BOX && box.y1 - box.y0 >= MIN_BOX ? box : null;
}

/** Valida la respuesta de la IA contra las plantillas existentes. */
export function normalizePlanAnalysis(raw: unknown, templateKeys: string[]): PlanAnalysis {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const kind = PLAN_KINDS.includes(r.kind as PlanKind) ? (r.kind as PlanKind) : "otro";
  const valid = new Set(templateKeys);
  const roomsRaw = Array.isArray(r.rooms) ? r.rooms.slice(0, MAX_ROOMS) : [];
  const rooms: DetectedRoom[] = [];
  roomsRaw.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const it = item as Record<string, unknown>;
    const box = normalizeBox(it.box ?? it);
    if (!box) return;
    const name = typeof it.name === "string" && it.name.trim() ? it.name.trim().slice(0, 60) : `Ambiente ${i + 1}`;
    const proposed = typeof it.templateKey === "string" && valid.has(it.templateKey) ? it.templateKey : undefined;
    const fromName = templateFromName(name);
    const templateKey = it.templateKey === null || it.noEquipment === true ? null : (proposed ?? (fromName === undefined ? null : fromName));
    const w = num(it.widthM);
    const d = num(it.depthM);
    rooms.push({
      id: `r${i + 1}`,
      name,
      templateKey: templateKey && valid.has(templateKey) ? templateKey : null,
      box,
      widthM: w && w > 0.5 && w < 200 ? w : null,
      depthM: d && d > 0.5 && d < 200 ? d : null,
      include: Boolean(templateKey && valid.has(templateKey)),
    });
  });
  return { kind, summary: typeof r.summary === "string" ? r.summary.slice(0, 400) : "", rooms };
}

/**
 * Metros por píxel a partir de los ambientes con medidas leídas (mediana,
 * para que una medida mal leída no arruine la escala). null si no hay datos.
 */
export function estimateMetersPerPixel(rooms: DetectedRoom[], imageWidthPx: number, imageHeightPx: number): number | null {
  const samples: number[] = [];
  for (const r of rooms) {
    const wPx = (r.box.x1 - r.box.x0) * imageWidthPx;
    const hPx = (r.box.y1 - r.box.y0) * imageHeightPx;
    // La medida más larga va con el lado más largo del recuadro.
    const dims = [r.widthM, r.depthM].filter((v): v is number => v != null).sort((a, b) => b - a);
    const sides = [wPx, hPx].sort((a, b) => b - a);
    dims.forEach((m, i) => {
      if (sides[i] > 0) samples.push(m / sides[i]);
    });
  }
  if (!samples.length) return null;
  samples.sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  return samples.length % 2 ? samples[mid] : (samples[mid - 1] + samples[mid]) / 2;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const MIN_SIDE_M = 1.5;

/** Medidas de un ambiente: las leídas si las hay; si no, por escala. */
export function roomSizeMeters(room: DetectedRoom, metersPerPixel: number | null, imageWidthPx: number, imageHeightPx: number): { widthM: number; depthM: number } | null {
  const wPx = (room.box.x1 - room.box.x0) * imageWidthPx;
  const hPx = (room.box.y1 - room.box.y0) * imageHeightPx;
  if (metersPerPixel) {
    return { widthM: Math.max(MIN_SIDE_M, round1(wPx * metersPerPixel)), depthM: Math.max(MIN_SIDE_M, round1(hPx * metersPerPixel)) };
  }
  if (room.widthM && room.depthM) {
    const [long, short] = [room.widthM, room.depthM].sort((a, b) => b - a);
    return wPx >= hPx ? { widthM: long, depthM: short } : { widthM: short, depthM: long };
  }
  return null;
}
