import { z } from "zod";
import { isRichText, sanitizeQuoteHtml } from "@/lib/quote-richtext";

/**
 * Formas que la IA de cotizaciones tiene que devolver, en dos versiones:
 * JSON Schema (para `response_format: json_schema` estricto de OpenAI) y zod
 * (para validar lo que vuelve, porque un modelo sin soporte de esquema puede
 * devolver otra cosa). Todo puro y testeable.
 */

export const WRITTEN_SECTION_TYPES = ["proposal", "design_criteria", "key_products", "functionality"] as const;
export type WrittenSectionType = (typeof WRITTEN_SECTION_TYPES)[number];

const textList = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["text"],
    properties: { text: { type: "string" } },
  },
} as const;

/** Paso 1: lectura del pedido + equipos sugeridos (no redacta textos). */
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["projectTitle", "facts", "assumptions", "questions", "risks", "items"],
  properties: {
    projectTitle: { type: "string" },
    facts: textList,
    assumptions: textList,
    questions: textList,
    risks: textList,
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["search", "quantity", "rationale", "kind", "serviceType"],
        properties: {
          search: { type: "string" },
          quantity: { type: "number" },
          rationale: { type: "string" },
          kind: { type: "string", enum: ["PRODUCT", "SERVICE"] },
          serviceType: { type: "string" },
        },
      },
    },
  },
} as const;

/** Paso 2: redacción de los módulos de proyecto. */
export const SECTIONS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sections"],
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "body"],
        properties: {
          type: { type: "string", enum: [...WRITTEN_SECTION_TYPES] },
          body: { type: "string" },
        },
      },
    },
  },
} as const;

export const ITEM_REWRITE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["description", "quantity"],
  properties: {
    description: { type: "string" },
    quantity: { type: ["number", "null"] },
  },
} as const;

const textEntry = z
  .union([z.object({ text: z.string() }).passthrough(), z.string()])
  .transform((v) => (typeof v === "string" ? v : v.text).trim());

const textArray = z
  .array(textEntry)
  .catch([])
  .transform((rows) => rows.filter(Boolean).slice(0, 20).map((text) => ({ text: text.slice(0, 500) })));

export const analysisSchema = z.object({
  projectTitle: z.string().catch(""),
  // Compatibilidad con corridas viejas que devolvían «reference».
  reference: z.string().optional().catch(undefined),
  facts: textArray.default([]),
  assumptions: textArray.default([]),
  questions: textArray.default([]),
  risks: textArray.default([]),
  items: z
    .array(
      z
        .object({
          search: z.string().catch(""),
          quantity: z.coerce.number().catch(1),
          rationale: z.string().optional().catch(""),
          kind: z.enum(["PRODUCT", "SERVICE"]).catch("PRODUCT"),
          serviceType: z.string().optional().catch(""),
        })
        .passthrough()
    )
    .catch([])
    .default([])
    .transform((rows) =>
      rows
        .map((row) => ({
          search: row.search.trim().slice(0, 160),
          quantity: Number.isFinite(row.quantity) && row.quantity > 0 ? Math.min(Math.round(row.quantity), 999) : 1,
          rationale: (row.rationale || "").trim().slice(0, 300),
          kind: row.kind,
          serviceType: (row.serviceType || "").trim() || undefined,
        }))
        .filter((row) => row.search.length >= 2)
        .slice(0, 30)
    ),
});
export type QuoteAnalysis = z.infer<typeof analysisSchema>;

const sectionRow = z
  .object({
    type: z.string(),
    body: z.string().optional(),
    // Los modelos sin esquema estricto suelen devolver «content» en vez de «body».
    content: z.string().optional(),
  })
  .passthrough();

export const sectionsSchema = z.object({ sections: z.array(sectionRow).catch([]).default([]) });

/**
 * Convierte la respuesta en un mapa tipo → cuerpo saneado. Ignora tipos
 * desconocidos y cuerpos vacíos; acepta `body` o `content`.
 */
export function parseGeneratedSections(raw: unknown): Map<WrittenSectionType, string> {
  const parsed = sectionsSchema.safeParse(raw);
  const out = new Map<WrittenSectionType, string>();
  if (!parsed.success) return out;
  for (const row of parsed.data.sections) {
    const type = row.type.trim() as WrittenSectionType;
    if (!WRITTEN_SECTION_TYPES.includes(type)) continue;
    const body = cleanGeneratedBody(row.body ?? row.content ?? "");
    if (!body || out.has(type)) continue;
    out.set(type, body);
  }
  return out;
}

export function stripCodeFences(text: string) {
  return text.replace(/^```(?:html|json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

/** Limpia fences y sanea HTML. Devuelve "" si no queda texto real. */
export function cleanGeneratedBody(text: string): string {
  const cleaned = stripCodeFences(text || "").trim();
  if (!cleaned) return "";
  const body = isRichText(cleaned) ? sanitizeQuoteHtml(cleaned) : cleaned;
  const plain = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain.length >= 20 ? body : "";
}

/**
 * Título de proyecto propuesto por la IA. Nada de códigos inventados
 * («PROP-001», «COT 2024/15»): si parece una referencia numerada, se descarta.
 */
export function cleanProjectTitle(value: string | null | undefined): string {
  const title = (value ?? "").replace(/\s+/g, " ").trim().replace(/^["«]|["»]$/g, "");
  if (title.length < 4) return "";
  if (/\b[A-Z]{2,6}[-_ /]?\d{2,}\b/.test(title)) return "";
  if (/\b(ref(erencia)?|cot(izaci[oó]n)?|prop(uesta)?|n[°º]|nro)\.?\s*[:#-]?\s*\d+/i.test(title)) return "";
  return title.slice(0, 120);
}

export const itemRewriteSchema = z.object({
  description: z.string().trim().min(1, "La IA no devolvió una descripción."),
  quantity: z
    .number()
    .nullable()
    .optional()
    .transform((q) => (typeof q === "number" && Number.isFinite(q) && q > 0 ? q : null)),
});

const UNCONFIRMED = /\[\s*a\s+confirmar\s*\]|\ba confirmar\b/i;

/**
 * Arma la descripción de un ítem reescrito conservando la primera línea
 * original (es el título de la fila en la planilla). Quita líneas con
 * «[a confirmar]»: si no hay dato, no se escribe.
 */
export function composeItemDescription(original: string, generated: string): string {
  const [titleRaw, ...originalRest] = original.split("\n");
  const title = titleRaw.trim();
  const lines = stripCodeFences(generated)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !UNCONFIRMED.test(line));
  while (lines.length && !lines[0].trim()) lines.shift();
  const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (lines.length && title && fold(lines[0]) === fold(title)) lines.shift();
  const body = lines.join("\n").trim();
  if (!title) return body || original;
  if (!body) return [title, ...originalRest].join("\n");
  return `${title}\n${body}`;
}
