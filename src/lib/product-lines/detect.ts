/**
 * Detección de la SERIE del fabricante (ProductLine) a partir de datos que ya
 * trae cada producto. Funciones puras: las usa scripts/product-lines-apply.ts y
 * los tests. Criterio: solo fuentes explícitas y listas cerradas; lo dudoso
 * queda sin serie (no se adivina).
 *
 * Los nombres de serie son nombres propios de la marca: no se traducen, solo
 * se normaliza la forma (sin «Series», mayúsculas como las usa el fabricante).
 *
 * Prioridad: `line` cargado a mano > prefijo de modelo (reglas explícitas) >
 * ruta de Crestron > atributo «Product Category» de Sonance/James/IPORT/Blaze.
 */

export type ProductLineSourceKey = "CRESTRON_PATH" | "SONANCE_ATTR" | "LINE" | "MODEL_PREFIX" | "MANUAL";

export type SeriesInput = {
  brandName: string | null;
  modelNumber?: string | null;
  supplierSku?: string | null;
  /** Texto libre «Línea o serie del fabricante» (Blaze, Bluesound). */
  line?: string | null;
  sourceCategoryPath?: string | null;
  sourceMetadata?: unknown;
};

export type SeriesDetection =
  | { kind: "series"; name: string; source: ProductLineSourceKey; evidence: string }
  | { kind: "ambiguous"; candidates: string[]; evidence: string }
  | { kind: "none" };

/** Clave de marca: minúsculas, sin espacios extra. */
export function brandKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Slug estable para (marca, serie). */
export function seriesSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Forma de un nombre de serie: saca «Series»/«Serie»/«Collection», espacios
 * dobles y comillas. No traduce ni cambia mayúsculas (salvo todo en minúscula,
 * que se capitaliza).
 */
export function normalizeSeriesName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).replace(/[ \s]+/g, " ").replace(/["“”]/g, "").trim();
  s = s.replace(/\s+(series|serie|collection)$/i, "").replace(/^(series|serie|collection)\s+/i, "").trim();
  if (!s || s.length > 60 || /^(series|serie|collection)$/i.test(s)) return null;
  if (s === s.toLowerCase()) s = s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return s;
}

// ─── Crestron: ruta de categoría de crestron.com ─────────────────────────────

/**
 * Segmentos de la ruta de crestron.com que SON una serie (lista cerrada). Los
 * demás segmentos son tipos genéricos («Keypads», «Fliptops», «Control System»…)
 * y no dan serie. Se mira el nivel 2 y, si no, el 3.
 */
const CRESTRON_PATH_SERIES: Record<string, string> = {
  horizon: "Horizon",
  cameo: "Cameo",
  "cameo keypad": "Cameo",
  // Modelos internacionales de la misma serie Cameo.
  "cameo international": "Cameo",
  "cameo express": "Cameo Express",
  "flex conferencing": "Flex",
  "dm nvx av over ip": "DM NVX",
  airmedia: "AirMedia",
  "zum wired lighting": "Zūm",
  "zum wireless lighting": "Zūm",
  "hr series remotes": "HR",
  "mpc / mpc presentation controlller": "MPC",
  "mpc / mpc presentation controller": "MPC",
};

export function crestronSeriesFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const parts = path.split(">").map((p) => p.trim()).filter(Boolean);
  // «Inactive > Discontinued > C»: discontinuados, la ruta no dice nada.
  if (!parts.length || /^inactive$/i.test(parts[0])) return null;
  for (const level of [1, 2]) {
    const seg = parts[level];
    if (!seg) continue;
    const key = seg.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
    if (CRESTRON_PATH_SERIES[key]) return CRESTRON_PATH_SERIES[key];
  }
  return null;
}

// ─── Sonance / James / IPORT / Blaze: atributo «Product Category» ────────────

/**
 * Valores del atributo «Product Category» (portal Sonance) que son serie, por
 * marca. null = valor conocido que NO es serie (tipo de producto, indumentaria…).
 * Valores fuera de la lista: no dan serie.
 */
