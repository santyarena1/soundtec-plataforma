/**
 * Embeddings para la búsqueda semántica.
 *
 * Se usan 256 dimensiones (el modelo admite recortarlas) en vez de 1536: el
 * vector ocupa 6 veces menos y el ranking corre en Node sobre el subconjunto
 * que ya pasó los filtros, así que no hace falta pgvector para funcionar.
 * Si mañana la base tiene la extensión, el mismo vector sirve.
 */

import { getOpenAiClient } from "@/services/openai";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 256;

export type EmbeddingOutcome =
  | { ok: true; vectors: number[][]; tokens: number }
  | { ok: false; reason: "NOT_CONFIGURED" | "ERROR" };

export async function embedTexts(texts: string[]): Promise<EmbeddingOutcome> {
  const inputs = texts.map((value) => value.replace(/\s+/g, " ").trim().slice(0, 6000)).filter(Boolean);
  if (inputs.length === 0) return { ok: true, vectors: [], tokens: 0 };

  const client = await getOpenAiClient();
  if (!client) return { ok: false, reason: "NOT_CONFIGURED" };

  try {
    const response = await client.embeddings.create(
      { model: EMBEDDING_MODEL, input: inputs, dimensions: EMBEDDING_DIMS },
      { signal: AbortSignal.timeout(30_000) }
    );
    const vectors = response.data
      .sort((a, b) => a.index - b.index)
      .map((row) => row.embedding as number[]);
    return { ok: true, vectors, tokens: response.usage?.total_tokens ?? 0 };
  } catch {
    return { ok: false, reason: "ERROR" };
  }
}

export async function embedOne(text: string): Promise<number[] | null> {
  const outcome = await embedTexts([text]);
  if (!outcome.ok || outcome.vectors.length === 0) return null;
  return outcome.vectors[0];
}

/**
 * Coseno. Los vectores de OpenAI vienen normalizados, así que el producto
 * punto alcanza; igual se divide por las normas para no depender de eso.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
