/**
 * Lectura de planos con el modelo de visión configurado en Admin → API Keys
 * (el mismo que usan las cotizaciones). Devuelve la detección ya validada.
 */

import { getSetting } from "@/lib/settings";
import { getQuoteOpenAI } from "@/lib/quote-llm";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { listRoomTemplates } from "@/services/room-builder/templates";
import { normalizePlanAnalysis, PLAN_KINDS, type PlanAnalysis } from "@/services/room-builder/plan-analysis";

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
