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

const rawAnswerSchema = z.object({
  answer: z.string().min(1).max(4000),
  status: z.enum(["ANSWERED", "PARTIAL", "INSUFFICIENT_INFORMATION", "OUT_OF_SCOPE"]).optional(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  productRefs: z.array(z.string().max(8)).max(8).optional(),
  sourceRefs: z
    .array(z.object({ ref: z.string().max(8), detail: z.string().max(400).optional() }))
    .max(12)
    .optional(),
});

export type RawLlmAnswer = z.infer<typeof rawAnswerSchema>;

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
      const parsed = rawAnswerSchema.safeParse(parsedJson);
      if (!parsed.success) return { ok: false, reason: "ERROR" };

      return {
        ok: true,
        data: parsed.data,
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
