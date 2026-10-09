/**
 * Sala desde una frase: la IA traduce lo que escribe el usuario a la
 * tipología del catálogo, sus medidas y el relevamiento del asistente
 * (sistemas, plataforma, pantallas, marcas, nivel). Todo pasa por los mismos
 * validadores del asistente; lo que la frase no dice queda con los valores
 * típicos del ambiente y se informa como supuesto.
 */

import { getSetting } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { getOpenAiClient } from "@/services/openai";
import { initialBrief } from "@/components/room-builder/wizard/wizard-data";
import { BRAND_GROUPS, BRIEF_CONTROLS, BRIEF_SYSTEMS, BRIEF_TIERS, BRIEF_VC_PLATFORMS, AUDIO_USES, SPEAKER_STYLES, normalizeBrief, type RoomBrief } from "@/services/room-builder/brief";
import { getRoomTemplate, listRoomTemplates } from "@/services/room-builder/templates";

export type TextRoomPlan = {
  name: string;
  templateKey: string;
  templateName: string;
  category: string;
  widthM: number;
  depthM: number;
  heightM: number;
  unitCount: number;
  brief: RoomBrief;
  assumptions: string[];
};

const MIN_SIDE_M = 1.5;
const MAX_SIDE_M = 80;
const MIN_HEIGHT_M = 2.2;
const MAX_HEIGHT_M = 15;
const MAX_UNITS = 500;

function prompt(templates: string, brands: string) {
  return `Sos un integrador AV que arma el relevamiento de un ambiente a partir de una frase del vendedor.
Devolvés SOLO un JSON con esta forma:
{
  "name": "nombre corto del ambiente",
  "templateKey": "una de las claves de TIPOLOGÍAS",
  "widthM": número o null, "depthM": número o null, "heightM": número o null,
  "unitCount": cantidad de ambientes iguales (ej. "20 habitaciones" = 20) o 1,
  "systems": subconjunto de [${BRIEF_SYSTEMS.join(", ")}],
  "control": uno de [${BRIEF_CONTROLS.join(", ")}],
  "vcPlatform": uno de [${BRIEF_VC_PLATFORMS.join(", ")}] o null,
  "audio": { "speakerStyle": uno de [${SPEAKER_STYLES.join(", ")}], "use": uno de [${AUDIO_USES.join(", ")}], "zones": número, "speakers": número o null, "streaming": boolean } o null,
  "video": { "displays": número, "sizeIn": pulgadas o null } o null,
  "brands": { grupo: [slugs] } con grupos [${BRAND_GROUPS.join(", ")}] y SOLO slugs de MARCAS,
  "tier": uno de [${BRIEF_TIERS.join(", ")}],
  "assumptions": [frases cortas en español con lo que tuviste que suponer porque la frase no lo decía]
}
Reglas:
- Usá solo lo que dice la frase; lo que no dice va null (medidas) o lo típico del ambiente, y lo anotás en "assumptions".
- "6x4" o "6 por 4" = 6 m de ancho y 4 m de fondo. "Para 10 personas" sin medidas: elegí medidas razonables y anotalo.
- Teams / Zoom → systems incluye "vc" y vcPlatform. Crestron Home → control "crestron-home"; Crestron (sala de reuniones, comercial) → "crestron-pro".
- Marcas: solo si la frase las nombra, mapeadas a su slug.

TIPOLOGÍAS (clave | nombre | categoría | medidas típicas):
${templates}

MARCAS (slug | nombre):
${brands}`;
}

export async function interpretRoomText(text: string): Promise<TextRoomPlan> {
  const client = await getOpenAiClient();
  if (!client) throw new Error("OpenAI no está configurado");
  const templates = listRoomTemplates();
  const brands = await prisma.brand.findMany({ where: { isActive: true, products: { some: { isActive: true } } }, select: { slug: true, name: true }, orderBy: { name: "asc" } });
  const model = (await getSetting("ai.io.model", "")) || "gpt-4.1";
  const res = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: prompt(templates.map((t) => `${t.key} | ${t.name} | ${t.category} | ${t.widthM}×${t.depthM}×${t.heightM} m`).join("\n"), brands.map((b) => `${b.slug} | ${b.name}`).join("\n")) },
      { role: "user", content: text },
    ],
  });
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(res.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
  } catch {
    raw = {};
  }

  const template = getRoomTemplate(String(raw.templateKey ?? ""));
  if (!template) throw new Error("No pude identificar el tipo de ambiente: describí qué es (sala de reuniones, living, restaurante…).");
  const num = (v: unknown, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 100) / 100 : null;
  };
  const assumptions = (Array.isArray(raw.assumptions) ? raw.assumptions : []).filter((a): a is string => typeof a === "string").map((a) => a.slice(0, 160)).slice(0, 6);
  const widthM = num(raw.widthM, MIN_SIDE_M, MAX_SIDE_M);
  const depthM = num(raw.depthM, MIN_SIDE_M, MAX_SIDE_M);
  const heightM = num(raw.heightM, MIN_HEIGHT_M, MAX_HEIGHT_M);
  if (!widthM || !depthM) assumptions.push(`Medidas típicas de ${template.name.toLowerCase()} (${template.widthM} × ${template.depthM} m).`);

  // Marcas: solo slugs que existen.
  const slugs = new Set(brands.map((b) => b.slug));
  const rawBrands = (raw.brands && typeof raw.brands === "object" ? raw.brands : {}) as Record<string, unknown>;
  const brandPrefs = Object.fromEntries(
    BRAND_GROUPS.map((g) => [g, (Array.isArray(rawBrands[g]) ? rawBrands[g] : []).filter((s): s is string => typeof s === "string" && slugs.has(s))]).filter(([, v]) => (v as string[]).length),
  );

  const base = initialBrief(template.category, template.key);
  const merged = {
    ...base,
    systems: Array.isArray(raw.systems) && raw.systems.length ? raw.systems : base.systems,
    control: raw.control ?? base.control,
    vcPlatform: raw.vcPlatform ?? base.vcPlatform,
    audio: raw.audio && typeof raw.audio === "object" ? { ...(base.audio ?? {}), ...(raw.audio as object) } : base.audio,
    video: raw.video && typeof raw.video === "object" ? { ...(base.video ?? {}), ...(raw.video as object) } : base.video,
    brands: { ...base.brands, ...brandPrefs },
    tier: raw.tier ?? base.tier,
    notes: text.slice(0, 1000),
  };
  const brief = normalizeBrief(merged) ?? base;

  return {
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 120) : template.name,
    templateKey: template.key,
    templateName: template.name,
    category: template.category,
    widthM: widthM ?? template.widthM,
    depthM: depthM ?? template.depthM,
    heightM: heightM ?? template.heightM,
    unitCount: Math.min(MAX_UNITS, Math.max(1, Math.round(Number(raw.unitCount) || 1))),
    brief,
    assumptions,
  };
}
