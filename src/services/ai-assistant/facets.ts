/**
 * Traduce la pregunta a un filtro canónico sobre el perfil de producto.
 *
 * Es la pieza que cambia el comportamiento del asistente: antes cada consulta
 * se resolvía buscando palabras dentro del HTML del fabricante y el resultado
 * dependía de que la ficha usara justo esa palabra. Ahora "parlantes de
 * exterior con 70V" es una condición sobre tres columnas, y el conjunto que
 * devuelve es el conjunto completo, no las primeras filas que aparezcan.
 *
 * Cuesta 0 tokens: son expresiones regulares sobre la pregunta.
 */

import {
  APPLICATION_LABEL,
  ECOSYSTEM_LABEL,
  MOUNT_LABEL,
  PRODUCT_TYPE_LABEL_PLURAL,
  type Application,
  type AudioLine,
  type Ecosystem,
  type Environment,
  type MountType,
  type ProductType,
} from "./profile/vocab";

export interface CanonicalFilter {
  productType?: ProductType;
  environment?: Environment;
  mountTypes: MountType[];
  audioLine?: AudioLine;
  ecosystems: Ecosystem[];
  applications: Application[];
  ipRating?: string;
  brandNames: string[];
  /** Términos libres que no cayeron en ninguna faceta. */
  freeTerms: string[];
}

export function emptyFilter(): CanonicalFilter {
  return { mountTypes: [], ecosystems: [], applications: [], brandNames: [], freeTerms: [] };
}

export function isEmptyFilter(filter: CanonicalFilter): boolean {
  return (
    !filter.productType &&
    !filter.environment &&
    !filter.audioLine &&
    !filter.ipRating &&
    filter.mountTypes.length === 0 &&
    filter.ecosystems.length === 0 &&
    filter.applications.length === 0 &&
    filter.brandNames.length === 0
  );
}

/** Cuántas condiciones tiene: sirve para decidir si el filtro es específico. */
export function filterWeight(filter: CanonicalFilter): number {
  return (
    (filter.productType ? 1 : 0) +
    (filter.environment && filter.environment !== "UNKNOWN" ? 1 : 0) +
    (filter.audioLine ? 1 : 0) +
    (filter.ipRating ? 1 : 0) +
    filter.mountTypes.length +
    filter.ecosystems.length +
    filter.applications.length +
    filter.brandNames.length
  );
}

const TYPE_PATTERNS: Array<{ type: ProductType; re: RegExp }> = [
  { type: "subwoofer", re: /\bsub\s?woofers?\b|\bsubs?\b(?!\w)/i },
  { type: "speaker", re: /\bparlantes?\b|\baltavoc?e?s?\b|\bbafles?\b|\bspeakers?\b|\bcolumnas?\s+de\s+sonido\b/i },
  { type: "amplifier", re: /\bamplificador(es)?\b|\bamplis?\b|\bamplifiers?\b|\betapas?\s+de\s+potencia\b/i },
  { type: "processor", re: /\bprocesador(es)?\b|\bdsp\b|\bprocessors?\b/i },
  { type: "touchpanel", re: /\bpanel(es)?\s+t[áa]ctil(es)?\b|\btouch\s?panels?\b|\bpantallas?\s+t[áa]ctil(es)?\b/i },
  { type: "display", re: /\bpantallas?\b|\bdisplays?\b|\bmonitor(es)?\b|\btele(visor(es)?)?\b/i },
  { type: "camera", re: /\bc[áa]maras?\b|\bcameras?\b/i },
  { type: "microphone", re: /\bmicr[óo]fonos?\b|\bmics?\b|\bmicrophones?\b/i },
  { type: "switcher", re: /\bswitchers?\b|\bmatri(z|ces)\b|\bmatrix\b|\bdistribuidor(es)?\s+de\s+video\b/i },
  { type: "mount", re: /\bsoportes?\b|\bmounts?\b|\bbrackets?\b|\brejillas?\b/i },
  { type: "cable", re: /\bcables?\b|\bcableado\b/i },
  { type: "lighting", re: /\bilumina[cs]i[óo]n\b|\bdimmers?\b|\bluces\b|\bl[áa]mparas?\b|\bkeypads?\s+de\s+luz\b/i },
  { type: "power", re: /\bfuentes?\s+de\s+alimenta|\bpower\s+suppl|\bups\b|\bzapatillas?\b/i },
  { type: "network", re: /\bswitch(es)?\s+de\s+red\b|\brouters?\b|\baccess\s+points?\b/i },
  { type: "control", re: /\bcontroladoras?\b|\bcontrolador(es)?\b|\bprocesador(es)?\s+de\s+control\b|\bkeypads?\b/i },
];

