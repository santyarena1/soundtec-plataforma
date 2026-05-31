/**
 * Servicio OpenAI desacoplado.
 *
 * Si OPENAI_API_KEY no está configurada, devuelve mocks razonables
 * para no romper el flujo. Una vez que se configure (en /admin/api-keys
 * o variable de entorno), las mismas funciones llaman al modelo real.
 *
 * Decisión: las claves se prefieren desde AdminSetting (DB) para que el
 * admin pueda rotarlas desde la UI sin redeploy. Si no existe, se cae
 * a la variable de entorno.
 */

import OpenAI from "openai";
import { getSetting } from "@/lib/settings";

const CANONICAL_FIELDS = [
  "sku",
  "supplierSku",
  "name",
  "brand",
  "category",
  "shortDescription",
  "longDescription",
  "baseCostUsd",
  "currency",
  "stockStatus",
  "stockQuantity",
  "discountPercent",
  "imageUrl",
  "accessories",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];
export const CANONICAL_FIELD_LIST = CANONICAL_FIELDS as readonly string[];

async function getClient(): Promise<OpenAI | null> {
  const fromDb = await getSetting("openai.api_key", "");
  const apiKey = fromDb || process.env.OPENAI_API_KEY || "";
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

async function getModel(): Promise<string> {
  const fromDb = await getSetting("openai.model", "");
  return fromDb || process.env.OPENAI_MODEL || "gpt-4o-mini";
}

export interface MappingSuggestion {
  source: string;
  target: CanonicalField | null;
  confidence: number;
  rationale?: string;
}

const HEURISTIC_MAP: Array<{ test: RegExp; field: CanonicalField; conf: number }> = [
  { test: /^(sku|codigo|c[oó]digo|codigo_interno|item code|id)$/i, field: "sku", conf: 0.7 },
  { test: /(supplier|proveedor|fabricante)\s*(sku|codigo|c[oó]digo)/i, field: "supplierSku", conf: 0.8 },
  { test: /^(nombre|name|description|descripci[oó]n|producto|modelo)$/i, field: "name", conf: 0.7 },
  { test: /^(marca|brand|fabricante|manufacturer)$/i, field: "brand", conf: 0.8 },
  { test: /^(categoria|categor[ií]a|category|familia|tipo)$/i, field: "category", conf: 0.7 },
  { test: /^(short.*desc|descripci[oó]n corta|resumen)$/i, field: "shortDescription", conf: 0.7 },
  { test: /(long.*desc|descripci[oó]n larga|detalle|features)/i, field: "longDescription", conf: 0.7 },
  { test: /^(precio.*costo|cost.*usd|costo.*usd|cost|precio|price)$/i, field: "baseCostUsd", conf: 0.7 },
  { test: /^(moneda|currency)$/i, field: "currency", conf: 0.9 },
  { test: /^(stock|disponibilidad|availability)$/i, field: "stockStatus", conf: 0.7 },
  { test: /(stock.*qty|cantidad|qty|quantity|existencias)/i, field: "stockQuantity", conf: 0.7 },
  { test: /^(descuento|discount)/i, field: "discountPercent", conf: 0.7 },
  { test: /^(imagen|image|img|picture|foto)$/i, field: "imageUrl", conf: 0.8 },
  { test: /^(accesorios|opcionales|accessories|options)$/i, field: "accessories", conf: 0.7 },
];

export function heuristicSuggestMapping(headers: string[]): MappingSuggestion[] {
  return headers.map((header) => {
    const cleaned = String(header || "").trim();
    const match = HEURISTIC_MAP.find((m) => m.test.test(cleaned));
    return {
      source: cleaned,
      target: match?.field ?? null,
      confidence: match?.conf ?? 0,
      rationale: match ? "heurística por nombre" : "sin coincidencia clara",
    };
  });
}

export async function suggestColumnMapping(headers: string[], context?: { brand?: string; distributor?: string }): Promise<MappingSuggestion[]> {
  const client = await getClient();
  if (!client) return heuristicSuggestMapping(headers);

  const prompt = `Tenés que mapear columnas de Excel de proveedores a un modelo canónico de productos.
Marca: ${context?.brand || "(desconocida)"}
Distribuidor: ${context?.distributor || "(desconocido)"}
Modelo canónico permitido (devolvé "null" si no aplica): ${CANONICAL_FIELDS.join(", ")}.

Columnas detectadas:
${headers.map((h, i) => `${i + 1}. "${h}"`).join("\n")}

Respondé sólo un JSON con un array "items" en este formato exacto:
{ "items": [ { "source": "<columna>", "target": "<campo o null>", "confidence": 0-1, "rationale": "..." } ] }`;

  try {
    const model = await getModel();
    const resp = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Sos un asistente que mapea columnas a un modelo canónico de productos B2B." },
        { role: "user", content: prompt },
      ],
    });
    const raw = resp.choices[0]?.message.content || "{}";
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return items
      .filter((i: any) => typeof i?.source === "string")
      .map((i: any) => ({
        source: String(i.source),
        target: CANONICAL_FIELDS.includes(i.target) ? (i.target as CanonicalField) : null,
        confidence: Number(i.confidence) || 0,
        rationale: i.rationale,
      }));
  } catch (error) {
    console.error("OpenAI suggestColumnMapping error", error);
    return heuristicSuggestMapping(headers);
  }
}

