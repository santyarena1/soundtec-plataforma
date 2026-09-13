/**
 * Análisis determinístico de la pregunta. Cuesta 0 tokens: nada de esto
 * pasa por el LLM. De acá salen los códigos de modelo, la marca, la
 * intención y el atributo técnico consultado.
 */

import { normalizeForSearch } from "@/lib/search-key";
import type { AttributeQuery, QuestionAnalysis, QuestionIntent } from "./types";

const STOP_WORDS = new Set([
  "el","la","los","las","un","una","unos","unas","de","del","al","y","o","que","qué","cual","cuál","cuales",
  "cuáles","como","cómo","para","por","con","sin","es","son","tiene","tienen","hay","me","mi","mis","se","su",
  "sus","en","a","lo","le","este","esta","esto","estos","estas","ese","esa","eso","the","of","for","and","to",
  "sirve","necesito","busco","quiero","puedo","dame","decime","tengo","muy","más","mas","menos","entre","sobre",
]);

/** Palabras que no deben tomarse como código de modelo. */
const MODEL_CODE_BLOCKLIST = new Set([
  "IP","HDMI","USB","POE","AV","DSP","LED","RCA","XLR","IR","RS232","W","V","DB","HZ","KHZ","IA","AI","QR","PDF",
]);

/** Cosas que parecen modelo pero son normas, grados de protección o unidades. */
const MODEL_CODE_BLOCKLIST_RE = [
  /^ip\s?-?\d{2}[kx]?$/i,
  /^en\s?-?\d{2,3}$/i,
  /^rs\s?-?\d{3}$/i,
  /^\d+[a-z]{1,3}$/i,
  /^(4k|8k|hd|uhd|usb\d?|hdmi\d?)$/i,
];

const MODEL_CODE_RE = /\b[A-Za-z]{1,6}[-–]?\d{1,4}[A-Za-z0-9-]*\b|\b[A-Za-z]{2,8}-[A-Za-z0-9]{2,}(?:-[A-Za-z0-9]+)*\b/g;

interface AttributeDef {
  key: string;
  label: string;
  /** Sinónimos en la pregunta. */
  question: RegExp;
  /** Cómo se reconoce la fila de specs que responde. */
  specMatchers: RegExp[];
  productField?: AttributeQuery["productField"];
}

/**
 * Diccionario de atributos técnicos. Se usa para (a) priorizar specs en el
 * contexto y (b) habilitar la respuesta sin LLM cuando el dato es inequívoco.
 */
const ATTRIBUTES: AttributeDef[] = [
  {
    key: "ip_rating",
    label: "Grado de protección IP",
    question: /\bip\s?-?\d{2}\b|\bip\b(?!\s*address)|resistent\w*\s+(al\s+)?(agua|clima)|intemperie|water\s?proof|weather|humedad/i,
    specMatchers: [/\bip\b.*(rating|grade|protection)?/i, /protecci[óo]n/i, /weather|water/i, /intemperie/i],
  },
  {
    key: "outdoor",
    label: "Uso en exterior",
    question: /exterior|outdoor|afuera|aire libre|pileta|piscina|jard[íi]n|terraza|patio/i,
    specMatchers: [/outdoor|exterior|environment|ambiente|instalaci[óo]n/i, /\bip\b/i],
  },
  {
    key: "hdmi_inputs",
    label: "Entradas HDMI",
    question: /entradas?\s+hdmi|hdmi\s+inputs?|puertos?\s+hdmi/i,
    specMatchers: [/hdmi/i, /input|entrada|puerto/i],
  },
  {
    key: "inputs",
    label: "Entradas",
    question: /cu[áa]ntas?\s+entradas|n[úu]mero\s+de\s+entradas|inputs?\b/i,
    specMatchers: [/input|entrada|canales|channels/i],
  },
  {
    key: "power",
    label: "Potencia",
    question: /potencia|watts?\b|\bw\b\s*(rms)?|amplificaci[óo]n/i,
    specMatchers: [/power|potencia|watt|rms/i],
  },
  {
    key: "impedance",
    label: "Impedancia",
    question: /impedancia|ohm/i,
    specMatchers: [/impedance|impedancia|ohm/i],
  },
  {
    key: "weight",
    label: "Peso",
    question: /cu[áa]nto\s+pesa|\bpeso\b|weight/i,
    specMatchers: [/weight|peso/i],
    productField: "weight",
  },
  {
    key: "dimensions",
    label: "Dimensiones",
    question: /dimensiones|medidas|tama[ñn]o|cu[áa]nto\s+mide/i,
    specMatchers: [/dimension|medidas|size|tama[ñn]o/i],
    productField: "dimensions",
  },
  {
    key: "mounting",
    label: "Montaje",
    question: /montaje|instalaci[óo]n|se\s+instala|empotr|embutir|rack|pared|techo/i,
    specMatchers: [/mount|montaje|instalaci[óo]n|rack|ceiling|wall/i],
  },
  {
    key: "crestron_home",
    label: "Compatibilidad con Crestron Home",
    question: /crestron\s+home/i,
    specMatchers: [/crestron\s+home/i],
    productField: "isCrestronHomeCompatible",
  },
  {
    key: "model",
    label: "Modelo",
    question: /qu[ée]\s+modelo|n[úu]mero\s+de\s+modelo|model\s+number/i,
    specMatchers: [/model/i],
    productField: "modelNumber",
  },
  {
    key: "color",
    label: "Color",
    question: /\bcolor(es)?\b|terminaci[óo]n|blanco|negro/i,
    specMatchers: [/color|finish|terminaci[óo]n/i],
  },
  {
    key: "coverage",
    label: "Cobertura",
    question: /cobertura|dispersi[óo]n|[áa]ngulo|coverage/i,
    specMatchers: [/coverage|dispersion|angle|[áa]ngulo/i],
  },
  {
    key: "network",
    label: "Red y conectividad",
    question: /ethernet|\bred\b|dante|\bpoe\b|wifi|wi-fi|bluetooth|ip\s*address/i,
    specMatchers: [/ethernet|network|dante|poe|wifi|bluetooth|red/i],
  },
];

