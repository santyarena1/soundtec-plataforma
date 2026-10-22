/**
 * Revisión de la lista SoundTube (módulo temporal del catálogo).
 *
 * Guarda la lista subida y las decisiones del usuario en AdminSetting, y arma
 * la vista de lo que falta resolver:
 * - ¿mismo producto?: SKUs de la lista que no existen pero se parecen a uno del sistema.
 * - productos nuevos: SKUs sin equivalente (o marcados como "es otro producto").
 * - clasificación: SKUs repetidos con clasificación distinta.
 * - quedan afuera: productos del sistema que la lista no trae (dejar o desactivar).
 */

import { getSetting, setSetting } from "@/lib/settings";
import {
  rowRef,
  skuKey,
  type ClassificationConflict,
  type ParsedPriceList,
  type PriceListRow,
} from "@/services/soundtube/price-list";
import {
  buildPriceListPlan,
  suggestCandidates,
  type CatalogProduct,
} from "@/services/soundtube/price-list-plan";
import { SOUNDTUBE_BRANDS, loadSkuAliases, loadSoundTubeProducts } from "./price-list-core";

const STATE_KEY = "soundtube.review";
/** Resumen chico (activo + pendientes) para el menú, sin leer toda la lista. */
const STATUS_KEY = "soundtube.review.status";

export type PairDecision = string | "NONE"; // id del producto o "es otro producto"
export type MissingAction = "keep" | "deactivate";

export interface ReviewState {
  active: boolean;
  fileName: string;
  uploadedAt: string;
  rows: PriceListRow[];
  warnings: ParsedPriceList["warnings"];
  invalid: ParsedPriceList["invalid"];
  /** Hojas del Excel leídas y salteadas. */
  sheets?: ParsedPriceList["sheets"];
  /** Lo que se aplicó de la planilla «Para revisar», si se subió. */
  corrections?: import("@/services/soundtube/corrections").CorrectionsReport;
  classificationConflicts: ClassificationConflict[];
  /** Clave = skuKey del SKU de la lista. */
  pairs: Record<string, PairDecision>;
  creates: Record<string, { create: boolean; brand?: string }>;
  /** Pares confirmados: qué datos se muestran en el catálogo (por defecto, los de la lista). */
  pairKeep?: Record<string, "excel" | "portal">;
  /** SKU → fila de Excel cuya clasificación vale. */
  classification: Record<string, number>;
  /** id de producto → qué hacer (por defecto, dejarlo como está). */
  missing: Record<string, MissingAction>;
  applyTaxonomy: boolean;
  appliedAt?: string;
  applyResult?: { updated: number; created: number; deactivated: number };
}

export interface ReviewStatus {
  active: boolean;
  pending: number;
}

export async function loadReviewState(): Promise<ReviewState | null> {
  try {
    const raw = await getSetting(STATE_KEY, "");
    return raw ? (JSON.parse(raw) as ReviewState) : null;
  } catch {
    return null;
  }
}

export async function loadReviewStatus(): Promise<ReviewStatus> {
  try {
    const raw = JSON.parse(await getSetting(STATUS_KEY, "{}")) as Partial<ReviewStatus>;
    return { active: raw.active === true, pending: Number(raw.pending) || 0 };
  } catch {
    return { active: false, pending: 0 };
  }
}

export async function saveReviewState(state: ReviewState, pending: number): Promise<void> {
  await setSetting(STATE_KEY, JSON.stringify(state), { description: "Revisión en curso de la lista SoundTube." });
  await setSetting(STATUS_KEY, JSON.stringify({ active: state.active, pending }), {
    description: "Estado de la revisión SoundTube (para el menú).",
  });
}

export interface PairQuestion {
  key: string;
  row: PriceListRow;
  candidates: CatalogProduct[];
  decision?: PairDecision;
  /** Si es el mismo: qué versión queda visible. */
  keep: "excel" | "portal";
}

export interface NewProductQuestion {
  key: string;
  row: PriceListRow;
  decision?: { create: boolean; brand?: string };
  /** Vino de "es otro producto" en la sección anterior. */
  fromPair: boolean;
}

export interface ClassificationQuestion {
  key: string;
  conflict: ClassificationConflict;
  decision?: number;
}

export interface MissingItem {
  product: CatalogProduct;
  action: MissingAction;
}

export interface ReviewView {
  state: ReviewState;
  pairs: PairQuestion[];
  newProducts: NewProductQuestion[];
  classification: ClassificationQuestion[];
  missing: MissingItem[];
  matchedCount: number;
  pending: number;
  brands: readonly string[];
}

/** Arma todo lo que se muestra y cuenta lo que falta decidir. */
export async function buildReviewView(state: ReviewState): Promise<ReviewView> {
  const [products, savedAliases] = await Promise.all([loadSoundTubeProducts(), loadSkuAliases()]);
  const plan = buildPriceListPlan(state.rows, products, savedAliases);

  const pairs: PairQuestion[] = [];
  const newProducts: NewProductQuestion[] = [];
  for (const row of plan.notInSystem) {
    const key = skuKey(row.sku);
    const candidates = suggestCandidates(row, plan.missing);
    const decision = state.pairs[key];
    if (candidates.length > 0) pairs.push({ key, row, candidates, decision, keep: state.pairKeep?.[key] ?? "excel" });
    if (candidates.length === 0 || decision === "NONE") {
      newProducts.push({ key, row, decision: state.creates[key], fromPair: candidates.length > 0 });
    }
  }

  const pairedIds = new Set(Object.values(state.pairs).filter((v) => v !== "NONE"));
  const missing = plan.missing
    .filter((p) => !pairedIds.has(p.id))
    .map((product) => ({ product, action: state.missing[product.id] ?? "keep" }));

  const classification = state.classificationConflicts.map((conflict) => {
    const key = skuKey(conflict.sku);
    return { key, conflict, decision: state.classification[key] };
  });

  const pending =
    pairs.filter((q) => !q.decision).length +
    newProducts.filter((q) => !q.decision || (q.decision.create && !q.decision.brand)).length +
    classification.filter((q) => q.decision === undefined).length;

  return {
    state,
    pairs,
    newProducts,
    classification,
    missing,
    matchedCount: plan.matched.length,
    pending,
    brands: SOUNDTUBE_BRANDS,
  };
}