const SONANCE_ATTR_SERIES: Record<string, Record<string, string | null>> = {
  sonance: {
    "visual experience": "Visual Experience",
    "visual performance series": "Visual Performance",
    "professional series": "Professional",
    mariner: "Mariner",
    // Generación anterior de la misma serie Mariner.
    "legacy mariner": "Mariner",
    "architectural series": "Architectural",
    "invisible series": "Invisible",
    "reference series": "Reference",
    "landscape series": "Landscape",
    powerpipe: "PowerPipe",
    "small aperture": "Small Aperture",
    "c series": "C",
    "garden series": "Garden",
    "patio series": "Patio",
    "impact series": "Impact",
    "omni series": "Omni",
    optilinq: "Optilinq",
    rocks: null,
    soundbar: null,
    amplifiers: null,
    "volume controls": null,
    "speaker selectors": null,
    subwoofer: null,
    accessories: null,
    apparel: null,
    jacket: null,
    polos: null,
    "t-shirt": null,
    hat: null,
  },
  james: {
    "small aperture": "Small Aperture",
    powerpipe: "PowerPipe",
    qx: "QX",
    qxc: "QXC",
    "be series": "BE",
    "all-terrain": "All-Terrain",
    "omni series": "Omni",
    mavericks: "Mavericks",
    subterranean: "Subterranean",
    emb: "EMB",
    fxa: "FXA",
    wedge: "Wedge",
    "visual experience": "Visual Experience",
    "landscape series": "Landscape",
    "invisible series": "Invisible",
    cube: null,
    "outdoor tower": null,
    "on wall": null,
    pendants: null,
    soundbar: null,
    amplifiers: null,
    accessories: null,
    apparel: null,
    polos: null,
    "t-shirt": null,
  },
  iport: {
    connect: "CONNECT",
    "connect pro": "CONNECT PRO",
    "connect mount": "CONNECT MOUNT",
    "surface mount": "Surface Mount",
    "luxe mount": "LUXE",
    apparel: null,
    jacket: null,
    "t-shirt": null,
    hat: null,
    polos: null,
  },
  "blaze by sonance": {
    "cbl series": "CBL",
    "cca series": "CCA",
    amplifiers: null,
    "wall controller": null,
    // Tubos de puerto PowerPipe vendidos con marca Blaze: no es serie de Blaze.
    powerpipe: null,
  },
};

type AttrType = { name?: unknown; attributeValues?: Array<{ value?: unknown }> };

/** Valores de un atributo del portal Sonance (attributeTypes[].attributeValues[].value). */
export function sonanceAttributeValues(metadata: unknown, attributeName: string): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const types = (metadata as { attributeTypes?: unknown }).attributeTypes;
  if (!Array.isArray(types)) return [];
  const want = attributeName.toLowerCase();
  const out: string[] = [];
  for (const t of types as AttrType[]) {
    if (typeof t?.name !== "string" || t.name.toLowerCase() !== want) continue;
    for (const v of t.attributeValues ?? []) if (typeof v?.value === "string" && v.value.trim()) out.push(v.value.trim());
  }
  return out;
}

/**
 * Series candidatas según el portal Sonance: atributo «Series» (si algún día
 * viene) y «Product Category» filtrado por la lista de la marca.
 */
export function sonanceSeriesCandidates(brandName: string | null, metadata: unknown): string[] {
  const table = SONANCE_ATTR_SERIES[brandKey(brandName)];
  const found = new Set<string>();
  for (const v of sonanceAttributeValues(metadata, "Series")) {
    const n = normalizeSeriesName(v);
    if (n) found.add(n);
  }
  if (table) {
    for (const v of sonanceAttributeValues(metadata, "Product Category")) {
      const mapped = table[v.toLowerCase().replace(/\s+/g, " ")];
      if (mapped) found.add(mapped);
    }
  }
  return [...found];
}

