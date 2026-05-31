import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Cache de traducciones EN → ES para evitar re-llamar a OpenAI por textos ya traducidos.
 * Estrategia anti-rompimiento: si OpenAI falla, devuelve el texto original (no rompe el flujo).
 */

export type TranslationContext =
  | "product_name"
  | "spec_label"
  | "spec_value"
  | "category"
  | "short_desc"
  | "long_desc"
  | "doc_name";

function hashKey(sourceText: string, sourceLang: string, targetLang: string, context?: string): string {
  return crypto
    .createHash("sha256")
    .update(`${sourceText}|${sourceLang}|${targetLang}|${context ?? ""}`)
    .digest("hex");
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Devuelve el cache para un set de textos. */
async function getCached(
  texts: string[],
  context?: TranslationContext
): Promise<Map<string, string>> {
  const keys = texts.map((t) => hashKey(cleanText(t), "en", "es", context));
  if (keys.length === 0) return new Map();
  const rows = await prisma.translationCache.findMany({
    where: { key: { in: keys } },
    select: { sourceText: true, translatedText: true },
  });
  const out = new Map<string, string>();
  for (const r of rows) out.set(r.sourceText, r.translatedText);
  return out;
}

async function upsertCache(
  entries: { sourceText: string; translatedText: string; context?: TranslationContext }[]
): Promise<void> {
  if (entries.length === 0) return;
  await Promise.all(
    entries.map((e) => {
      const cleanedSource = cleanText(e.sourceText);
      const key = hashKey(cleanedSource, "en", "es", e.context);
      return prisma.translationCache.upsert({
        where: { key },
        create: {
          key,
          sourceText: cleanedSource,
          sourceLang: "en",
          targetLang: "es",
          context: e.context ?? null,
          translatedText: e.translatedText,
        },
        update: { translatedText: e.translatedText, updatedAt: new Date() },
      });
    })
  );
}

interface OpenAIClient {
  chat: {
    completions: {
      create: (args: unknown) => Promise<{ choices: Array<{ message: { content: string | null } }> }>;
    };
  };
}

async function callOpenAIBatch(
  client: OpenAIClient,
  model: string,
  items: string[],
  context: TranslationContext,
  domain: string
): Promise<Record<string, string>> {
  const contextHint: Record<TranslationContext, string> = {
    product_name: "nombres de productos audiovisuales B2B",
    spec_label: "etiquetas de especificaciones técnicas (ej. 'Frequency Response' → 'Respuesta en frecuencia')",
    spec_value: "valores de especificaciones técnicas, conservar unidades (Hz, dB, Ω, W, mm) y números",
    category: "categorías/grupos de productos",
    short_desc: "descripciones cortas de producto",
    long_desc: "descripciones largas / HTML; conservá las etiquetas HTML intactas",
    doc_name: "nombres de documentos técnicos / datasheets / manuales",
  };

  const systemPrompt =
    `Traducís textos del rubro audiovisual profesional (${domain}) de inglés a español. ` +
    `Conservás siglas internacionales (HDMI, USB, DSP, AV, RMS), unidades (Hz, dB, W, V, Ω, mm, kg) y números. ` +
    `Devolvés sólo JSON. Si un texto ya está en español, devolvélo igual.`;

  const userPrompt =
    `Traducí cada texto. Contexto: ${contextHint[context]}.\n\n` +
    `Textos:\n${items.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\n` +
    `Respondé exactamente:\n` +
    `{ "translations": { "<texto original exacto>": "<traducción al español>", ... } }`;

  const resp = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  } as unknown);

  const raw = resp.choices[0]?.message.content ?? "{}";
  const parsed = JSON.parse(raw) as { translations?: Record<string, unknown> };
  const out: Record<string, string> = {};
  for (const original of items) {
    const v = parsed.translations?.[original];
    if (typeof v === "string" && v.trim().length > 0) out[original] = v.trim();
  }
  return out;
}

/**
 * Traduce un batch de textos EN → ES con cache.
 * - Para cada texto: si está en cache, lo usa.
 * - Para los restantes, llama a OpenAI (1 sola llamada con todos).
 * - Cachea los resultados.
 * - Si OpenAI falla: devuelve el texto original (fallback graceful).
 *
 * Retorna un Map<original, traducción> con TODOS los textos pedidos.
 */
export async function translateBatchCached(
  texts: string[],
  context: TranslationContext,
  domain: string = "Sonance / IPORT / BLAZE / JAMES — altavoces profesionales B2B"
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(texts.map(cleanText).filter((t) => t.length > 0))
  );
  if (unique.length === 0) return new Map();

  // 1. Lookup cache
  const cached = await getCached(unique, context);
  const missing = unique.filter((t) => !cached.has(t));

  // 2. Translate missing via OpenAI
  if (missing.length > 0) {
    try {
      // Lazy-load OpenAI client and settings to keep this service decoupled
      const { default: OpenAI } = await import("openai");
      const { getSetting } = await import("@/lib/settings");
      const dbKey = await getSetting("openai.api_key", "");
      const apiKey = dbKey || process.env.OPENAI_API_KEY || "";
      const dbModel = await getSetting("openai.model", "");
      const model = dbModel || process.env.OPENAI_MODEL || "gpt-4o-mini";

      if (!apiKey) {
        // No OpenAI configured: identity fallback (everything stays in EN)
        for (const t of missing) cached.set(t, t);
      } else {
        const client = new OpenAI({ apiKey });
        // Chunk to avoid huge prompts (50 strings per call max)
        const CHUNK = 50;
        const newEntries: { sourceText: string; translatedText: string; context: TranslationContext }[] = [];
        for (let i = 0; i < missing.length; i += CHUNK) {
          const slice = missing.slice(i, i + CHUNK);
          const result = await callOpenAIBatch(client as OpenAIClient, model, slice, context, domain);
          for (const t of slice) {
            const translated = result[t] ?? t; // identity fallback per missing item
            cached.set(t, translated);
            newEntries.push({ sourceText: t, translatedText: translated, context });
          }
        }
        // Best-effort cache write — if it fails (e.g. DB hiccup) we still return the translations
        try {
          await upsertCache(newEntries);
        } catch (e) {
          console.error("translation-cache: upsert failed", e);
        }
      }
    } catch (e) {
      console.error("translation-cache: openai call failed, falling back to identity", e);
      for (const t of missing) if (!cached.has(t)) cached.set(t, t);
    }
  }

  // 3. Build result map: input text → translation (with cleanText normalization)
  const out = new Map<string, string>();
  for (const original of texts) {
    const cleaned = cleanText(original);
    out.set(original, cached.get(cleaned) ?? original);
  }
  return out;
}

/** Conveniencia para 1 texto. */
export async function translateOneCached(
  text: string,
  context: TranslationContext
): Promise<string> {
  const m = await translateBatchCached([text], context);
  return m.get(text) ?? text;
}
