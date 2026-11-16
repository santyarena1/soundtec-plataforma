/**
 * Marca isCrestronHomeCompatible según la lista OFICIAL (src/data/crestron-home-official.json).
 *
 * Fuente de verdad única: la usan el script scripts/crestron-home-apply.ts y el
 * botón "Marcar productos compatibles" de Admin → Crestron Home. Ningún sync
 * (Xtrabone, crestron-web) escribe este campo.
 *
 * - Productos Crestron que coinciden con la lista → true.
 * - El resto de Crestron → false.
 * - Productos de otras marcas marcados → false (la lista solo considera Crestron).
 */

import { prisma } from "@/lib/prisma";
import officialList from "@/data/crestron-home-official.json";
import { buildCrestronHomeIndex, crestronModelKey, matchCrestronHome, type OfficialModelRef } from "./match";

export interface OfficialCrestronHomeList {
  source: string;
  fetchedAt: string;
  totalModels: number;
  models: (OfficialModelRef & { key: string })[];
}

export const OFFICIAL_CRESTRON_HOME: OfficialCrestronHomeList = officialList as OfficialCrestronHomeList;

export interface CrestronHomeFlagChange {
  id: string;
  internalSku: string | null;
  model: string | null;
  name: string;
  brand: string | null;
  isActive: boolean;
  before: boolean;
  after: boolean;
  /** Modelo oficial con el que coincidió (si after = true). */
  officialModel: string | null;
  officialCategory: string | null;
  matchedBy: "material" | "model" | null;
}

export interface CrestronHomeFlagPlan {
  source: string;
  fetchedAt: string;
  officialModels: number;
  crestronProducts: number;
  /** Productos que quedan marcados (activos e inactivos). */
  willBeTrue: number;
  willBeTrueActive: number;
  /** Cambios a aplicar (solo los que difieren del estado actual). */
  changes: CrestronHomeFlagChange[];
  /** Modelos de la lista oficial sin ningún producto en el catálogo. */
  officialMissing: { model: string; categories: string[] }[];
  /** Productos que quedan marcados (para el informe). */
  matched: CrestronHomeFlagChange[];
}

const isCrestronBrand = (name: string | null | undefined) => (name ?? "").trim().toLowerCase() === "crestron";

/** Calcula los cambios sin escribir nada. */
export async function planCrestronHomeFlags(list: OfficialCrestronHomeList = OFFICIAL_CRESTRON_HOME): Promise<CrestronHomeFlagPlan> {
  const index = buildCrestronHomeIndex(list.models);
  const products = await prisma.product.findMany({
    where: {
      OR: [{ brand: { name: { equals: "crestron", mode: "insensitive" } } }, { isCrestronHomeCompatible: true }],
    },
    select: {
      id: true,
      internalSku: true,
      modelNumber: true,
      manufacturerItem: true,
      normalizedName: true,
      isActive: true,
      isCrestronHomeCompatible: true,
      brand: { select: { name: true } },
    },
    orderBy: { internalSku: "asc" },
  });

  const usedOfficial = new Set<string>();
  const all: CrestronHomeFlagChange[] = products.map((p) => {
    const crestron = isCrestronBrand(p.brand?.name);
    const hit = crestron ? matchCrestronHome(p, index) : null;
    if (hit) usedOfficial.add(crestronModelKey(hit.official.model));
    return {
      id: p.id,
      internalSku: p.internalSku,
      model: p.modelNumber ?? p.manufacturerItem,
      name: p.normalizedName,
      brand: p.brand?.name ?? null,
      isActive: p.isActive,
      before: p.isCrestronHomeCompatible,
      after: Boolean(hit),
      officialModel: hit?.official.model ?? null,
      officialCategory: hit?.official.categories.join(", ") ?? null,
      matchedBy: hit?.by ?? null,
    };
  });

  const matched = all.filter((c) => c.after);
  const missing = new Map<string, { model: string; categories: string[] }>();
  for (const m of list.models) {
    const key = crestronModelKey(m.model);
    if (!usedOfficial.has(key) && !missing.has(key)) missing.set(key, { model: m.model, categories: m.categories });
  }

  return {
    source: list.source,
    fetchedAt: list.fetchedAt,
    officialModels: list.models.length,
    crestronProducts: all.filter((c) => isCrestronBrand(c.brand)).length,
    willBeTrue: matched.length,
    willBeTrueActive: matched.filter((c) => c.isActive).length,
    changes: all.filter((c) => c.before !== c.after),
    officialMissing: [...missing.values()],
    matched,
  };
}

/** Aplica el plan (idempotente: solo toca los que cambian). */
export async function applyCrestronHomeFlags(plan: CrestronHomeFlagPlan): Promise<{ setTrue: number; setFalse: number }> {
  const toTrue = plan.changes.filter((c) => c.after).map((c) => c.id);
  const toFalse = plan.changes.filter((c) => !c.after).map((c) => c.id);
  await prisma.$transaction([
    prisma.product.updateMany({ where: { id: { in: toTrue } }, data: { isCrestronHomeCompatible: true } }),
    prisma.product.updateMany({ where: { id: { in: toFalse } }, data: { isCrestronHomeCompatible: false } }),
  ]);
  return { setTrue: toTrue.length, setFalse: toFalse.length };
}