// ─── Campo `line` existente (Blaze, Bluesound) ───────────────────────────────

export function seriesFromLine(line: string | null | undefined): string | null {
  return normalizeSeriesName(line);
}

// ─── Prefijo de modelo: reglas explícitas y conservadoras ────────────────────

type PrefixRule = { re: RegExp; series: string };

/** Solo prefijos que en el catálogo actual corresponden siempre a la misma serie. */
const MODEL_PREFIX_RULES: Record<string, PrefixRule[]> = {
  crestron: [
    { re: /^HZ\d?-/, series: "Horizon" },
    // Crestron los publica bajo «DM NVX AV Over IP», pero DM NAX es su propia línea de audio en red.
    { re: /^DM-NAX-/, series: "DM NAX" },
  ],
  sonance: [
    { re: /^VP(\d|XT|BPC|SUB|\s|-)/, series: "Visual Performance" },
    { re: /^VX(\d|XT|Q|\s|-)/, series: "Visual Experience" },
    { re: /^LS\d/, series: "Landscape" },
    { re: /^PS-/, series: "Professional" },
    { re: /^IS-/, series: "Invisible" },
  ],
  james: [
    { re: /^XPC-/, series: "XPC" },
    { re: /^QXC\d/, series: "QXC" },
    { re: /^SA\d/, series: "Small Aperture" },
    { re: /^BE\d/, series: "BE" },
    { re: /^AT\d/, series: "All-Terrain" },
    { re: /^ST\d/, series: "Subterranean" },
    { re: /^EMB\d/, series: "EMB" },
    { re: /^OMNI\d/, series: "Omni" },
  ],
  "blaze by sonance": [
    { re: /^POWERZONE\b/, series: "PowerZone" },
    { re: /^CBL\d/, series: "CBL" },
    { re: /^CCA\d/, series: "CCA" },
  ],
};

export function seriesFromModelPrefix(brandName: string | null, model: string | null | undefined): string | null {
  const rules = MODEL_PREFIX_RULES[brandKey(brandName)];
  const m = (model ?? "").trim().toUpperCase();
  if (!rules || !m) return null;
  return rules.find((r) => r.re.test(m))?.series ?? null;
}

// ─── Detección completa ──────────────────────────────────────────────────────

export function detectProductSeries(p: SeriesInput): SeriesDetection {
  const fromLine = seriesFromLine(p.line);
  if (fromLine) return { kind: "series", name: fromLine, source: "LINE", evidence: `line=${p.line}` };

  const model = p.modelNumber || p.supplierSku || "";
  const fromPrefix = seriesFromModelPrefix(p.brandName, model);
  if (fromPrefix) return { kind: "series", name: fromPrefix, source: "MODEL_PREFIX", evidence: `modelo ${model}` };

  if (brandKey(p.brandName) === "crestron") {
    const fromPath = crestronSeriesFromPath(p.sourceCategoryPath);
    return fromPath
      ? { kind: "series", name: fromPath, source: "CRESTRON_PATH", evidence: p.sourceCategoryPath ?? "" }
      : { kind: "none" };
  }

  const candidates = sonanceSeriesCandidates(p.brandName, p.sourceMetadata);
  if (candidates.length === 1) {
    return { kind: "series", name: candidates[0], source: "SONANCE_ATTR", evidence: `Product Category: ${candidates[0]}` };
  }
  if (candidates.length > 1) return { kind: "ambiguous", candidates, evidence: candidates.join(" / ") };
  return { kind: "none" };
}

/**
 * `productLine` con JSON crudo del portal (`{"id":…,"name":"SGS Systems"}`):
 * devuelve el nombre. Texto normal: null (no hay nada que limpiar).
 */
export function cleanRawProductLine(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(v) as { name?: unknown };
    return typeof parsed?.name === "string" && parsed.name.trim() ? parsed.name.trim() : "";
  } catch {
    return null;
  }
}
