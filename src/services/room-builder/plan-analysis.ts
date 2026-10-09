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
  /** Forma real cuando no es un recuadro (dibujada con el lápiz o editada); box es su caja contenedora. */
  polygon?: Array<{ x: number; y: number }>;
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

/** Ambiente genérico: cualquier espacio que no encaja en un tipo (se le agregan equipos a mano). */
export const GENERIC_TEMPLATE = "generic-room";

/**
 * Palabras del nombre → tipo de ambiente. El orden importa (lo más específico
 * primero). null = no lleva equipos (depósitos, placards, escaleras).
 */
const KEYWORD_TEMPLATES: Array<[RegExp, string | null]> = [
  [/depósito|deposito|baulera|placard|vestidor|escalera|ducto|shaft|sala de máquinas|tablero/i, null],
  [/baño|toilette|toilet|ducha|sanitario|vestuario|wc\b/i, "restroom-s"],
  [/lavadero|lavandería/i, GENERIC_TEMPLATE],
  [/pasillo|circulaci|hall de servicio|corredor/i, "circulation-m"],
  [/cine|home theater|media room/i, "residential-cinema-m"],
  [/dormitorio|habitaci|suite|cuarto|bedroom/i, "residential-bedroom-m"],
  [/descanso|break|office\b|kitchenette|comedor de personal|cafetería interna/i, "breakroom-m"],
  [/open ?space|puestos|estaciones de trabajo|workstation|área de trabajo|planta abierta/i, "office-open-l"],
  [/oficina|despacho|gerencia|director\b|privado/i, "office-private-m"],
  [/cocina|comedor|kitchen|dining|desayunador/i, "residential-dining-m"],
  [/galer|jard|terraza|patio|quincho|balc|parrilla|pileta|piscina|exterior/i, "residential-outdoor-m"],
  [/living|estar|sala de estar|playroom|family/i, "residential-living-m"],
  [/directorio|board/i, "vc-boardroom-m"],
  [/reuni|meeting|conferencia/i, "vc-meeting-m"],
  [/huddle|focus|phone/i, "vc-huddle-s"],
  [/capacitaci|training|sum\b/i, "training-l"],
  [/aula|clase/i, "classroom-m"],
  [/recepci|lobby|hall|acceso|espera/i, "lobby-m"],
  [/restaurant|resto|bar|salón comedor|cafeter/i, "restaurant-m"],
  [/local|tienda|showroom|venta/i, "retail-store-m"],
  [/salón|evento|auditorio/i, "event-banquet-l"],
  [/sala técnica|rack|control|site/i, "control-room-m"],
];

/** Tipos que se generan por defecto (los de servicio vienen destildados, pero se pueden incluir). */
const OPTIONAL_BY_DEFAULT = new Set(["restroom-s", "circulation-m", GENERIC_TEMPLATE]);

export function templateFromName(name: string): string | null | undefined {
  for (const [re, key] of KEYWORD_TEMPLATES) if (re.test(name)) return key;
  return undefined;
}

/**
 * Tipo final de un ambiente: el nombre manda cuando es claro (un "Dormitorio 2"
 * es un dormitorio aunque la IA diga que no lleva equipos); si no, lo que
 * propuso la IA; si nada, ambiente libre (todo ambiente se puede generar).
 */
function resolveTemplate(proposed: string | undefined, fromName: string | null | undefined, valid: Set<string>): string | null {
  if (fromName !== undefined) return fromName;
  if (proposed) return proposed;
  return valid.has(GENERIC_TEMPLATE) ? GENERIC_TEMPLATE : null;
}

