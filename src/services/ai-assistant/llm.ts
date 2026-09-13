/**
 * Única llamada al modelo por consulta, con salida JSON validada.
 *
 * Lo que devuelve el modelo se trata como no confiable: se valida contra
 * zod y las etiquetas se traducen a productos reales en `answer.ts`.
 */

import { z } from "zod";
import { getOpenAiChatModel, getOpenAiClient } from "@/services/openai";
import { LIMITS } from "./budget";
import { SYSTEM_PROMPT } from "./prompt";

export interface RawLlmAnswer {
  answer: string;
  status?: "ANSWERED" | "PARTIAL" | "INSUFFICIENT_INFORMATION" | "OUT_OF_SCOPE";
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  productRefs?: string[];
  sourceRefs?: Array<{ ref: string; detail?: string }>;
}

/**
 * Lo único que se exige es el texto de la respuesta. El resto se limpia a
 * mano: si el modelo devuelve una etiqueta rara o un campo de más, se
 * descarta ese pedazo en vez de perder toda la respuesta.
 *
 * Las etiquetas igual se validan después contra los productos del contexto,
 * así que nada de lo que venga acá puede inventar un producto.
 */
const answerTextSchema = z.string().min(1).max(6000);

function cleanRefs(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0 && item.length <= 16)
    .slice(0, 8);
  return out.length > 0 ? out : undefined;
}

function cleanSourceRefs(value: unknown): RawLlmAnswer["sourceRefs"] {
  if (!Array.isArray(value)) return undefined;
  const out: Array<{ ref: string; detail?: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const ref = typeof row.ref === "string" ? row.ref.trim() : "";
    if (!ref || ref.length > 16) continue;
    const detail = typeof row.detail === "string" ? row.detail.trim().slice(0, 400) : undefined;
    out.push({ ref, detail });
    if (out.length >= 12) break;
  }
  return out.length > 0 ? out : undefined;
}

function normalizeAnswer(parsed: unknown): RawLlmAnswer | null {
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Record<string, unknown>;
  const answer = answerTextSchema.safeParse(row.answer);
  if (!answer.success) return null;

  const status = row.status;
  const confidence = row.confidence;
  return {
    answer: answer.data.trim(),
    status:
      status === "ANSWERED" || status === "PARTIAL" || status === "INSUFFICIENT_INFORMATION" || status === "OUT_OF_SCOPE"
        ? status
        : undefined,
    confidence:
      confidence === "HIGH" || confidence === "MEDIUM" || confidence === "LOW" ? confidence : undefined,
    productRefs: cleanRefs(row.productRefs),
    sourceRefs: cleanSourceRefs(row.sourceRefs),
  };
}

export type LlmOutcome =
  | { ok: true; data: RawLlmAnswer; model: string; inputTokens?: number; outputTokens?: number }
  | { ok: false; reason: "NOT_CONFIGURED" | "RATE_LIMITED" | "TIMEOUT" | "ERROR" };

function isRetryableStatus(status: unknown): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Si el modelo se quedó sin tokens a mitad del JSON, se rescata el texto de
 * "answer": una respuesta sin tarjetas es mucho mejor que un error.
 */
function salvageAnswer(raw: string): RawLlmAnswer | null {
  const match = raw.match(new RegExp(String.raw`"answer"\s*:\s*"((?:[^"\\]|\\.)*)`));
  if (!match) return null;
  let text: string;
  try {
    text = JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return null;
  }
  const clean = text.trim();
  if (clean.length < 40) return null;
  return { answer: clean, status: "PARTIAL", confidence: "MEDIUM" };
}

/** Expuesto para tests: convierte la salida cruda del modelo en algo usable. */
export function parseModelOutput(raw: string): RawLlmAnswer | null {
  try {
    return normalizeAnswer(JSON.parse(raw)) ?? salvageAnswer(raw);
  } catch {
    return salvageAnswer(raw);
  }
}

export async function askModel(
  userMessage: string,
  options?: { maxTokens?: number }
): Promise<LlmOutcome> {
  const client = await getOpenAiClient();
  if (!client) return { ok: false, reason: "NOT_CONFIGURED" };
  const model = await getOpenAiChatModel();

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.chat.completions.create(
        {
          model,
          temperature: 0.2,
          max_tokens: options?.maxTokens ?? LIMITS.maxOutputTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
        },
        { signal: AbortSignal.timeout(LIMITS.llmTimeoutMs) }
      );

      const raw = response.choices[0]?.message?.content ?? "";
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        const salvaged = salvageAnswer(raw);
        if (!salvaged) return { ok: false, reason: "ERROR" };
        return {
          ok: true,
          data: salvaged,
          model,
          inputTokens: response.usage?.prompt_tokens,
          outputTokens: response.usage?.completion_tokens,
        };
      }
      const normalized = normalizeAnswer(parsedJson) ?? salvageAnswer(raw);
      if (!normalized) return { ok: false, reason: "ERROR" };

      return {
        ok: true,
        data: normalized,
        model,
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
      };
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const name = (error as { name?: string })?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        return { ok: false, reason: "TIMEOUT" };
      }
      if (isRetryableStatus(status) && attempt === 1) {
        // Un reintento corto con jitter: en una feria, un 429 puntual no
        // debería costarle la respuesta al visitante.
        await sleep(350 + Math.floor(Math.random() * 400));
        continue;
      }
      if (status === 429) return { ok: false, reason: "RATE_LIMITED" };
      console.error("ai-assistant askModel error", error);
      return { ok: false, reason: "ERROR" };
    }
  }
  return { ok: false, reason: "ERROR" };
}
