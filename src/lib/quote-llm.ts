import OpenAI from "openai";
import { getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";

export async function getQuoteOpenAI(): Promise<{ client: OpenAI; model: string; provider: string } | null> {
  const key =
    (await getSetting(QUOTE_SETTING_KEYS.openaiKey, "")) || process.env.OPENAI_API_KEY || "";
  if (!key) return null;
  const writer = await getSetting(QUOTE_SETTING_KEYS.writerModel, "");
  const fallback = await getSetting(QUOTE_SETTING_KEYS.openaiModel, process.env.OPENAI_MODEL || "gpt-4o-mini");
  return {
    client: new OpenAI({ apiKey: key }),
    model: writer || fallback || "gpt-4o-mini",
    provider: "openai",
  };
}

export async function quoteChatJson<T>(system: string, user: string): Promise<T> {
  const oa = await getQuoteOpenAI();
  if (!oa) throw new Error("Falta OpenAI API Key en Admin → API Keys.");
  const resp = await oa.client.chat.completions.create({
    model: oa.model,
    response_format: { type: "json_object" },
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const raw = resp.choices[0]?.message.content || "{}";
  return JSON.parse(raw) as T;
}

export async function quoteChatText(system: string, user: string): Promise<string> {
  const oa = await getQuoteOpenAI();
  if (!oa) throw new Error("Falta OpenAI API Key en Admin → API Keys.");
  const resp = await oa.client.chat.completions.create({
    model: oa.model,
    temperature: 0.35,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return resp.choices[0]?.message.content?.trim() || "";
}

export async function describeQuotePlanImage(imageUrl: string): Promise<string> {
  const oa = await getQuoteOpenAI();
  if (!oa) return "";
  const vision =
    (await getSetting(QUOTE_SETTING_KEYS.visionModel, "")) || "gpt-4o";
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
}

const SOUNDTEC_VOICE = `Escribís propuestas técnico-comerciales para SOUNDTEC S.R.L. (integrador audiovisual argentino).
Tono: ingeniero comercial serio. Frases cortas, datos, sin adjetivos vacíos, sin “innovador/revolucionario/cutting-edge”, sin estructura de blog.
No inventes SKU, watts, protocolos ni precios. Si no hay dato, omití o marcá [a confirmar].
Español rioplatense formal.`;

export { SOUNDTEC_VOICE };