export async function generateLongDescription(input: { name: string; brand?: string; category?: string; short?: string }): Promise<string> {
  const client = await getClient();
  if (!client) {
    return `${input.name} (${input.brand || "marca"}) — descripción técnica profesional pendiente de generar. ${input.short || ""}`;
  }
  try {
    const model = await getModel();
    const customSystemPrompt = await getSetting("ai.prompt.long_description", "");
    const systemPrompt = customSystemPrompt || "Sos un copywriter técnico B2B para productos audiovisuales profesionales. Escribís en español, neutro, claro, sin marketing barato.";
    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generá una descripción larga (4-7 oraciones) para:
Producto: ${input.name}
Marca: ${input.brand || "—"}
Categoría: ${input.category || "—"}
Resumen previo: ${input.short || "—"}
Indicá usos típicos, integración y datos técnicos relevantes sólo si los conocés. No inventes datos numéricos críticos.`,
        },
      ],
    });
    return resp.choices[0]?.message.content?.trim() || "";
  } catch (error) {
    console.error("OpenAI generateLongDescription error", error);
    return `${input.name} — descripción profesional no disponible en este momento.`;
  }
}

export async function generateShortDescription(input: { name: string; brand?: string; category?: string }): Promise<string> {
  const client = await getClient();
  if (!client) {
    return `${input.name}${input.brand ? ` – ${input.brand}` : ""}. Descripción corta pendiente.`;
  }
  try {
    const model = await getModel();
    const customSystemPrompt = await getSetting("ai.prompt.short_description", "");
    const systemPrompt = customSystemPrompt || "Sos un copywriter técnico B2B para productos audiovisuales profesionales. Escribís en español, neutro y conciso.";
    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generá una descripción corta (1-2 oraciones, máximo 120 palabras) para:
Producto: ${input.name}
Marca: ${input.brand || "—"}
Categoría: ${input.category || "—"}
Sé directo: qué es y para qué sirve. Sin adjetivos vacíos.`,
        },
      ],
    });
    return resp.choices[0]?.message.content?.trim() || "";
  } catch (error) {
    console.error("OpenAI generateShortDescription error", error);
    return `${input.name} — descripción corta no disponible.`;
  }
}

export interface ClassificationSuggestion {
  brand: { name: string; confidence: number } | null;
  category: { name: string; confidence: number } | null;
  family: { name: string; confidence: number } | null;
  proposedNewCategory?: string | null;
  proposedNewFamily?: string | null;
  rationale?: string;
}

