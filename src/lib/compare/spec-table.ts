/**
 * Arma la tabla de especificaciones de la comparación: alinea por rótulo los
 * datos de 2 a 4 fichas que vienen de fabricantes distintos y en idiomas
 * mezclados («Weight» / «Peso», «Frequency Response (+/- 3dB)» / «Respuesta en
 * frecuencia (±3 dB)»), marca qué filas difieren y deja afuera lo que no sirve
 * para comparar (SKU, UPC, marca y rubro repetidos). Sin base de datos.
 */

export interface SpecSource {
  specifications: unknown;
  widthCm?: number | null;
  heightCm?: number | null;
  depthCm?: number | null;
  weightKg?: number | null;
}

export interface SpecRow {
  key: string;
  label: string;
  /** Un valor por producto, en el orden recibido; null = esa ficha no lo trae. */
  values: Array<string | null>;
  /** Hay al menos dos valores distintos, o un producto lo tiene y otro no. */
  differs: boolean;
}

export interface SpecGroup {
  name: string;
  rows: SpecRow[];
}

export interface SpecTable {
  groups: SpecGroup[];
  rowCount: number;
  diffCount: number;
}

type Canonical = { label: string; group: string; aliases: string[] };

const G_GENERAL = "General";
const G_AUDIO = "Audio";
const G_POWER = "Alimentación";
const G_SIZE = "Medidas y peso";
const G_ENV = "Ambiente";
const G_SHIP = "Envío y embalaje";
const OTHER = "Otras especificaciones";

/** Rótulos equivalentes (inglés y español de los portales) → uno solo, en español. */
const CANONICAL: Record<string, Canonical> = {
  type: { label: "Tipo", group: G_GENERAL, aliases: ["type", "tipo", "product type", "tipo de producto"] },
  color: { label: "Color", group: G_GENERAL, aliases: ["color", "colour", "colores", "available colors", "colores disponibles"] },
  finish: { label: "Terminación", group: G_GENERAL, aliases: ["finish", "finish type", "terminacion", "acabado"] },
  mounting: { label: "Montaje", group: G_GENERAL, aliases: ["mounting", "mounting type", "montaje", "tipo de montaje"] },
  installation: { label: "Instalación", group: G_GENERAL, aliases: ["installation", "instalacion", "installation location", "ubicacion de instalacion"] },
  construction: { label: "Construcción", group: G_GENERAL, aliases: ["construction", "construccion"] },
  enclosure: { label: "Gabinete", group: G_GENERAL, aliases: ["enclosure", "gabinete", "housing", "carcasa"] },
  grille: { label: "Rejilla", group: G_GENERAL, aliases: ["grille", "grill", "rejilla", "grille material", "material de la rejilla"] },
  warranty: { label: "Garantía", group: G_GENERAL, aliases: ["warranty", "garantia"] },
  ip: { label: "Grado IP", group: G_GENERAL, aliases: ["ip rating", "grado ip", "ip"] },
  frequency: {
    label: "Respuesta en frecuencia",
    group: G_AUDIO,
    aliases: ["frequency response", "respuesta en frecuencia", "frequency range", "rango de frecuencia"],
  },
  impedance: { label: "Impedancia", group: G_AUDIO, aliases: ["impedance", "nominal impedance", "impedancia", "impedancia nominal"] },
  sensitivity: { label: "Sensibilidad", group: G_AUDIO, aliases: ["sensitivity", "sensibilidad"] },
  powerHandling: { label: "Potencia admisible", group: G_AUDIO, aliases: ["power handling", "potencia admisible", "potencia maxima admisible"] },
  recommendedAmp: {
    label: "Potencia de amplificador recomendada",
    group: G_AUDIO,
    aliases: ["recommended amplifier power", "potencia de amplificador recomendada", "amplificador recomendado"],
  },
  woofer: { label: "Woofer", group: G_AUDIO, aliases: ["woofer", "speaker woofer"] },
  tweeter: { label: "Tweeter", group: G_AUDIO, aliases: ["tweeter", "speaker tweeter"] },
  speakerSize: { label: "Tamaño del parlante", group: G_AUDIO, aliases: ["speaker size", "tamano del parlante", "tamano del altavoz"] },
  dispersion: { label: "Dispersión", group: G_AUDIO, aliases: ["dispersion", "dispersion technology", "dispersion angle", "angulo de dispersion"] },
  powerSupply: { label: "Fuente de alimentación", group: G_POWER, aliases: ["power supply", "fuente de alimentacion"] },
  powerReq: { label: "Alimentación", group: G_POWER, aliases: ["power requirements", "power", "alimentacion", "power input", "entrada de alimentacion"] },
  consumption: { label: "Consumo", group: G_POWER, aliases: ["power consumption", "consumo", "consumo de energia"] },
  poe: { label: "Power over Ethernet", group: G_POWER, aliases: ["power over ethernet", "poe"] },
  heat: { label: "Disipación térmica", group: G_POWER, aliases: ["heat dissipation", "disipacion termica", "disipacion de calor"] },
  dimensions: {
    label: "Medidas (an × al × prof)",
    group: G_SIZE,
    aliases: ["dimensions", "product dimensions", "medidas", "medidas del producto", "dimensiones", "dimensiones del producto"],
  },
  width: { label: "Ancho", group: G_SIZE, aliases: ["width", "product width", "ancho", "ancho del producto"] },
  height: { label: "Alto", group: G_SIZE, aliases: ["height", "product height", "alto", "alto del producto", "altura"] },
  depth: { label: "Profundidad", group: G_SIZE, aliases: ["depth", "product depth", "profundidad", "profundidad del producto"] },
  diameter: { label: "Diámetro", group: G_SIZE, aliases: ["product diameter", "diameter", "diametro", "diametro del producto"] },
  cutout: {
    label: "Calado (diámetro de corte)",
    group: G_SIZE,
    aliases: ["cut out dimensions", "cutout dimensions", "cut out diameter", "cutout diameter", "diametro de corte", "calado"],
  },
  weight: { label: "Peso", group: G_SIZE, aliases: ["weight", "product weight", "peso", "peso del producto", "net weight", "peso neto"] },
  opTemp: {
    label: "Temperatura de funcionamiento",
    group: G_ENV,
    aliases: ["temperature", "operating temperature", "temperatura", "temperatura de funcionamiento", "temperatura de operacion"],
  },
  storageTemp: { label: "Temperatura de almacenamiento", group: G_ENV, aliases: ["storage temperature", "temperatura de almacenamiento"] },
  humidity: { label: "Humedad", group: G_ENV, aliases: ["humidity", "operating humidity", "humedad", "humedad de funcionamiento"] },
  shipWeight: { label: "Peso de envío", group: G_SHIP, aliases: ["shipping weight", "peso de envio"] },
  shipDims: { label: "Medidas de envío", group: G_SHIP, aliases: ["shipping dimensions", "shipping dimensions wxhxd", "medidas de envio"] },
  packQty: { label: "Unidades por bulto", group: G_SHIP, aliases: ["master pack quantity", "unidades por bulto"] },
  packWeight: { label: "Peso del bulto", group: G_SHIP, aliases: ["master pack shipping weight", "peso de envio del bulto"] },
  packDims: {
    label: "Medidas del bulto",
    group: G_SHIP,
    aliases: ["master pack shipping dimensions", "master pack shipping dimensions wxhxd", "medidas de envio del bulto"],
  },
};