const includeByDefault = (templateKey: string | null, valid: Set<string>) => Boolean(templateKey && valid.has(templateKey) && !OPTIONAL_BY_DEFAULT.has(templateKey));

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
    const templateKey = resolveTemplate(proposed, fromName, valid);
    const w = num(it.widthM);
    const d = num(it.depthM);
    rooms.push({
      id: `r${i + 1}`,
      name,
      templateKey: templateKey && valid.has(templateKey) ? templateKey : null,
      box,
      widthM: w && w > 0.5 && w < 200 ? w : null,
      depthM: d && d > 0.5 && d < 200 ? d : null,
      include: includeByDefault(templateKey, valid),
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

/** Respuesta de la IA cuando los espacios ya vienen numerados sobre el plano. */
export function normalizeMarkedAnalysis(raw: unknown, regionBoxes: PlanBox[], templateKeys: string[]): PlanAnalysis {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const kind = PLAN_KINDS.includes(r.kind as PlanKind) ? (r.kind as PlanKind) : "otro";
  const valid = new Set(templateKeys);
  const marks = Array.isArray(r.marks) ? r.marks : [];
  const byNumber = new Map<number, Record<string, unknown>>();
  for (const m of marks) {
    if (!m || typeof m !== "object") continue;
    const n = num((m as Record<string, unknown>).n);
    if (n != null) byNumber.set(Math.round(n), m as Record<string, unknown>);
  }
  const rooms: DetectedRoom[] = [];
  regionBoxes.forEach((box, i) => {
    const m = byNumber.get(i + 1);
    // La IA puede descartar un número que no es un ambiente (hueco, ducto, exterior).
    if (m?.notARoom === true) return;
    const name = typeof m?.name === "string" && m.name.trim() ? m.name.trim().slice(0, 60) : `Ambiente ${i + 1}`;
    const proposed = typeof m?.templateKey === "string" && valid.has(m.templateKey) ? m.templateKey : undefined;
    const fromName = templateFromName(name);
    const templateKey = resolveTemplate(proposed, fromName, valid);
    const w = num(m?.widthM);
    const d = num(m?.depthM);
    rooms.push({
      id: `r${i + 1}`,
      name,
      templateKey: templateKey && valid.has(templateKey) ? templateKey : null,
      box,
      widthM: w && w > 0.5 && w < 200 ? w : null,
      depthM: d && d > 0.5 && d < 200 ? d : null,
      include: includeByDefault(templateKey, valid),
    });
  });
  // Ambientes que la IA ve en el plano pero no tienen número (no se pudieron cerrar).
  const missing = normalizePlanAnalysis({ rooms: Array.isArray(r.missing) ? r.missing : [] }, templateKeys).rooms.map((m, i) => ({ ...m, id: `m${i + 1}` }));
  return { kind, summary: typeof r.summary === "string" ? r.summary.slice(0, 400) : "", rooms: [...rooms, ...missing] };
}

/** Separación máxima (fracción de la imagen) para considerar vecinos dos recuadros. */
const NEIGHBOR_GAP = 0.02;

function touching(a: PlanBox, b: PlanBox): boolean {
  return a.x0 <= b.x1 + NEIGHBOR_GAP && b.x0 <= a.x1 + NEIGHBOR_GAP && a.y0 <= b.y1 + NEIGHBOR_GAP && b.y0 <= a.y1 + NEIGHBOR_GAP;
}

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase("es") === b.trim().toLocaleLowerCase("es");

/**
 * La detección prefiere cortar de más (un texto grande o los cubículos de un
 * baño pueden partir un ambiente): si la IA le pone el mismo nombre a dos
 * espacios vecinos, son el mismo ambiente y se unen.
 */
export function mergeSameNamedNeighbors(
  rooms: DetectedRoom[],
  /** Forma de la unión (la calcula quien tiene la grilla); sin ella queda la caja. */
  unionPolygon?: (a: DetectedRoom, b: DetectedRoom) => DetectedRoom["polygon"],
): DetectedRoom[] {
  const out = rooms.map((r) => ({ ...r, box: { ...r.box } }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = i + 1; j < out.length && !merged; j++) {
        const a = out[i];
        const b = out[j];
        if (!sameName(a.name, b.name) || a.templateKey !== b.templateKey || !touching(a.box, b.box)) continue;
        out[i] = {
          ...a,
          box: { x0: Math.min(a.box.x0, b.box.x0), y0: Math.min(a.box.y0, b.box.y0), x1: Math.max(a.box.x1, b.box.x1), y1: Math.max(a.box.y1, b.box.y1) },
          polygon: unionPolygon?.(a, b),
          widthM: a.widthM ?? b.widthM,
          depthM: a.depthM ?? b.depthM,
          include: a.include || b.include,
        };
        out.splice(j, 1);
        merged = true;
      }
    }
  }
  return out;
}
