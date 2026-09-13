/**
 * Extracción del perfil de un producto: una llamada al modelo por producto,
 * salida JSON validada contra el vocabulario canónico.
 *
 * El modelo no puede inventar valores: todo lo que devuelve se filtra contra
 * las listas de `vocab.ts`, y los datos duros que ya sacamos con regex
 * (grado IP, línea de audio, potencia) pisan lo que diga.
 */

import { getOpenAiClient, getOpenAiModel } from "@/services/openai";
import type { BuiltSource } from "./source";
import {
  APPLICATIONS,
  ECOSYSTEMS,
  MOUNT_TYPES,
  PRODUCT_TYPES,
  isEnvironment,
  isEnvironmentBasis,
  isProductType,
  keepKnown,
  type Application,
  type Ecosystem,
  type Environment,
  type EnvironmentBasis,
  type MountType,
  type ProductType,
} from "./vocab";

export interface ExtractedProfile {
  productType: ProductType;
  environment: Environment;
  environmentBasis: EnvironmentBasis | null;
  environmentEvidence: string | null;
  mountTypes: MountType[];
  ecosystems: Ecosystem[];
  applications: Application[];
  summaryEs: string;
  keywords: string[];
}

export const EXTRACT_SYSTEM_PROMPT = `Clasificás productos de audio, video y control profesional para el catálogo de Soundtec.

Leés la ficha de UN producto y devolvés su clasificación canónica. Trabajás SOLO con lo que dice la ficha:
si un dato no está, va "UNKNOWN" o la lista vacía. Nunca completes con conocimiento general del modelo.

CRITERIO DE AMBIENTE (el más importante)
Son dos preguntas separadas: QUÉ ambiente y CON QUÉ RESPALDO.

"environment":
- "OUTDOOR": sirve a la intemperie. Vale tanto si la ficha lo declara como si tiene grado de protección IP/IPX.
- "INDOOR": va dentro de un edificio. Vale tanto si la ficha lo declara como si se deduce del tipo de equipo:
  un procesador, un panel táctil, un keypad, un switcher, una fuente, un equipo de rack o de embutir en
  cielorraso interior NO se instala a la intemperie aunque ninguna frase lo aclare.
- "BOTH": la ficha dice que sirve para interior y exterior.
- "UNKNOWN": SOLO cuando el producto podría ir en cualquier lado y no hay nada que incline la balanza
  (cables, soportes genéricos, accesorios sueltos). No uses UNKNOWN por no encontrar una frase literal:
  si por el tipo de equipo es evidente, decidí y marcalo como deducción.

"environmentBasis":
- "DECLARED": la ficha lo dice, o declara un grado de protección IP. En "environmentEvidence" copiá
  TEXTUAL la frase de la ficha que lo justifica (máximo 160 caracteres).
- "INFERRED": lo deducís del tipo de equipo. En "environmentEvidence" escribí en español la razón,
  corta y concreta ("procesador de rack: instalación en interior").
Si "environment" es "UNKNOWN", "environmentBasis" y "environmentEvidence" van null.

Cuidado: los textos del fabricante nombran "outdoor" también para ACLARAR QUE NO ES para exterior
("not for outdoor use", "indoor only"). Leé la frase completa antes de decidir.

RESUMEN
"summaryEs": 2 o 3 oraciones en español rioplatense, técnicas y concretas, que le sirvan a un vendedor:
qué es, para qué se usa y qué lo distingue. Sin adjetivos de marketing. Sin inventar especificaciones.

KEYWORDS
"keywords": 8 a 15 términos de búsqueda en español Y en inglés que alguien usaría para encontrarlo
(tipo de producto, montaje, aplicación, sinónimos). En minúsculas, sin repetir.

FORMATO DE SALIDA
Devolvés SOLO un JSON válido:
{
  "productType": uno de [${PRODUCT_TYPES.join(", ")}],
  "environment": "INDOOR" | "OUTDOOR" | "BOTH" | "UNKNOWN",
  "environmentBasis": "DECLARED" | "INFERRED" | null,
  "environmentEvidence": "frase textual de la ficha, o la razón de la deducción" | null,
  "mountTypes": subconjunto de [${MOUNT_TYPES.join(", ")}],
  "ecosystems": subconjunto de [${ECOSYSTEMS.join(", ")}],
  "applications": subconjunto de [${APPLICATIONS.join(", ")}],
  "summaryEs": "texto",
  "keywords": ["..."]
}`;

function cleanKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    const word = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (word.length < 2 || word.length > 40 || out.includes(word)) continue;
    out.push(word);
    if (out.length >= 15) break;
  }
  return out;
}

export function normalizeExtraction(parsed: unknown): ExtractedProfile | null {
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Record<string, unknown>;

  const summary = typeof row.summaryEs === "string" ? row.summaryEs.replace(/\s+/g, " ").trim() : "";
  if (summary.length < 20) return null;

  const evidence =
    typeof row.environmentEvidence === "string" && row.environmentEvidence.trim().length > 3
      ? row.environmentEvidence.replace(/\s+/g, " ").trim().slice(0, 200)
      : null;

  const environment: Environment = isEnvironment(row.environment) ? row.environment : "UNKNOWN";
  // Sin ambiente no hay respaldo que guardar; con ambiente y sin respaldo
  // explícito se asume deducción, que es la lectura conservadora.
  const basis: EnvironmentBasis | null =
    environment === "UNKNOWN" ? null : isEnvironmentBasis(row.environmentBasis) ? row.environmentBasis : "INFERRED";

  return {
    productType: isProductType(row.productType) ? row.productType : "other",
    environment,
    environmentBasis: basis,
    environmentEvidence: environment === "UNKNOWN" ? null : evidence,
    mountTypes: keepKnown(row.mountTypes, MOUNT_TYPES, 5),
    ecosystems: keepKnown(row.ecosystems, ECOSYSTEMS, 8),
    applications: keepKnown(row.applications, APPLICATIONS, 6),
    summaryEs: summary.slice(0, 700),
    keywords: cleanKeywords(row.keywords),
  };
}

export type ExtractOutcome =
  | { ok: true; profile: ExtractedProfile; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; reason: "NOT_CONFIGURED" | "RATE_LIMITED" | "TIMEOUT" | "ERROR"; message?: string };

const TIMEOUT_MS = 45_000;

export async function extractProfile(source: BuiltSource): Promise<ExtractOutcome> {
  const client = await getOpenAiClient();
  if (!client) return { ok: false, reason: "NOT_CONFIGURED" };
  const model = await getOpenAiModel();

  const known: string[] = [];
  if (source.hardFacts.ipRating) known.push(`grado de protección ${source.hardFacts.ipRating}`);
  if (source.hardFacts.audioLine) known.push(`línea de audio ${source.hardFacts.audioLine}`);
  if (source.hardFacts.mountTypes.length > 0) {
    known.push(`montaje detectado: ${source.hardFacts.mountTypes.join(", ")}`);
  }

  const userMessage = [
    known.length > 0 ? `DATOS YA VERIFICADOS POR EL SISTEMA: ${known.join(" · ")}.` : null,
    "FICHA DEL PRODUCTO:",
    source.prompt,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const response = await client.chat.completions.create(
      {
        model,
        temperature: 0,
        max_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACT_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );

    const raw = response.choices[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "ERROR", message: "respuesta no es JSON" };
    }
    const profile = normalizeExtraction(parsed);
    if (!profile) return { ok: false, reason: "ERROR", message: "JSON sin los campos mínimos" };

    return {
      ok: true,
      profile,
      model,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
  } catch (error) {
    const name = (error as { name?: string })?.name;
    const status = (error as { status?: number })?.status;
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, reason: "TIMEOUT" };
    if (status === 429) return { ok: false, reason: "RATE_LIMITED" };
    return {
      ok: false,
      reason: "ERROR",
      message: error instanceof Error ? error.message.slice(0, 200) : "error desconocido",
    };
  }
}

/**
 * Texto de búsqueda: el resumen en español, las keywords y el nombre.
 * Es lo que reemplaza al `contains` sobre el HTML del fabricante.
 */
export function buildSearchText(input: {
  name: string;
  brandName: string | null;
  profile: ExtractedProfile;
  ipRating: string | null;
  audioLine: string | null;
}): string {
  return [
    input.name,
    input.brandName ?? "",
    input.profile.summaryEs,
    input.profile.keywords.join(" "),
    input.profile.mountTypes.join(" "),
    input.profile.applications.join(" "),
    input.profile.ecosystems.join(" "),
    input.ipRating ?? "",
    input.audioLine ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}