/** Datos que no comparan nada o ya están arriba (marca, rubro, serie). */
const SKIP = new Set([
  "sku",
  "upc",
  "ean",
  "product brand",
  "brand",
  "marca",
  "product category",
  "product super category",
  "product sub category",
  "categoria",
  "subcategoria",
  "product status",
  "prop 65 warning",
  "linea",
  "product line",
  "modelo",
  "model",
]);

const GROUP_ORDER = [G_GENERAL, G_AUDIO, G_POWER, G_SIZE, G_ENV];
const GROUP_LAST = [OTHER, G_SHIP];

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Rótulo → clave de comparación: sin acentos, sin paréntesis («(±3 dB)», «(WxHxD)»), sin signos. */
export function normalizeSpecLabel(label: string): string {
  return stripAccents(label.toLowerCase())
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(w\s*x\s*h\s*x\s*d|an\s*x\s*al\s*x\s*p)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const ALIAS_TO_KEY = new Map<string, string>();
for (const [key, def] of Object.entries(CANONICAL)) for (const alias of def.aliases) ALIAS_TO_KEY.set(normalizeSpecLabel(alias), key);

function normalizeValue(v: string): string {
  return stripAccents(v.toLowerCase()).replace(/\s+/g, " ").replace(/(\d),0+\b|(\d)\.0+\b/g, "$1$2").trim();
}

interface RawSpec {
  group?: unknown;
  label?: unknown;
  labelEs?: unknown;
  name?: unknown;
  value?: unknown;
  valueEs?: unknown;
  attributeValues?: Array<{ value?: unknown; valueDisplay?: unknown }>;
}

/** Lo mismo que muestra la ficha: rótulo y valor en español si hay. */
function readSpecs(specifications: unknown): Array<{ group: string; label: string; value: string }> {
  if (!Array.isArray(specifications)) return [];
  const out: Array<{ group: string; label: string; value: string }> = [];
  for (const raw of specifications as RawSpec[]) {
    if (!raw || typeof raw !== "object") continue;
    const label = String(raw.labelEs || raw.label || raw.name || "").trim();
    const listed = Array.isArray(raw.attributeValues)
      ? raw.attributeValues.map((av) => String(av?.valueDisplay ?? av?.value ?? "")).filter(Boolean).join(" · ")
      : "";
    const value = String(raw.valueEs || raw.value || listed || "").trim();
    if (label && value) out.push({ group: String(raw.group ?? "").trim(), label, value });
  }
  return out;
}

function fmt(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

/** Medidas y peso de las columnas propias del producto, por si la ficha no los trae. */
function fromColumns(src: SpecSource): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  const dims = [src.widthCm, src.heightCm, src.depthCm];
  if (dims.every((d) => d != null && d > 0)) out.push({ key: "dimensions", value: `${dims.map((d) => fmt(d!)).join(" × ")} cm` });
  if (src.weightKg != null && src.weightKg > 0) out.push({ key: "weight", value: `${fmt(src.weightKg)} kg` });
  return out;
}

export function buildSpecTable(sources: SpecSource[]): SpecTable {
  type Acc = { key: string; label: string; group: string; order: number; values: Array<string | null> };
  const rows = new Map<string, Acc>();
  let order = 0;
  const n = sources.length;

  const put = (index: number, key: string, label: string, group: string, value: string) => {
    let row = rows.get(key);
    if (!row) {
      row = { key, label, group, order: order++, values: Array<string | null>(n).fill(null) };
      rows.set(key, row);
    }
    // Si la ficha repite el rótulo (p. ej. dos «Peso»), se suma sin duplicar.
    const prev = row.values[index];
    if (prev == null) row.values[index] = value;
    else if (normalizeValue(prev) !== normalizeValue(value) && !prev.includes(value)) row.values[index] = `${prev} · ${value}`;
  };

  sources.forEach((src, index) => {
    for (const spec of readSpecs(src.specifications)) {
      const norm = normalizeSpecLabel(spec.label);
      if (!norm || SKIP.has(norm)) continue;
      const canonicalKey = ALIAS_TO_KEY.get(norm);
      if (canonicalKey) {
        const def = CANONICAL[canonicalKey];
        put(index, canonicalKey, def.label, def.group, spec.value);
      } else {
        put(index, `x:${norm}`, spec.label, spec.group || OTHER, spec.value);
      }
    }
    for (const col of fromColumns(src)) {
      const row = rows.get(col.key);
      if (row && row.values[index] != null) continue;
      const def = CANONICAL[col.key];
      put(index, col.key, def.label, def.group, col.value);
    }
  });

  const finished: Array<SpecRow & { group: string; order: number; present: number }> = [...rows.values()].map((r) => {
    const present = r.values.filter((v) => v != null) as string[];
    const distinct = new Set(present.map(normalizeValue));
    return {
      key: r.key,
      label: r.label,
      values: r.values,
      group: r.group,
      order: r.order,
      present: present.length,
      differs: n > 1 && (distinct.size > 1 || present.length < n),
    };
  });

  const groupNames = [...new Set(finished.sort((a, b) => a.order - b.order).map((r) => r.group))];
  const rank = (g: string) => {
    const head = GROUP_ORDER.indexOf(g);
    if (head >= 0) return head;
    const tail = GROUP_LAST.indexOf(g);
    if (tail >= 0) return 1000 + tail;
    return 100 + groupNames.indexOf(g);
  };
  groupNames.sort((a, b) => rank(a) - rank(b));

  const groups: SpecGroup[] = groupNames.map((name) => ({
    name,
    // Primero lo que traen más fichas (lo realmente comparable), después en el orden de la ficha.
    rows: finished
      .filter((r) => r.group === name)
      .sort((a, b) => b.present - a.present || a.order - b.order)
      .map(({ key, label, values, differs }) => ({ key, label, values, differs })),
  }));
  const all = groups.flatMap((g) => g.rows);
  return { groups, rowCount: all.length, diffCount: all.filter((r) => r.differs).length };
}

/** Solo las filas que cambian entre productos (grupos vacíos fuera). */
export function onlyDifferences(table: SpecTable): SpecGroup[] {
  return table.groups.map((g) => ({ ...g, rows: g.rows.filter((r) => r.differs) })).filter((g) => g.rows.length > 0);
}