export type TaxonomyAssignmentKind = "CATEGORY" | "FAMILY";

export interface TaxonomyAssignmentSuggestion {
  /** existing = usar categoría/familia del catálogo; new = crear una nueva */
  action: "existing" | "new";
  name: string;
  confidence: number;
  rationale?: string;
}

export interface TaxonomyBatchResult {
  id: string;
  action: "existing" | "new";
  name: string;
  confidence: number;
}

const STANDARD_CATEGORIES = [
  "Micrófonos", "Amplificadores", "Mezcladores y Consolas", "Altavoces y Monitores",
  "Procesadores de Audio", "Cables y Conectores", "Pantallas y Proyectores",
  "Videoconferencia", "Iluminación Escénica", "Control e Interfaces",
  "Accesorios y Soportes", "Grabación y Reproducción", "Auriculares",
  "Wireless y Transmisión", "Distribuidores y Matrices",
];

const STANDARD_FAMILIES = [
  "Audio Profesional", "Video y Proyección", "Iluminación", "Videoconferencia",
  "Control AV", "Networking AV", "Accesorios",
];

/**
 * Clasifica hasta 20 productos en una sola llamada a OpenAI.
 * Prioriza reusar categorías/familias existentes; solo crea nuevas si no hay match.
 */
export async function suggestTaxonomyAssignmentBatch(input: {
  kind: TaxonomyAssignmentKind;
  products: { id: string; name: string; sku?: string | null; description?: string | null }[];
  taxonomyCatalog: string[];
}): Promise<TaxonomyBatchResult[]> {
  const label = input.kind === "CATEGORY" ? "categoría" : "familia";
  const labelPlural = input.kind === "CATEGORY" ? "categorías" : "familias";
  const standards = input.kind === "CATEGORY" ? STANDARD_CATEGORIES : STANDARD_FAMILIES;

  const catalogList = input.taxonomyCatalog.length
    ? input.taxonomyCatalog.map((c) => `- ${c}`).join("\n")
    : "(vacío — usá las referencias estándar de abajo)";

  const productList = input.products
    .map((p, i) => `${i + 1}. ID="${p.id}" | ${p.name}${p.sku ? ` (SKU: ${p.sku})` : ""}${p.description ? ` — ${p.description}` : ""}`)
    .join("\n");

  const heuristicFallback = (): TaxonomyBatchResult[] =>
    input.products.map((p) => {
      const context = `${p.name} ${p.sku || ""} ${p.description || ""}`.toLowerCase();
      const match = input.taxonomyCatalog.find((c) => c.length >= 3 && context.includes(c.toLowerCase()));
      if (match) return { id: p.id, action: "existing", name: match, confidence: 0.7 };
      const stdMatch = standards.find((s) => s.length >= 3 && context.includes(s.toLowerCase()));
      return { id: p.id, action: "new", name: stdMatch || standards[0], confidence: 0.5 };
    });

  const client = await getClient();
  if (!client) return heuristicFallback();

  try {
    const model = await getModel();
    const resp = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Clasificás productos audiovisuales B2B en ${labelPlural} amplias. Respondés solo JSON válido.`,
        },
        {
          role: "user",
          content: `Asigná la mejor ${label.toUpperCase()} para cada producto.

REGLAS CRÍTICAS:
1. Usá SIEMPRE una ${label} del catálogo actual si encaja razonablemente. Aunque el nombre no sea idéntico.
2. Agrupá por función GENERAL: todos los tipos de micrófono van a "Micrófonos", no a sub-categorías.
3. El catálogo total de la empresa debe tener 15-20 ${labelPlural} máximo. Evitá fragmentar.
4. Solo usá action "new" si realmente NINGUNA ${label} existente ni estándar es adecuada.
5. Al crear ${labelPlural} nuevas, usá nombres cortos en español plural (ej. "Micrófonos", "Cables y Conectores").

${labelPlural.charAt(0).toUpperCase() + labelPlural.slice(1)} de referencia estándar (preferí estas si el catálogo está vacío):
${standards.map((s) => `- ${s}`).join("\n")}

Catálogo actual:
${catalogList}

Productos a clasificar:
${productList}

Respondé EXACTAMENTE con este JSON (un resultado por producto, en el mismo orden):
{
  "results": [
    { "id": "<ID exacto del producto>", "action": "existing", "name": "<nombre exacto del catálogo>", "confidence": 0.9 },
    { "id": "<ID exacto>", "action": "new", "name": "<nombre nuevo corto>", "confidence": 0.75 }
  ]
}`,
        },
      ],
    });

    const raw = resp.choices[0]?.message.content || "{}";
    const parsed = JSON.parse(raw) as { results?: unknown[] };
    const items = Array.isArray(parsed.results) ? parsed.results : [];

    return items
      .filter((r: any) => typeof r?.id === "string" && typeof r?.name === "string")
      .map((r: any) => ({
        id: String(r.id),
        action: r.action === "existing" ? "existing" : ("new" as const),
        name: String(r.name).trim(),
        confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0.6)),
      }));
  } catch (error) {
    console.error("OpenAI suggestTaxonomyAssignmentBatch error", error);
    return heuristicFallback();
  }
}

function normalizeTaxonomyLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function findCatalogMatch(name: string, catalog: string[]): string | null {
  const needle = normalizeTaxonomyLabel(name);
  if (!needle) return null;
  const exact = catalog.find((c) => normalizeTaxonomyLabel(c) === needle);
  if (exact) return exact;
  const contained = catalog.find((c) => {
    const h = normalizeTaxonomyLabel(c);
    return h.length >= 3 && (needle.includes(h) || h.includes(needle));
  });
  return contained ?? null;
}

/**
 * Sugiere categoría O familia para un producto sin asignar.
 * Prioriza coincidir con el catálogo existente; si no hay match claro, propone un nombre nuevo.
 */
export async function suggestTaxonomyAssignment(input: {
  kind: TaxonomyAssignmentKind;
  productName: string;
  productSku?: string | null;
  shortDescription?: string | null;
  taxonomyCatalog: string[];
}): Promise<TaxonomyAssignmentSuggestion> {
  const label = input.kind === "CATEGORY" ? "categoría" : "familia";
  const context = `${input.productName} ${input.productSku || ""} ${input.shortDescription || ""}`.toLowerCase();

  const heuristicExisting = (): TaxonomyAssignmentSuggestion | null => {
    for (const item of input.taxonomyCatalog) {
      const itemLower = item.toLowerCase();
      if (itemLower.length >= 3 && context.includes(itemLower)) {
        return {
          action: "existing",
          name: item,
          confidence: 0.78,
          rationale: `Coincide con ${label} existente «${item}» por el nombre o descripción del producto.`,
        };
      }
    }
    return null;
  };

  const heuristicNew = (): TaxonomyAssignmentSuggestion => {
    const words = input.productName.split(/\s+/).filter((w) => w.length > 3);
    const proposed = words.slice(0, 2).join(" ") || `Otros ${label === "categoría" ? "productos" : "equipos"}`;
    return {
      action: "new",
      name: proposed.charAt(0).toUpperCase() + proposed.slice(1),
      confidence: 0.45,
      rationale: `Sin match claro en el catálogo; se propone una ${label} nueva a revisar.`,
    };
  };

  const client = await getClient();
  if (!client) {
    return heuristicExisting() ?? heuristicNew();
  }

  try {
    const model = await getModel();
    const resp = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Clasificás productos audiovisuales B2B en categorías o familias. Respondés solo JSON válido.",
        },
        {
          role: "user",
          content: `Asigná la mejor ${label.toUpperCase()} para este producto.

REGLAS:
1. Si el producto encaja en una ${label} del catálogo (aunque el nombre no sea idéntico), usá action "existing" con el nombre EXACTO del catálogo.
2. Solo usá action "new" si NINGUNA ${label} existente es adecuada. El nombre nuevo debe ser corto, en español, plural cuando corresponda (ej. "Micrófonos", "Procesadores de audio").
3. No dupliques ${label}s existentes con otra ortografía.
4. confidence: 0.85+ si estás seguro; 0.5–0.7 si es dudoso.

Producto: "${input.productName}"
SKU: "${input.productSku || ""}"
Descripción: "${input.shortDescription || ""}"

${label === "categoría" ? "Categorías" : "Familias"} existentes:
${input.taxonomyCatalog.length ? input.taxonomyCatalog.map((c) => `- ${c}`).join("\n") : "(catálogo vacío — podés proponer nuevas)"}

Respondé:
{
  "action": "existing" | "new",
  "name": "<nombre exacto del catálogo o nombre nuevo>",
  "confidence": 0..1,
  "rationale": "..."
}`,
        },
      ],
    });

    const raw = resp.choices[0]?.message.content || "{}";
    const parsed = JSON.parse(raw) as {
      action?: string;
      name?: string;
      confidence?: number;
      rationale?: string;
    };

    const name = String(parsed.name || "").trim();
    if (name.length < 2) return heuristicExisting() ?? heuristicNew();

    const catalogMatch = findCatalogMatch(name, input.taxonomyCatalog);
    if (catalogMatch) {
      return {
        action: "existing",
        name: catalogMatch,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.75)),
        rationale: parsed.rationale,
      };
    }

    return {
      action: "new",
      name,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.55)),
      rationale: parsed.rationale,
    };
  } catch (error) {
    console.error("OpenAI suggestTaxonomyAssignment error", error);
    return heuristicExisting() ?? heuristicNew();
  }
}

/**
 * Sugiere marca / categoría / familia a partir del nombre del producto.
 * Mock razonable cuando no hay API key: usa coincidencias con listas existentes.
 */
export async function suggestProductClassification(input: {
  productName: string;
  productSku?: string | null;
  shortDescription?: string | null;
  brandsCatalog: string[];
  categoriesCatalog: string[];
  familiesCatalog: string[];
}): Promise<ClassificationSuggestion> {
  const client = await getClient();
  const lowerName = `${input.productName} ${input.productSku || ""} ${input.shortDescription || ""}`.toLowerCase();

  const heuristic = (list: string[]): { name: string; confidence: number } | null => {
    for (const item of list) {
      const itemLower = item.toLowerCase();
      if (itemLower && lowerName.includes(itemLower)) {
        return { name: item, confidence: 0.75 };
      }
    }
    return null;
  };

  if (!client) {
    return {
      brand: heuristic(input.brandsCatalog),
      category: heuristic(input.categoriesCatalog),
      family: heuristic(input.familiesCatalog),
      rationale: "Sugerencia basada en coincidencia textual (sin OpenAI configurado).",
    };
  }

  try {
    const model = await getModel();
    const resp = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Sos un asistente que clasifica productos audiovisuales B2B. Devolvés siempre JSON con marca/categoría/familia.",
        },
        {
          role: "user",
          content: `Sugerí la mejor MARCA, CATEGORÍA y FAMILIA para el siguiente producto.
Usá EXCLUSIVAMENTE valores que estén en los catálogos dados. Si no hay match razonable, devolvé null.
Devolvé confidence entre 0 y 1.

Producto: "${input.productName}"
SKU: "${input.productSku || ""}"
Descripción breve: "${input.shortDescription || ""}"

Marcas disponibles: ${input.brandsCatalog.join(", ") || "(vacío)"}
Categorías disponibles: ${input.categoriesCatalog.join(", ") || "(vacío)"}
Familias disponibles: ${input.familiesCatalog.join(", ") || "(vacío)"}

Si no hay categoría o familia razonable en el catálogo, proponé un nombre corto nuevo en español en proposedNewCategory / proposedNewFamily (no inventes marcas nuevas).

Respondé exactamente con:
{
  "brand": { "name": "<o null>", "confidence": 0..1 } | null,
  "category": { "name": "<o null>", "confidence": 0..1 } | null,
  "family": { "name": "<o null>", "confidence": 0..1 } | null,
  "proposedNewCategory": "<nombre corto o null>",
  "proposedNewFamily": "<nombre corto o null>",
  "rationale": "..."
}`,
        },
      ],
    });
    const raw = resp.choices[0]?.message.content || "{}";
    const parsed = JSON.parse(raw) as {
      brand?: { name?: string | null; confidence?: number } | null;
      category?: { name?: string | null; confidence?: number } | null;
      family?: { name?: string | null; confidence?: number } | null;
      proposedNewCategory?: string | null;
      proposedNewFamily?: string | null;
      rationale?: string;
    };

    const validate = (
      val: { name?: string | null; confidence?: number } | null | undefined,
      catalog: string[]
    ): { name: string; confidence: number } | null => {
      if (!val || !val.name) return null;
      const exists = catalog.find((c) => c.toLowerCase() === String(val.name).toLowerCase());
      if (!exists) return null;
      return { name: exists, confidence: Math.max(0, Math.min(1, Number(val.confidence) || 0.5)) };
    };

    const trimNew = (v?: string | null) => {
      const s = String(v || "").trim();
      return s.length >= 2 && s.length <= 80 ? s : null;
    };

    const category = validate(parsed.category, input.categoriesCatalog);
    const family = validate(parsed.family, input.familiesCatalog);

    return {
      brand: validate(parsed.brand, input.brandsCatalog),
      category,
      family,
      proposedNewCategory: !category ? trimNew(parsed.proposedNewCategory) : null,
      proposedNewFamily: !family ? trimNew(parsed.proposedNewFamily) : null,
      rationale: parsed.rationale,
    };
  } catch (error) {
    console.error("OpenAI suggestProductClassification error", error);
    return {
      brand: heuristic(input.brandsCatalog),
      category: heuristic(input.categoriesCatalog),
      family: heuristic(input.familiesCatalog),
      rationale: "Fallback heurístico por error con OpenAI.",
    };
  }
}

export interface NcmSuggestion {
  position: string;
  confidence: number; // 0-1
  reasoning: string;
}

export async function suggestNcmPosition(input: {
  productName: string;
  description?: string | null;
  candidates: Array<{ position: string; description: string; die: string | null; aec: string | null }>;
}): Promise<NcmSuggestion | null> {
  const client = await getClient();
  if (!client || input.candidates.length === 0) return null;

  const candidateList = input.candidates
    .map((c, i) => `${i + 1}. ${c.position} — ${c.description}${c.die ? ` (DIE: ${c.die})` : ""}${c.aec ? ` (AEC: ${c.aec})` : ""}`)
    .join("\n");

  try {
    const model = await getModel();
    const resp = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Sos un experto en clasificación arancelaria argentina (NCM/MERCOSUR). Respondés solo JSON válido.",
        },
        {
          role: "user",
          content: `Elegí la posición arancelaria NCM más adecuada para este producto.

Producto: "${input.productName}"
${input.description ? `Descripción: "${input.description}"` : ""}

Candidatos disponibles:
${candidateList}

Respondé EXACTAMENTE con este JSON:
{
  "position": "<código NCM exacto de uno de los candidatos>",
  "confidence": <0.0 a 1.0>,
  "reasoning": "<explicación breve en español de por qué elegiste esa posición>"
}

Si ningún candidato es adecuado, devolvé confidence: 0.1 y reasoning explicando por qué.`,
        },
      ],
    });
    const raw = resp.choices[0]?.message.content || "{}";
    const parsed = JSON.parse(raw) as { position?: string; confidence?: number; reasoning?: string };
    if (!parsed.position || typeof parsed.position !== "string") return null;
    const match = input.candidates.find((c) => c.position === parsed.position!.trim());
    if (!match) return null;
    return {
      position: match.position,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
      reasoning: String(parsed.reasoning || "").trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Traduce una lista de nombres de categoría/grupo de inglés a español,
 * usando el contexto del rubro audiovisual profesional B2B.
 * Si no hay API key, devuelve un mapeo identidad.
 * Retorna { ORIGINAL_EN: traducción_es }.
 */
export async function translateCategoriesToEs(input: {
  items: string[];
  context?: string; // e.g. "Crestron control AV" — ayuda a desambiguar
}): Promise<Record<string, string>> {
  const items = Array.from(new Set(input.items.map((s) => s.trim()).filter(Boolean)));
  if (items.length === 0) return {};

  const client = await getClient();
  if (!client) {
    // Sin API key: devolver identidad para que el usuario al menos vea algo
    return Object.fromEntries(items.map((i) => [i, i]));
  }

  try {
    const model = await getModel();
    const resp = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Traducís nombres de categorías/grupos de productos audiovisuales B2B de inglés a español. Devolvés solo JSON.",
        },
        {
          role: "user",
          content: `Traducí cada categoría al español, manteniendo el sentido técnico del rubro audiovisual profesional (${input.context ?? "AV / control / audio / video"}).
Reglas:
- Usá plural cuando corresponda (ej. "AMPLIFIERS" → "Amplificadores").
- Mayúscula sólo en la primera letra, no en todas.
- Si la sigla es internacional (HDMI, USB, DSP, AV), mantenela.
- No agregues comentarios, sólo el JSON pedido.

Categorías a traducir:
${items.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}

Respondé EXACTAMENTE con:
{ "translations": { "<original exacto>": "<traducción en español>", ... } }`,
        },
      ],
    });

    const raw = resp.choices[0]?.message.content || "{}";
    const parsed = JSON.parse(raw) as { translations?: Record<string, unknown> };
    const out: Record<string, string> = {};
    for (const item of items) {
      const v = parsed.translations?.[item];
      if (typeof v === "string" && v.trim().length > 0) {
        out[item] = v.trim();
      } else {
        out[item] = item; // fallback identidad
      }
    }
    return out;
  } catch (error) {
    console.error("OpenAI translateCategoriesToEs error", error);
    return Object.fromEntries(items.map((i) => [i, i]));
  }
}

export async function suggestRequestResponse(context: { project?: string; items: { name: string; quantity: number }[] }): Promise<string> {
  const client = await getClient();
  if (!client) {
    return `Hola,\n\nGracias por tu solicitud${context.project ? ` para ${context.project}` : ""}. Estamos revisando los ${context.items.length} ítem(s) solicitados. En breve te enviaremos una propuesta con tiempos y condiciones.\n\nEquipo Soundtec.`;
  }
  try {
    const model = await getModel();
    const resp = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "Sos parte del equipo comercial de Soundtec. Tono cordial, profesional, claro y B2B. Respondés en español argentino.",
        },
        {
          role: "user",
          content: `Generá una respuesta inicial a una solicitud de cliente.
Proyecto: ${context.project || "(no especificado)"}
Ítems pedidos:
${context.items.map((i) => `- ${i.quantity} × ${i.name}`).join("\n")}
Indicá próximos pasos y plazos estimados (sin inventar disponibilidad concreta).`,
        },
      ],
    });
    return resp.choices[0]?.message.content?.trim() || "";
  } catch (error) {
    console.error("OpenAI suggestRequestResponse error", error);
    return "No se pudo generar una sugerencia en este momento.";
  }
}