const ENVIRONMENT_PATTERNS: Array<{ environment: Environment; re: RegExp }> = [
  {
    environment: "OUTDOOR",
    re: /\bexterior(es)?\b|\boutdoor\b|\bintemperie\b|\baire\s+libre\b|\bjard[íi]n\b|\bpileta\b|\bpiscina\b|\bterraza\b|\bpatio\b|\bmarino\b|\bafuera\b|\bparque\b|\bdeck\b/i,
  },
  { environment: "INDOOR", re: /\binterior(es)?\b|\bindoor\b|\badentro\b|\bbajo\s+techo\b/i },
];

const MOUNT_PATTERNS: Array<{ mount: MountType; re: RegExp }> = [
  {
    mount: "in-ceiling",
    // "Bajo techo" habla del ambiente, no del montaje: se excluye.
    re: /(?<!\bbajo\s)\btechos?\b|\bcielorraso\b|\bin[-\s]?ceiling\b|\bplafon\b/i,
  },
  { mount: "in-wall", re: /\bembutir\s+en\s+(la\s+)?pared\b|\bin[-\s]?wall\b|\bdentro\s+de\s+la\s+pared\b/i },
  { mount: "on-wall", re: /\bsobre\s+(la\s+)?pared\b|\bon[-\s]?wall\b|\bde\s+pared\b/i },
  { mount: "surface", re: /\bsuperficie\b|\bsurface\b/i },
  { mount: "pendant", re: /\bcolgantes?\b|\bpendant\b|\bcolgar\b/i },
  { mount: "rack", re: /\brack\b|\bracke?able\b/i },
  { mount: "landscape", re: /\bjard[íi]n\b|\blandscape\b|\benterrar\b|\bcanteros?\b/i },
  { mount: "pole", re: /\bposte\b|\bm[áa]stil\b/i },
  { mount: "desktop", re: /\bescritorio\b|\bmesa\b|\bdesktop\b/i },
  { mount: "portable", re: /\bport[áa]til(es)?\b|\bportables?\b/i },
];

const ECOSYSTEM_PATTERNS: Array<{ key: Ecosystem; re: RegExp }> = [
  { key: "crestron-home", re: /crestron\s+home/i },
  { key: "control4", re: /\bcontrol\s?4\b/i },
  { key: "savant", re: /\bsavant\b/i },
  { key: "sonos", re: /\bsonos\b/i },
  { key: "dante", re: /\bdante\b/i },
  { key: "aes67", re: /\baes\s?-?67\b/i },
  { key: "airplay", re: /\bairplay\b/i },
  { key: "poe", re: /\bpoe\b|power\s+over\s+ethernet/i },
  { key: "bluetooth", re: /\bbluetooth\b/i },
  { key: "wifi", re: /\bwi-?fi\b|\binal[áa]mbric/i },
  { key: "hdmi", re: /\bhdmi\b/i },
  { key: "usb-c", re: /\busb[-\s]?c\b/i },
  { key: "avb", re: /\bavb\b/i },
];

