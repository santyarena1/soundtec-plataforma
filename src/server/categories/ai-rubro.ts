/**
 * Rubro sugerido para un producto existente (IA de la ficha). Primero la tabla
 * de Equivalencias con la ruta del proveedor (sourceCategoryPath); si no hay,
 * la IA elige una RUTA del árbol de Tango activo y se valida exacto. Nunca crea
 * categorías: si no encaja, no se sugiere nada y se dice por qué.
 */
import { prisma } from "@/lib/prisma";
import { EQUIVALENCE_SOURCES } from "@/lib/category-equivalence";
import {
  RUBRO_AI_RULES,
  consistentCategoryId,
  describeProductForRubro,
  matchRubroPath,
  pathsUnder,
  secondLevelPaths,
  type RubroPromptInput,
} from "@/lib/ai-rubro-path";
import { findRubroByEquivalence } from "@/server/categories/equivalences";
import { getOpenAiClient, getOpenAiModel } from "@/services/openai";
import type { Db } from "@/server/pricing/rule-save";

export interface RubroSuggestion {
  categoryId: string;
  /** Ruta de Tango tal cual está en el árbol. */
  name: string;
  confidence: number;
  from: "equivalencia" | "ia";
}

export interface RubroSuggestionResult {
  rubro: RubroSuggestion | null;
  /** Por qué no hay rubro sugerido (o de dónde salió). */
  note: string;
}

/** Rubros activos del árbol de Tango (con ruta). */
export async function loadActiveRubros(db: Db = prisma): Promise<Array<{ id: string; tangoPath: string }>> {
  const rows = await db.category.findMany({ where: { isActive: true, tangoPath: { not: null } }, select: { id: true, tangoPath: true } });
  return rows.flatMap((r) => (r.tangoPath ? [{ id: r.id, tangoPath: r.tangoPath }] : []));
}

/**
 * Rubro por la tabla de Equivalencias con la ruta del proveedor. Se prueba la
 * fuente «ai» y cada fuente conocida; vale solo si todas las que encuentran
 * algo coinciden en el mismo rubro.
 */
export async function rubroFromSourceEquivalence(
  db: Db,
  input: { brandId?: string | null; sourceCategoryPath?: string | null }
): Promise<string | null> {
  if (!input.sourceCategoryPath?.trim()) return null;
  const sources = ["ai", ...EQUIVALENCE_SOURCES.filter((s) => s !== "*" && s !== "ai")];
  const hits = await Promise.all(sources.map((source) => findRubroByEquivalence(db, { source, brandId: input.brandId ?? null, sourcePath: input.sourceCategoryPath })));
  return consistentCategoryId(hits);
}

async function askPath(product: string, options: string[], step: string): Promise<{ path: string | null; confidence: number; rationale?: string } | null> {
  const client = await getOpenAiClient();
  if (!client) return null;
  const resp = await client.chat.completions.create({
    model: await getOpenAiModel(),
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      {
        role: "system",
        content: "Clasificás productos audiovisuales B2B de un integrador argentino en el árbol de rubros de Tango. Respondés solo JSON.",
      },
      {
        role: "user",
        content: `${step}\n\n${RUBRO_AI_RULES}\n\n${product}\n\nRutas posibles (una por línea):\n${options.join("\n")}\n\nRespondé exactamente: {"path": "<ruta copiada de la lista> o null", "confidence": 0..1, "rationale": "<una frase>"}`,
      },
    ],
  });
  const parsed = JSON.parse(resp.choices[0]?.message.content || "{}") as { path?: unknown; confidence?: unknown; rationale?: unknown };
  return {
    path: typeof parsed.path === "string" ? parsed.path : null,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : undefined,
  };
}

/** Sugerencia de rubro para la ficha: equivalencia → IA en dos pasos (rama, después ruta). */
export async function suggestRubroForProduct(
  db: Db,
  input: RubroPromptInput & { brandId?: string | null }
): Promise<RubroSuggestionResult> {
  const rubros = await loadActiveRubros(db);
  if (!rubros.length) return { rubro: null, note: "El árbol de rubros de Tango no está cargado." };
  const byPath = new Map(rubros.map((r) => [r.tangoPath, r.id]));
  const pathOf = new Map(rubros.map((r) => [r.id, r.tangoPath]));

  const fromEquivalence = await rubroFromSourceEquivalence(db, input);
  if (fromEquivalence && pathOf.has(fromEquivalence)) {
    return {
      rubro: { categoryId: fromEquivalence, name: pathOf.get(fromEquivalence)!, confidence: 1, from: "equivalencia" },
      note: `Sale de la tabla de Equivalencias («${input.sourceCategoryPath}»).`,
    };
  }

  const paths = rubros.map((r) => r.tangoPath);
  const product = describeProductForRubro(input);
  try {
    const branches = secondLevelPaths(paths);
    const first = await askPath(product, branches, "Paso 1: elegí la rama (rubro > subrubro) donde va el producto.");
    if (!first) return { rubro: null, note: "La IA no está configurada: el rubro no se cambia." };
    const branch = matchRubroPath(first.path, branches);
    if (!branch) return { rubro: null, note: "La IA no encontró una rama del árbol que encaje: el rubro no se cambia." };

    const options = pathsUnder(branch, paths);
    const second = options.length > 1 ? await askPath(product, options, "Paso 2: elegí la ruta más específica donde va el producto.") : { path: branch, confidence: first.confidence };
    const chosen = matchRubroPath(second?.path, options);
    if (!chosen) return { rubro: null, note: "La respuesta de la IA no coincide exacto con una ruta del árbol: el rubro no se cambia." };
    const categoryId = byPath.get(chosen);
    if (!categoryId) return { rubro: null, note: "La ruta elegida ya no está activa: el rubro no se cambia." };
    return {
      rubro: { categoryId, name: chosen, confidence: Math.min(first.confidence, second?.confidence ?? first.confidence), from: "ia" },
      note: second && "rationale" in second && second.rationale ? second.rationale : first.rationale ?? "",
    };
  } catch (error) {
    console.error("[ai-rubro] sugerencia fallida", error);
    return { rubro: null, note: "No se pudo consultar a la IA: el rubro no se cambia." };
  }
}
