/**
 * Lectura de planos con el modelo de visión configurado en Admin → API Keys
 * (el mismo que usan las cotizaciones). Devuelve la detección ya validada.
 */

import { getSetting } from "@/lib/settings";
import { getQuoteOpenAI } from "@/lib/quote-llm";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { listRoomTemplates } from "@/services/room-builder/templates";
import { normalizeMarkedAnalysis, normalizePlanAnalysis, PLAN_KINDS, type PlanAnalysis, type PlanBox } from "@/services/room-builder/plan-analysis";
import { OBJECT_KINDS, type Facing, type ObjectKind } from "@/services/room-builder/plan-objects";

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
- templateKey: el tipo más parecido de esta lista (oficinas, open space, recepción, sala de descanso, baños, pasillos y cualquier espacio común también tienen tipo; si ninguno encaja usá \"generic-room\"). null SOLO para depósitos, placards, escaleras y ductos:
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

function regionsPrompt(count: number): string {
  const templates = listRoomTemplates()
    .map((t) => `- ${t.key}: ${t.name} (${t.category})`)
    .join("\n");
  return `Sos un arquitecto que lee planos para un integrador audiovisual (Soundtec).
Vas a recibir el PLANO COMPLETO y después ${count} RECORTES, cada uno precedido por el texto "Espacio N". Cada recorte es un ambiente cerrado del plano.
Devolvé SOLO un JSON:
{
  "kind": uno de ${PLAN_KINDS.map((k) => `"${k}"`).join(", ")},
  "summary": "qué es el plano en una frase",
  "marks": [ { "n": 1, "name": "...", "templateKey": "clave o null", "widthM": número o null, "depthM": número o null } ],
  "missing": [ { "name": "...", "templateKey": "...", "box": { "x0": 0.1, "y0": 0.2, "x1": 0.3, "y1": 0.4 } } ]
}

Reglas:
- Un elemento en "marks" por cada Espacio del 1 al ${count}, usando SOLO lo que se ve en SU recorte (el texto escrito adentro). Si el recorte no tiene texto, deducí el ambiente por su forma y contexto.
- { "n": N, "notARoom": true } si el recorte no es un ambiente (hueco de escalera, ducto, mueble, exterior sin uso).
- widthM / depthM: solo si las medidas están escritas en ese recorte (widthM = lado horizontal). Si no, null.
- templateKey: el tipo más parecido de esta lista (oficinas, open space, recepción, sala de descanso, baños, pasillos y cualquier espacio común también tienen tipo; si ninguno encaja usá \"generic-room\"). null SOLO para depósitos, placards, escaleras y ductos:
${templates}
- "missing": ambientes con nombre en el PLANO COMPLETO que no aparecen en ningún recorte, con su rectángulo aproximado (fracciones 0..1). Si no hay, [].`;
}

type ChatPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } };

/**
 * Lectura por recortes: cada espacio cerrado va como imagen propia ("Espacio N"),
 * así la IA solo lee el texto de cada uno y no puede cruzar nombres.
 */
export async function analyzePlanRegions(fullDataUrl: string, cropDataUrls: string[], regionBoxes: PlanBox[]): Promise<PlanAnalysis> {
  const oa = await getQuoteOpenAI();
  if (!oa) throw new Error("Falta la API key de OpenAI en Admin → API Keys para leer planos.");
  const model = (await getSetting(QUOTE_SETTING_KEYS.visionModel, "")) || DEFAULT_VISION_MODEL;
  const content: ChatPart[] = [
    { type: "text", text: "PLANO COMPLETO:" },
    { type: "image_url", image_url: { url: fullDataUrl, detail: "high" } },
  ];
  cropDataUrls.forEach((url, i) => {
    content.push({ type: "text", text: `Espacio ${i + 1}:` });
    content.push({ type: "image_url", image_url: { url, detail: "low" } });
  });
  const resp = await oa.client.chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens: MAX_OUTPUT_TOKENS,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: regionsPrompt(cropDataUrls.length) },
      { role: "user", content },
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

/** Un mueble dentro de un recorte: tipo, hacia dónde mira y su lugar en el recorte (0..1). */
export type ObjectItem = { kind: ObjectKind; facing: Facing; box: { x0: number; y0: number; x1: number; y1: number } };
/** Lo que la IA ve en cada recorte (null = no respondió). */
export type ObjectReading = ObjectItem[] | null;

const FACINGS: Facing[] = ["up", "down", "left", "right"];
const MAX_ITEMS_PER_CROP = 12;