const APPLICATION_PATTERNS: Array<{ key: Application; re: RegExp }> = [
  { key: "restaurante", re: /\brestaurantes?\b|\bbares?\b|\bcaf[ée]s?\b|\bgastron[óo]mic|\bcervecer/i },
  { key: "hotel", re: /\bhotel(es|er[íi]a)?\b|\bhospitality\b|\bcabañas?\b/i },
  { key: "oficina", re: /\boficinas?\b|\bcorporativ|\bsalas?\s+de\s+reuni|\bcoworking\b|\bmeeting\s+rooms?\b/i },
  { key: "retail", re: /\bcomercios?\b|\blocal(es)?\s+comercial|\bretail\b|\bshoppings?\b|\btiendas?\b|\bshowrooms?\b/i },
  { key: "auditorio", re: /\bauditorios?\b|\bsal(ones|[óo]n)\b|\bteatros?\b|\bsal[óo]n\s+de\s+fiestas\b/i },
  { key: "gimnasio", re: /\bgimnasios?\b|\bgyms?\b|\bcrossfit\b|\bdeportiv/i },
  { key: "educacion", re: /\bescuelas?\b|\bcolegios?\b|\baulas?\b|\buniversidad(es)?\b|\beducativ/i },
  { key: "salud", re: /\bhospital(es)?\b|\bcl[íi]nicas?\b|\bconsultorios?\b|\bsanatorios?\b/i },
  { key: "culto", re: /\biglesias?\b|\btemplos?\b|\bparroquias?\b|\bculto\b/i },
  { key: "residencial", re: /\bcasas?\b|\bhogar(es)?\b|\bresidencial(es)?\b|\bdepartamentos?\b|\bliving\b|\bdormitorios?\b/i },
  { key: "streaming", re: /\bvideoconferencias?\b|\bstreaming\b|\bzoom\b|\bteams\b|\bhibridas?\b/i },
  { key: "industrial", re: /\bindustrial(es)?\b|\bf[áa]bricas?\b|\bdep[óo]sitos?\b|\bplantas?\b/i },
];

/** Pedir algo "de embutir" es pedir montaje enrasado, sin decir en qué superficie. */
const FLUSH_RE = /\bembutir\b|\bembutid[oa]s?\b|\bempotrar\b|\bempotrad[oa]s?\b|\bflush\b/i;

const NOISE_TERMS = new Set([
  "producto", "productos", "modelo", "modelos", "marca", "marcas", "opcion", "opciones",
  "alternativa", "alternativas", "tienen", "tiene", "hay", "sirve", "sirven", "para", "que",
  "cual", "cuales", "como", "donde", "dame", "mostrame", "listame", "necesito", "busco",
  "quiero", "todos", "todas", "algun", "alguna", "algunos", "algunas", "mejor", "mejores",
  "info", "informacion", "con", "sin", "una", "uno", "unos", "unas", "los", "las", "del",
  // Verbos de la pregunta: no describen al producto, y exigirlos como texto
  // obligaba a relajar la búsqueda y a dar una explicación que sobra.
  "admiten", "admite", "soportan", "soporta", "funcionan", "funciona", "sirven",
  "manejan", "trabajan", "vienen", "traen", "usan", "permiten", "incluyen", "incluye",
  "tengan", "tenes", "tienen", "haya", "sean", "estan", "puede", "pueden", "tiene",
]);

const COMBINING_MARKS = new RegExp("[̀-ͯ]", "g");

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "");
}

function findIpRating(raw: string): string | undefined {
  const match = raw.match(/\bip[\s-]?(\d{2}|x\d)\b/i);
  if (!match) return undefined;
  return `IP${match[1].toUpperCase()}`;
}

function findAudioLine(raw: string): AudioLine | undefined {
  const has70 = /\b70\s?-?\s?v\b/i.test(raw);
  const has100 = /\b100\s?-?\s?v\b/i.test(raw);
  if (has70 && has100) return "BOTH";
  if (has70) return "70V";
  if (has100) return "100V";
  if (/\b(4|8|16)\s?(ohm|Ω)\b/i.test(raw) || /baja\s+impedancia/i.test(raw)) return "LOW_Z";
  return undefined;
}