/** Filas con la clasificación elegida en los repetidos. */
export function rowsWithChosenClassification(state: ReviewState): PriceListRow[] {
  return state.rows.map((row) => {
    const key = skuKey(row.sku);
    const chosenRow = state.classification[key];
    const conflict = state.classificationConflicts.find((c) => skuKey(c.sku) === key);
    const option = conflict?.options.find((o) => rowRef(o) === chosenRow);
    return option
      ? { ...row, categoria: option.categoria, segmento: option.segmento, familia: option.familia, tipo: option.tipo }
      : row;
  });
}

// ─── Memoria de decisiones ──────────────────────────────────────────────────
//
// Lo que el usuario ya resolvió no se vuelve a preguntar cuando sube otra
// lista: «no es el mismo producto», «no cargar», qué clasificación vale en
// un SKU repetido, qué queda visible y qué productos desactivar. Las
// equivalencias «es el mismo» ya viven en soundtube.sku_aliases.

const MEMORY_KEY = "soundtube.review.memory";

type Classification = { categoria?: string; segmento?: string; familia?: string; tipo?: string };

export interface ReviewMemory {
  /** skuKey → id del producto o "NONE" (no es ninguno de los parecidos). */
  pairs: Record<string, PairDecision>;
  pairKeep: Record<string, "excel" | "portal">;
  creates: Record<string, { create: boolean; brand?: string }>;
  /** skuKey → clasificación elegida (por valores: las filas cambian entre listas). */
  classification: Record<string, Classification>;
  /** id de producto → desactivar. */
  missing: Record<string, MissingAction>;
}

const emptyMemory = (): ReviewMemory => ({ pairs: {}, pairKeep: {}, creates: {}, classification: {}, missing: {} });

export async function loadReviewMemory(): Promise<ReviewMemory> {
  try {
    return { ...emptyMemory(), ...(JSON.parse(await getSetting(MEMORY_KEY, "{}")) as Partial<ReviewMemory>) };
  } catch {
    return emptyMemory();
  }
}

/** Decisiones de una revisión, en formato que sirve para cualquier lista. */
export function memoryFromState(state: ReviewState): ReviewMemory {
  const classification: Record<string, Classification> = {};
  for (const [key, ref] of Object.entries(state.classification)) {
    const option = state.classificationConflicts.find((c) => skuKey(c.sku) === key)?.options.find((o) => rowRef(o) === ref);
    if (option) classification[key] = { categoria: option.categoria, segmento: option.segmento, familia: option.familia, tipo: option.tipo };
  }
  return {
    pairs: { ...state.pairs },
    pairKeep: { ...(state.pairKeep ?? {}) },
    creates: { ...state.creates },
    classification,
    missing: Object.fromEntries(Object.entries(state.missing).filter(([, a]) => a === "deactivate")),
  };
}

/** Suma decisiones nuevas a la memoria (las nuevas pisan a las viejas del mismo SKU). */
export async function rememberDecisions(state: ReviewState): Promise<void> {
  const current = await loadReviewMemory();
  const next = memoryFromState(state);
  const merged: ReviewMemory = {
    pairs: { ...current.pairs, ...next.pairs },
    pairKeep: { ...current.pairKeep, ...next.pairKeep },
    creates: { ...current.creates, ...next.creates },
    classification: { ...current.classification, ...next.classification },
    missing: { ...current.missing, ...next.missing },
  };
  await setSetting(MEMORY_KEY, JSON.stringify(merged), { description: "Decisiones de las revisiones SoundTube que no se vuelven a preguntar." });
}

const sameClass = (a: Classification, b: Classification) =>
  (a.categoria ?? "") === (b.categoria ?? "") && (a.segmento ?? "") === (b.segmento ?? "") && (a.familia ?? "") === (b.familia ?? "") && (a.tipo ?? "") === (b.tipo ?? "");

/** Aplica la memoria a una revisión nueva: lo ya resuelto llega resuelto. */
export function applyMemory(state: ReviewState, memory: ReviewMemory): ReviewState {
  const keys = new Set(state.rows.map((r) => skuKey(r.sku)));
  const pick = <T>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([k]) => keys.has(k)));
  const classification: Record<string, number> = {};
  for (const conflict of state.classificationConflicts) {
    const key = skuKey(conflict.sku);
    const remembered = memory.classification[key];
    const option = remembered ? conflict.options.find((o) => sameClass(o, remembered)) : undefined;
    if (option) classification[key] = rowRef(option);
  }
  return {
    ...state,
    pairs: { ...pick(memory.pairs), ...state.pairs },
    pairKeep: { ...pick(memory.pairKeep), ...(state.pairKeep ?? {}) },
    creates: { ...pick(memory.creates), ...state.creates },
    classification: { ...classification, ...state.classification },
    missing: { ...memory.missing, ...state.missing },
  };
}
