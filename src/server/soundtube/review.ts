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
  classificationConflicts: ClassificationConflict[];
  /** Clave = skuKey del SKU de la lista. */
  pairs: Record<string, PairDecision>;
  creates: Record<string, { create: boolean; brand?: string }>;
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
    if (candidates.length > 0) pairs.push({ key, row, candidates, decision });
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
    const option = conflict?.options.find((o) => o.excelRow === chosenRow);
    return option
      ? { ...row, categoria: option.categoria, segmento: option.segmento, familia: option.familia, tipo: option.tipo }
      : row;
  });
}