/**
 * ¿Este término ya está representado por alguna faceta? Se prueba el token
 * aislado contra los mismos patrones: si alcanza para disparar una faceta,
 * la faceta ya lo dice mejor que un `contains` sobre texto.
 */
function isFacetedTerm(token: string): boolean {
  return (
    FLUSH_RE.test(token) ||
    TYPE_PATTERNS.some(({ re }) => re.test(token)) ||
    ENVIRONMENT_PATTERNS.some(({ re }) => re.test(token)) ||
    MOUNT_PATTERNS.some(({ re }) => re.test(token)) ||
    ECOSYSTEM_PATTERNS.some(({ re }) => re.test(token)) ||
    APPLICATION_PATTERNS.some(({ re }) => re.test(token))
  );
}

export interface DetectFacetsInput {
  question: string;
  brandNames?: string[];
  tokens?: string[];
}

export function detectFacets(input: DetectFacetsInput): CanonicalFilter {
  const raw = input.question;
  const filter = emptyFilter();

  const type = TYPE_PATTERNS.find(({ re }) => re.test(raw));
  if (type) filter.productType = type.type;

  const environment = ENVIRONMENT_PATTERNS.find(({ re }) => re.test(raw));
  if (environment) filter.environment = environment.environment;

  filter.mountTypes = MOUNT_PATTERNS.filter(({ re }) => re.test(raw)).map(({ mount }) => mount).slice(0, 3);
  // "De embutir" sin decir dónde es techo o pared, las dos cosas. Solo aplica
  // cuando no se nombró un lugar: "embutir en techo" ya quedó resuelto arriba.
  if (filter.mountTypes.length === 0 && FLUSH_RE.test(raw)) {
    filter.mountTypes = ["in-ceiling", "in-wall"];
  }
  filter.ecosystems = ECOSYSTEM_PATTERNS.filter(({ re }) => re.test(raw)).map(({ key }) => key).slice(0, 3);
  filter.applications = APPLICATION_PATTERNS.filter(({ re }) => re.test(raw)).map(({ key }) => key).slice(0, 3);

  const ip = findIpRating(raw);
  if (ip) {
    filter.ipRating = ip;
    // Pedir un grado IP es pedir algo apto para intemperie.
    if (!filter.environment) filter.environment = "OUTDOOR";
  }

  const audioLine = findAudioLine(raw);
  if (audioLine) filter.audioLine = audioLine;

  // La marca se busca fuera de las frases que ya se leyeron como ecosistema:
  // "compatible con Crestron Home" nombra un ecosistema, no pide que el
  // producto sea de Crestron. Otras marcas también pueden ser compatibles.
  let brandHaystack = raw;
  for (const { re } of ECOSYSTEM_PATTERNS) {
    if (re.test(raw)) brandHaystack = brandHaystack.replace(new RegExp(re.source, "gi"), " ");
  }
  const normalized = stripAccents(brandHaystack.toLowerCase());
  for (const brand of input.brandNames ?? []) {
    const needle = stripAccents(brand.toLowerCase());
    if (needle.length >= 3 && normalized.includes(needle)) filter.brandNames.push(brand);
  }
  filter.brandNames = filter.brandNames.slice(0, 2);

  // Un término que ya se convirtió en faceta no puede volver a exigirse como
  // texto: "parlantes" ya es productType, y pedirlo además dentro del texto
  // deja afuera a los productos cuya ficha dice "parlante" en singular o
  // "speaker" en inglés. Es lo que hacía que un filtro correcto devolviera
  // cinco resultados en vez de cientos.
  filter.freeTerms = (input.tokens ?? [])
    .map((token) => stripAccents(token.toLowerCase()))
    .filter((token) => token.length >= 4 && !NOISE_TERMS.has(token) && !isFacetedTerm(token))
    .slice(0, 4);

  return filter;
}

/**
 * Refina el filtro anterior con el nuevo. Lo que el visitante nombra ahora
 * pisa lo de antes; lo que no nombra, se conserva. Así "¿y con 70V?" acota
 * la búsqueda anterior en vez de arrancar de cero.
 */
