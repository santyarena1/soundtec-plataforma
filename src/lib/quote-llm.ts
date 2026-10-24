import OpenAI from "openai";
import type { ZodType, ZodTypeDef } from "zod";
import { getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";

/** Mismo texto en todas las acciones de IA de cotizaciones. */
export const QUOTE_OPENAI_MISSING_KEY = "Falta la clave de OpenAI: Configuración → Integraciones y claves.";

/** Cada llamada corta a los 60 s y reintenta una sola vez. */
const LLM_TIMEOUT_MS = 60_000;
const LLM_MAX_RETRIES = 1;

/** Error con mensaje en español, listo para mostrar en pantalla. */
export class QuoteLlmError extends Error {
  constructor(message: string, readonly original?: unknown) {
    super(message);
    this.name = "QuoteLlmError";
  }
}

export async function getQuoteOpenAI(): Promise<{ client: OpenAI; model: string; provider: string } | null> {
  const key =
    (await getSetting(QUOTE_SETTING_KEYS.openaiKey, "")) || process.env.OPENAI_API_KEY || "";
  if (!key) return null;
  const writer = await getSetting(QUOTE_SETTING_KEYS.writerModel, "");
  const fallback = await getSetting(QUOTE_SETTING_KEYS.openaiModel, process.env.OPENAI_MODEL || "gpt-4o-mini");
  return {
    client: new OpenAI({ apiKey: key, timeout: LLM_TIMEOUT_MS, maxRetries: LLM_MAX_RETRIES }),
    model: writer || fallback || "gpt-4o-mini",
    provider: "openai",
  };
}

/** Traduce errores de OpenAI a algo que el comercial pueda entender. */
export function friendlyLlmError(error: unknown, model?: string): QuoteLlmError {
  if (error instanceof QuoteLlmError) return error;
  console.error("[quote-llm] error de OpenAI", error);
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new QuoteLlmError("OpenAI tardó más de 60 segundos en responder. Probá de nuevo en un rato.", error);
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new QuoteLlmError("No se pudo conectar con OpenAI. Revisá la conexión y probá de nuevo.", error);
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status ?? 0;
    if (status === 401 || status === 403) {
      return new QuoteLlmError("OpenAI rechazó la clave. Revisala en Configuración → Integraciones y claves.", error);
    }
    if (status === 429) {
      return new QuoteLlmError("OpenAI frenó el pedido por límite de uso o falta de saldo. Esperá unos minutos o revisá la cuenta.", error);
    }
    if (status === 404) {
      return new QuoteLlmError(`El modelo de OpenAI configurado${model ? ` («${model}»)` : ""} no existe o no está habilitado para esta clave.`, error);
    }
    if (status >= 500) {
      return new QuoteLlmError("OpenAI está con problemas en este momento. Probá de nuevo en unos minutos.", error);
    }
    return new QuoteLlmError(`OpenAI no aceptó el pedido${model ? ` (modelo «${model}»)` : ""}. Si se repite, revisá el modelo configurado.`, error);
  }
  return new QuoteLlmError("La IA no respondió como se esperaba. Probá de nuevo.", error);
}

function isSchemaUnsupported(error: unknown) {
  return (
    error instanceof OpenAI.BadRequestError &&
    /response_format|json_schema|structured/i.test(String(error.message || ""))
  );
}

export type JsonSchemaSpec = { name: string; schema: Record<string, unknown> };

/**
 * Pide JSON. Con `schema`, usa salida estructurada estricta (el modelo no puede
 * cambiar nombres de campos); si el modelo configurado no la soporta, cae a
 * JSON libre. Con `validate`, la respuesta pasa por zod antes de devolverse.
 */
export async function quoteChatJson<T>(
  system: string,
  user: string,
  options: { schema?: JsonSchemaSpec; validate?: ZodType<T, ZodTypeDef, unknown>; temperature?: number } = {}
): Promise<T> {
  const oa = await getQuoteOpenAI();
  if (!oa) throw new QuoteLlmError(QUOTE_OPENAI_MISSING_KEY);
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
  const temperature = options.temperature ?? 0.3;
  let raw = "";
  try {
    try {
      const resp = await oa.client.chat.completions.create({
        model: oa.model,
        temperature,
        messages,
        response_format: options.schema
          ? { type: "json_schema", json_schema: { name: options.schema.name, schema: options.schema.schema, strict: true } }
          : { type: "json_object" },
      });
      raw = resp.choices[0]?.message.content || "";
    } catch (error) {
      if (!options.schema || !isSchemaUnsupported(error)) throw error;
      const resp = await oa.client.chat.completions.create({
        model: oa.model,
        temperature,
        messages,
        response_format: { type: "json_object" },
      });
      raw = resp.choices[0]?.message.content || "";
    }
  } catch (error) {
    throw friendlyLlmError(error, oa.model);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw || "{}");
  } catch (error) {
    console.error("[quote-llm] JSON inválido de la IA", raw.slice(0, 500));
    throw new QuoteLlmError("La IA devolvió una respuesta mal formada. Probá de nuevo.", error);
  }
  if (!options.validate) return data as T;
  const parsed = options.validate.safeParse(data);
  if (!parsed.success) {
    console.error("[quote-llm] respuesta fuera de esquema", parsed.error.issues.slice(0, 5), raw.slice(0, 500));
    throw new QuoteLlmError(parsed.error.issues[0]?.message || "La IA devolvió datos incompletos. Probá de nuevo.");
  }
  return parsed.data;
}

export async function quoteChatText(system: string, user: string): Promise<string> {
  const oa = await getQuoteOpenAI();
  if (!oa) throw new QuoteLlmError(QUOTE_OPENAI_MISSING_KEY);
  try {
    const resp = await oa.client.chat.completions.create({
      model: oa.model,
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return resp.choices[0]?.message.content?.trim() || "";
  } catch (error) {
    throw friendlyLlmError(error, oa.model);
  }
}

export async function describeQuotePlanImage(imageUrl: string): Promise<string> {
  const oa = await getQuoteOpenAI();
  if (!oa) return "";
  const vision =
    (await getSetting(QUOTE_SETTING_KEYS.visionModel, "")) || "gpt-4o";
  try {
    const resp = await oa.client.chat.completions.create({
      model: vision,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content:
            "Describí el plano o foto de obra para un integrador audiovisual. Zonas, distancias visibles, equipamiento existente, restricciones. Sin inventar medidas exactas si no se leen. Español técnico corto.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Qué se ve en este plano o foto, útil para armar una cotización Soundtec." },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    });
    return resp.choices[0]?.message.content?.trim() || "";
  } catch (error) {
    throw friendlyLlmError(error, vision);
  }
}

const SOUNDTEC_VOICE = `Escribís propuestas técnico-comerciales para SOUNDTEC S.R.L. (integrador audiovisual argentino).
Tono: ingeniero comercial serio. Frases cortas, datos, sin adjetivos vacíos, sin “innovador/revolucionario/cutting-edge”, sin estructura de blog.
No inventes SKU, watts, protocolos, capacidades ni precios. Si no hay dato, omitilo: nunca escribas «[a confirmar]» ni marcadores parecidos.
Español rioplatense formal.`;

export { SOUNDTEC_VOICE };