const APPLICATION_TERMS: Array<{ term: string; re: RegExp }> = [
  { term: "exterior", re: /exterior|outdoor|intemperie|jard[íi]n|pileta|piscina|terraza|patio/i },
  { term: "restaurante", re: /restaurante|bar\b|caf[ée]|gastron/i },
  { term: "hotel", re: /hotel|hoteler/i },
  { term: "oficina", re: /oficina|corporativ|sala de reuni/i },
  { term: "sala", re: /\bsalas?\b|ambiente|zona/i },
  { term: "auditorio", re: /auditorio|sal[óo]n|teatro|iglesia|templo/i },
  { term: "casa", re: /casa|hogar|residencial|living|dormitorio/i },
  { term: "comercio", re: /local|comercio|shopping|retail|tienda/i },
  { term: "gimnasio", re: /gimnasio|gym|deportiv/i },
  { term: "streaming", re: /videoconferencia|streaming|zoom|teams/i },
];

const COMBINING_MARKS = new RegExp("[\u0300-\u036f]", "g");

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "");
}

export function normalizeQuestion(raw: string): string {
  return stripAccents(raw.toLowerCase()).replace(/\s+/g, " ").trim();
}

export function extractModelCodes(raw: string): string[] {
  const matches = raw.match(MODEL_CODE_RE) ?? [];
  const out: string[] = [];
  for (const match of matches) {
    const clean = match.trim();
    if (clean.length < 3 || clean.length > 32) continue;
    if (MODEL_CODE_BLOCKLIST.has(clean.toUpperCase())) continue;
    if (MODEL_CODE_BLOCKLIST_RE.some((pattern) => pattern.test(clean))) continue;
    // Debe tener al menos una letra y un dígito, o al menos un guion interno.
    const hasLetter = /[A-Za-z]/.test(clean);
    const hasDigit = /\d/.test(clean);
    const hasDash = /[-–]/.test(clean.slice(1, -1));
    if (!hasLetter || (!hasDigit && !hasDash)) continue;
    if (!out.some((existing) => existing.toLowerCase() === clean.toLowerCase())) out.push(clean);
  }
  return out.slice(0, 4);
}