export function mergeFilters(previous: CanonicalFilter, next: CanonicalFilter): CanonicalFilter {
  return {
    productType: next.productType ?? previous.productType,
    environment: next.environment ?? previous.environment,
    audioLine: next.audioLine ?? previous.audioLine,
    ipRating: next.ipRating ?? previous.ipRating,
    mountTypes: next.mountTypes.length > 0 ? next.mountTypes : previous.mountTypes,
    ecosystems: Array.from(new Set([...previous.ecosystems, ...next.ecosystems])).slice(0, 4),
    applications: next.applications.length > 0 ? next.applications : previous.applications,
    brandNames: next.brandNames.length > 0 ? next.brandNames : previous.brandNames,
    freeTerms: next.freeTerms.length > 0 ? next.freeTerms : previous.freeTerms,
  };
}

/** "parlantes de embutir en techo para exterior, compatibles con Crestron Home" */
export function describeFilter(filter: CanonicalFilter): string {
  const parts: string[] = [];
  parts.push(filter.productType ? PRODUCT_TYPE_LABEL_PLURAL[filter.productType] : "productos");

  if (filter.brandNames.length > 0) parts.push(`de ${filter.brandNames.join(" y ")}`);
  if (filter.mountTypes.length > 0) {
    parts.push(filter.mountTypes.map((mount) => MOUNT_LABEL[mount]).join(" y "));
  }
  if (filter.environment === "OUTDOOR") parts.push("para exterior");
  if (filter.environment === "INDOOR") parts.push("para interior");
  if (filter.ipRating) parts.push(`con protección ${filter.ipRating}`);
  if (filter.audioLine === "70V") parts.push("con línea de 70 V");
  if (filter.audioLine === "100V") parts.push("con línea de 100 V");
  if (filter.audioLine === "BOTH") parts.push("con línea de 70/100 V");
  if (filter.audioLine === "LOW_Z") parts.push("de baja impedancia");
  if (filter.ecosystems.length > 0) {
    parts.push(`compatibles con ${filter.ecosystems.map((key) => ECOSYSTEM_LABEL[key]).join(" y ")}`);
  }
  if (filter.applications.length > 0) {
    parts.push(`para ${filter.applications.map((key) => APPLICATION_LABEL[key]).join(" y ")}`);
  }
  return parts.join(" ");
}

/** Detecta "mostrame más", "seguí", "otras opciones". */
export function isMoreRequest(raw: string): boolean {
  return /\b(mostra?r?me?\s+m[áa]s|ver\s+m[áa]s|m[áa]s\s+opciones|otras\s+opciones|segu[íi]|continuar|el\s+resto|los\s+dem[áa]s)\b/i.test(
    raw
  );
}

/** Serialización para guardar el filtro en la sesión. */
export function serializeFilter(filter: CanonicalFilter): Record<string, unknown> {
  return { ...filter };
}

export function deserializeFilter(value: unknown): CanonicalFilter | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const base = emptyFilter();
  const asArray = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];
  const filter: CanonicalFilter = {
    ...base,
    mountTypes: asArray(row.mountTypes) as MountType[],
    ecosystems: asArray(row.ecosystems) as Ecosystem[],
    applications: asArray(row.applications) as Application[],
    brandNames: asArray(row.brandNames),
    freeTerms: asArray(row.freeTerms),
  };
  // Las claves opcionales solo se escriben si vinieron: un `undefined`
  // explícito no es lo mismo que ausente cuando el filtro se compara o se
  // vuelve a serializar.
  if (typeof row.productType === "string") filter.productType = row.productType as ProductType;
  if (typeof row.environment === "string") filter.environment = row.environment as Environment;
  if (typeof row.audioLine === "string") filter.audioLine = row.audioLine as AudioLine;
  if (typeof row.ipRating === "string") filter.ipRating = row.ipRating;
  return filter;
}