function objectsPrompt(roomName: string, count: number): string {
  return `Sos un arquitecto que lee planos. Recibís ${count} recortes de un plano (vista de planta, desde arriba) del ambiente "${roomName}".
Cada recorte puede tener UN objeto o un GRUPO (por ejemplo sillones, macetas y una mesa ratona juntos). Listá cada mueble u objeto que veas dentro del recorte.
Devolvé SOLO un JSON:
{ "crops": [ { "n": 1, "items": [ { "kind": "...", "facing": "up|down|left|right", "box": { "x0": 0.1, "y0": 0.2, "x1": 0.6, "y1": 0.5 } } ] } ] }
- box: dónde está ese objeto dentro del recorte, en fracciones (0..1, x hacia la derecha, y hacia abajo). Si el recorte es un solo objeto, box ≈ todo el objeto.
- kind es uno de: ${OBJECT_KINDS.join(", ")}.
  sofa: sillón de 2+ cuerpos; armchair: sillón individual; dining-set: mesa con sillas; table: mesa sola (incluye mesa ratona); desk: escritorio;
  counter: mostrador / barra; kitchen-counter: mesada de cocina; planter: maceta redonda o cuadrada con planta; planter-box: jardinera (macetero largo con plantas);
  tree: árbol o planta grande de interior; rug: alfombra; bench: banco; side-table: mesa auxiliar o de luz; ottoman: puff;
  wardrobe: placard; shelving: estantería; tv: mueble de TV;
  toilet, sink (bacha / vanitory), shower, bathtub; door: arco de puerta; text: letras o cotas; stairs: escalera; other: no se reconoce.
- facing: hacia dónde mira el frente (un sillón hacia el lado opuesto a su respaldo, una cama hacia los pies, un mostrador hacia el público). "up" = arriba del recorte.
- Listá CADA pieza por separado (cada sillón, cada maceta, cada mesa), con su box ajustado a esa pieza; no un box para todo el grupo.
- Un sillón en L, en U o modular (varios cuerpos pegados) es UN solo sofa con el box de toda la forma: no lo partas en armchairs. armchair es solo un sillón individual suelto. Una barra o mostrador es un counter con el box solo de la barra (no el espacio de atrás).
- No inventes objetos: solo lo dibujado. Las puertas y los textos listalos como door / text.`;
}

const frac = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n > 1.5 ? n / 100 : n)) : null;
};

/** Clasifica los objetos de un ambiente (un solo pedido con todos los recortes). */
export async function classifyPlanObjects(roomName: string, cropDataUrls: string[], roomDataUrl?: string): Promise<ObjectReading[]> {
  if (!cropDataUrls.length) return [];
  const oa = await getQuoteOpenAI();
  if (!oa) return cropDataUrls.map(() => null);
  const model = (await getSetting(QUOTE_SETTING_KEYS.visionModel, "")) || DEFAULT_VISION_MODEL;
  const content: ChatPart[] = [];
  // El ambiente entero como contexto (qué es cada cosa se entiende mejor viendo el conjunto).
  if (roomDataUrl) {
    content.push({ type: "text", text: "AMBIENTE COMPLETO (contexto, no lo listes):" });
    content.push({ type: "image_url", image_url: { url: roomDataUrl, detail: "high" } });
  }
  cropDataUrls.forEach((url, i) => {
    content.push({ type: "text", text: `Recorte ${i + 1}:` });
    content.push({ type: "image_url", image_url: { url, detail: "high" } });
  });
  const resp = await oa.client.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: objectsPrompt(roomName, cropDataUrls.length) },
      { role: "user", content },
    ],
  });
  let parsed: { crops?: Array<{ n?: unknown; items?: unknown }> } = {};
  try {
    parsed = JSON.parse(resp.choices[0]?.message.content || "{}");
  } catch {
    return cropDataUrls.map(() => null);
  }
  const byN = new Map<number, ObjectItem[]>();
  for (const c of parsed.crops ?? []) {
    const n = Number(c.n);
    if (!Number.isInteger(n) || !Array.isArray(c.items)) continue;
    const items: ObjectItem[] = [];
    for (const raw of c.items.slice(0, MAX_ITEMS_PER_CROP)) {
      if (!raw || typeof raw !== "object") continue;
      const it = raw as Record<string, unknown>;
      const kind = OBJECT_KINDS.includes(it.kind as ObjectKind) ? (it.kind as ObjectKind) : null;
      const b = (it.box ?? {}) as Record<string, unknown>;
      const x0 = frac(b.x0);
      const y0 = frac(b.y0);
      const x1 = frac(b.x1);
      const y1 = frac(b.y1);
      if (!kind || x0 == null || y0 == null || x1 == null || y1 == null || x1 <= x0 || y1 <= y0) continue;
      items.push({ kind, facing: FACINGS.includes(it.facing as Facing) ? (it.facing as Facing) : "down", box: { x0, y0, x1, y1 } });
    }
    byN.set(n, items);
  }
  return cropDataUrls.map((_, i) => byN.get(i + 1) ?? null);
}
