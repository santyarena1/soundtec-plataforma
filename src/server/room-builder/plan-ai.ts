/**
 * Lectura de planos con el modelo de visión configurado en Admin → API Keys
 * (el mismo que usan las cotizaciones). Devuelve la detección ya validada.
 */

import { getSetting } from "@/lib/settings";
import { getQuoteOpenAI } from "@/lib/quote-llm";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { listRoomTemplates } from "@/services/room-builder/templates";
import { normalizeMarkedAnalysis, normalizePlanAnalysis, PLAN_KINDS, type PlanAnalysis, type PlanBox } from "@/services/room-builder/plan-analysis";

const DEFAULT_VISION_MODEL = "gpt-4o";
const MAX_OUTPUT_TOKENS = 3500;

function systemPrompt(): string {
  const templates = listRoomTemplates()
    .map((t) => `- ${t.key}: ${t.name} (${t.category})`)
    .join("\n");
  return `Sos un arquitecto que lee planos para un integrador audiovisual (Soundtec).
Recibís la imagen de un plano. Devolvé SOLO un JSON con esta forma:
{
  "kind": uno de ${PLAN_KINDS.map((k) => `"${k}"`).join(", ")},
  "summary": "qué es el plano en una frase (ej. casa de dos plantas con 3 dormitorios)",
  "rooms": [
    {
      "name": "nombre del ambiente como figura en el plano (o uno claro si no tiene)",
      "templateKey": "una clave de la lista o null",
      "box": { "x0": 0.12, "y0": 0.08, "x1": 0.45, "y1": 0.36 },
      "widthM": número o null,
      "depthM": número o null
    }
  ]
}

Reglas:
- "box" es el rectángulo interior de cada ambiente, en fracciones 0..1 de la imagen completa (x hacia la derecha, y hacia abajo). Sé preciso con los muros.
- widthM / depthM: solo si las medidas del ambiente están escritas en el plano (cotas o "4,20 x 3,50"). widthM es el lado horizontal de la imagen. Si no se leen, null. No inventes medidas.
- templateKey: el tipo de ambiente más parecido de esta lista; null para baños, pasillos, lavaderos, escaleras, depósitos, placards, vestidores y circulaciones:
${templates}
- Incluí todos los ambientes de todas las plantas que aparezcan.
- Si la imagen no es un plano, devolvé "rooms": [] y explicalo en "summary".`;
}

export async function analyzePlanImage(imageDataUrl: string): Promise<PlanAnalysis> {
  const oa = await getQuoteOpenAI();
  if (!oa) throw new Error("Falta la API key de OpenAI en Admin → API Keys para leer planos.");
  const model = (await getSetting(QUOTE_SETTING_KEYS.visionModel, "")) || DEFAULT_VISION_MODEL;
  const resp = await oa.client.chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens: MAX_OUTPUT_TOKENS,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt() },
      {
        role: "user",
        content: [
          { type: "text", text: "Leé este plano: tipo de proyecto y cada ambiente con su rectángulo." },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
        ],
      },
    ],
  });
  const raw = resp.choices[0]?.message.content || "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("La IA no devolvió un resultado legible. Probá de nuevo.");
  }
  return normalizePlanAnalysis(
    parsed,
    listRoomTemplates().map((t) => t.key),
  );
}

function markedPrompt(count: number): string {
  const templates = listRoomTemplates()
    .map((t) => `- ${t.key}: ${t.name} (${t.category})`)
    .join("\n");
  return `Sos un arquitecto que lee planos para un integrador audiovisual (Soundtec).
Sobre el plano dibujamos ${count} espacios con un número del 1 al ${count} en un círculo de color (arriba a la izquierda de cada espacio).
Leé el texto del plano DENTRO de cada espacio numerado y devolvé SOLO un JSON:
{
  "kind": uno de ${PLAN_KINDS.map((k) => `"${k}"`).join(", ")},
  "summary": "qué es el plano en una frase",
  "marks": [
    { "n": 1, "name": "nombre escrito en ese espacio", "templateKey": "clave o null", "widthM": número o null, "depthM": número o null },
    { "n": 7, "notARoom": true }
  ],
  "missing": [ { "name": "...", "templateKey": "...", "box": { "x0": 0.1, "y0": 0.2, "x1": 0.3, "y1": 0.4 } } ]
}

Reglas:
- Un elemento en "marks" por cada número del 1 al ${count}. El nombre es el texto que está dentro de ESE espacio; si no tiene texto, poné un nombre descriptivo.
- "notARoom": true si el espacio numerado no es un ambiente (hueco de escalera, ducto, parte de un mueble, exterior sin uso).
- widthM / depthM: solo si las medidas de ese ambiente están escritas en el plano (widthM = lado horizontal de la imagen). Si no se leen, null.
- templateKey: el tipo más parecido de esta lista; null para baños, pasillos, lavaderos, escaleras, depósitos, placards, vestidores:
${templates}
- "missing": ambientes con nombre en el plano que NO tienen número (por ejemplo sin muros que los cierren), con su rectángulo aproximado en fracciones 0..1 de la imagen. Si no hay, [].`;
}

/** Lectura con los espacios ya numerados sobre la imagen (la IA solo lee, no ubica). */
export async function analyzeMarkedPlan(markedDataUrl: string, regionBoxes: PlanBox[]): Promise<PlanAnalysis> {
  const oa = await getQuoteOpenAI();
  if (!oa) throw new Error("Falta la API key de OpenAI en Admin → API Keys para leer planos.");
  const model = (await getSetting(QUOTE_SETTING_KEYS.visionModel, "")) || DEFAULT_VISION_MODEL;
  const resp = await oa.client.chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens: MAX_OUTPUT_TOKENS,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: markedPrompt(regionBoxes.length) },
      {
        role: "user",
        content: [
          { type: "text", text: "Leé el plano numerado: tipo de proyecto y qué ambiente es cada número." },
          { type: "image_url", image_url: { url: markedDataUrl, detail: "high" } },
        ],
      },
    ],
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(resp.choices[0]?.message.content || "{}");
  } catch {
    throw new Error("La IA no devolvió un resultado legible. Probá de nuevo.");
  }
  return normalizeMarkedAnalysis(
    parsed,
    regionBoxes,
    listRoomTemplates().map((t) => t.key),
  );
}