export function questionTokens(normalized: string): string[] {
  return normalized
    .split(/[^a-z0-9áéíóúñ-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
    .slice(0, 16);
}

function detectIntent(raw: string, modelCodes: string[]): QuestionIntent {
  if (/^\s*(hola|buenas|buen d[íi]a|hey|hi|hello|buenas tardes|buenas noches)\b[\s!¡.?]*$/i.test(raw)) {
    return "GREETING";
  }
  if (/\bcompar|\bvs\b|\bversus\b|diferencia|cu[áa]l\s+es\s+mejor|contra\b/i.test(raw) || modelCodes.length >= 2) {
    return "COMPARISON";
  }
  if (/compatib|funciona\s+con|anda\s+con|se\s+integra|sirve\s+con/i.test(raw)) return "COMPATIBILITY";
  if (/accesorio|qu[ée]\s+necesita|hace\s+falta|complement|soporte\s+para|kit\b/i.test(raw)) return "ACCESSORY";
  if (/necesito|busco|recomend|qu[ée]\s+me\s+(sirve|conviene|recomend)|soluci[óo]n|opciones|alternativas|para\s+un[a]?\s/i.test(raw)) {
    return "RECOMMENDATION";
  }
  if (/cu[áa]nt|tiene|es\s+|soporta|admite|viene\s+con|incluye|qu[ée]\s+(potencia|peso|modelo|color)/i.test(raw)) {
    return "SPEC_LOOKUP";
  }
  return "GENERAL";
}

function detectAttributes(raw: string): AttributeQuery[] {
  const found: AttributeQuery[] = [];
  for (const attribute of ATTRIBUTES) {
    if (!attribute.question.test(raw)) continue;
    found.push({
      key: attribute.key,
      label: attribute.label,
      specMatchers: attribute.specMatchers,
      productField: attribute.productField,
    });
  }
  return found.slice(0, 3);
}

const NUMBER_WORDS: Record<string, number> = {
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

/** "dame 5 opciones", "tres alternativas": el visitante define cuántas quiere. */
export function detectRequestedCount(raw: string): number | undefined {
  const nouns = "(?:opciones?|alternativas?|modelos?|productos?|parlantes?|equipos?|variantes?|marcas?)";
  const digits = raw.match(new RegExp(String.raw`\b(\d{1,2})\s+(?:\w+\s+){0,2}?` + nouns + String.raw`\b`, "i"));
  if (digits) {
    const value = Number(digits[1]);
    if (value >= 1 && value <= 10) return value;
  }
  const words = raw.match(
    new RegExp(
      String.raw`\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:\w+\s+){0,2}?` + nouns + String.raw`\b`,
      "i"
    )
  );
  if (words) return NUMBER_WORDS[words[1].toLowerCase()];
  return undefined;
}

/** Preguntas de catálogo: piden varias opciones, no un dato de un producto. */
export function detectWantsList(raw: string): boolean {
  const patterns = [
    String.raw`\bopciones?\b`,
    String.raw`\balternativas?\b`,
    String.raw`\bcu[áa]les\b`,
    String.raw`\bmostrame\b`,
    String.raw`\blistame\b`,
    String.raw`\bmodelos\b`,
    String.raw`\bqu[ée]\s+\w+s\b[^?]{0,40}\b(tienen|hay|ten[ée]s|manejan|trabajan)\b`,
    // "¿Qué productos son compatibles con…?", "¿qué parlantes sirven para…?"
    String.raw`\bqu[ée]\s+\w+s\b[^?]{0,40}\b(son|sirven|funcionan|admiten|soportan|vienen)\b`,
    String.raw`\btod[oa]s\s+l[oa]s\b`,
    String.raw`\blistado\b`,
  ];
  return new RegExp(patterns.join("|"), "i").test(raw);
}

function detectApplicationTerms(raw: string): string[] {
  return APPLICATION_TERMS.filter(({ re }) => re.test(raw)).map(({ term }) => term);
}

/** "¿y cuál para exterior?" no nombra productos: depende del turno anterior. */
function detectFollowUp(raw: string, modelCodes: string[]): boolean {
  if (modelCodes.length > 0) return false;
  // "¿y cuál…?" abre con signo de interrogación: hay que sacarlo antes de mirar la primera palabra.
  const clean = raw.replace(/^[\s¿¡"'(]+/, "");
  return (
    /^(y|pero|entonces|ok|listo)\b/i.test(clean) ||
    /\b(ese|esos|esas|esa|este|estos|estas|el primero|el segundo|los dos|ambos|cu[áa]l de)\b/i.test(clean)
  );
}

/** Marcas conocidas que aparecen en la pregunta. */
export function detectBrands(raw: string, brandNames: string[]): string[] {
  const haystack = normalizeForSearch(raw);
  return brandNames.filter((brand) => {
    const needle = normalizeForSearch(brand);
    return needle.length >= 3 && haystack.includes(needle);
  });
}

export function analyzeQuestion(raw: string, brandNames: string[] = []): QuestionAnalysis {
  const normalized = normalizeQuestion(raw);
  const modelCodes = extractModelCodes(raw);
  return {
    raw,
    normalized,
    tokens: questionTokens(normalized),
    modelCodes,
    brandNames: detectBrands(raw, brandNames),
    intent: detectIntent(raw, modelCodes),
    attributes: detectAttributes(raw),
    applicationTerms: detectApplicationTerms(raw),
    isFollowUp: detectFollowUp(raw, modelCodes),
    requestedCount: detectRequestedCount(raw),
    wantsList: detectWantsList(raw),
  };
}
