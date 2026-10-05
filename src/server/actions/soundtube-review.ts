"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { buildProductSearchKey } from "@/lib/search-key";
import { parsePriceListFile, skuKey } from "@/services/soundtube/price-list";
import {
  MAX_FILE_BYTES,
  SOUNDTUBE_BRANDS,
  addSkuAliases,
  applySoundTubeRows,
  loadSkuAliases,
} from "@/server/soundtube/price-list-core";
import {
  buildReviewView,
  loadReviewState,
  rowsWithChosenClassification,
  saveReviewState,
  type ReviewState,
} from "@/server/soundtube/review";

type Result = { ok: true } | { ok: false; error: string };

const PATH = "/admin/soundtube-review";

async function mutate(change: (state: ReviewState) => string | void): Promise<Result> {
  await requireAdmin();
  const state = await loadReviewState();
  if (!state?.active) return { ok: false, error: "No hay una revisión abierta." };
  if (state.appliedAt) return { ok: false, error: "La lista ya se aplicó: cerrá la revisión o empezá una nueva." };
  const error = change(state);
  if (error) return { ok: false, error };
  const view = await buildReviewView(state);
  await saveReviewState(state, view.pending);
  revalidatePath(PATH);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Sube la lista (corregida) y empieza una revisión nueva. */
export async function startSoundTubeReview(formData: FormData): Promise<Result> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elegí el Excel de la lista." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "El archivo es demasiado grande (máx. 10 MB)." };
  if (!/\.(xlsx|xls)$/i.test(file.name)) return { ok: false, error: "Tiene que ser un archivo .xlsx o .xls." };
  let parsed;
  try {
    parsed = parsePriceListFile(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo leer el Excel." };
  }
  if (parsed.rows.length === 0) return { ok: false, error: "El Excel no tiene filas con costo y MUP." };

  const state: ReviewState = {
    active: true,
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
    rows: parsed.rows,
    warnings: parsed.warnings,
    invalid: parsed.invalid,
    classificationConflicts: parsed.classificationConflicts,
    pairs: {},
    creates: {},
    classification: {},
    missing: {},
    applyTaxonomy: true,
  };
  const view = await buildReviewView(state);
  await saveReviewState(state, view.pending);
  revalidatePath(PATH);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function decidePair(excelSku: string, value: string | null): Promise<Result> {
  const key = skuKey(excelSku);
  return mutate((state) => {
    if (value === null) {
      delete state.pairs[key];
      return;
    }
    if (value !== "NONE") {
      const takenBy = Object.entries(state.pairs).find(([k, v]) => v === value && k !== key);
      if (takenBy) return `Ese producto ya está elegido para ${takenBy[0]}.`;
      delete state.creates[key];
    }
    state.pairs[key] = value;
  });
}

export async function decideNewProduct(excelSku: string, create: boolean | null, brand?: string): Promise<Result> {
  const key = skuKey(excelSku);
  if (brand && !(SOUNDTUBE_BRANDS as readonly string[]).includes(brand)) return { ok: false, error: "Marca inválida." };
  return mutate((state) => {
    if (create === null) delete state.creates[key];
    else state.creates[key] = { create, brand: create ? brand ?? state.creates[key]?.brand : undefined };
  });
}

export async function decideClassification(excelSku: string, excelRow: number | null): Promise<Result> {
  const key = skuKey(excelSku);
  return mutate((state) => {
    const conflict = state.classificationConflicts.find((c) => skuKey(c.sku) === key);
    if (!conflict) return "Ese SKU no tiene clasificación repetida.";
    if (excelRow === null) delete state.classification[key];
    else if (conflict.options.some((o) => o.excelRow === excelRow)) state.classification[key] = excelRow;
    else return "Opción inválida.";
  });
}

const missingSchema = z.object({ productIds: z.array(z.string().min(1)).min(1).max(2000), action: z.enum(["keep", "deactivate"]) });

export async function decideMissing(productIds: string[], action: "keep" | "deactivate"): Promise<Result> {
  const parsed = missingSchema.safeParse({ productIds, action });
  if (!parsed.success) return { ok: false, error: "Selección inválida." };
  return mutate((state) => {
    for (const id of parsed.data.productIds) {
      if (parsed.data.action === "keep") delete state.missing[id];
      else state.missing[id] = "deactivate";
    }
  });
}

export async function setReviewTaxonomy(applyTaxonomy: boolean): Promise<Result> {
  return mutate((state) => {
    state.applyTaxonomy = applyTaxonomy;
  });
}

/** Aplica todo: crea los nuevos, guarda las equivalencias y aplica precios, clasificación y bajas. */
export async function applySoundTubeReview(): Promise<Result & { summary?: string }> {
  await requireAdmin();
  const state = await loadReviewState();
  if (!state?.active) return { ok: false, error: "No hay una revisión abierta." };
  if (state.appliedAt) return { ok: false, error: "La lista ya se aplicó." };
  const view = await buildReviewView(state);
  if (view.pending > 0) return { ok: false, error: `Faltan ${view.pending} decisiones.` };

  try {
    // 1) Productos nuevos (quedan con el SKU de la lista; el paso 3 les pone costo, MUP y clasificación).
    const toCreate = view.newProducts.filter((q) => q.decision?.create && q.decision.brand);
    const brandRows = await prisma.brand.findMany({
      where: { name: { in: [...SOUNDTUBE_BRANDS], mode: "insensitive" } },
      select: { id: true, name: true },
    });
    const brandId = (name: string) => brandRows.find((b) => b.name.toLowerCase() === name.toLowerCase())?.id;
    const missingBrand = toCreate.find((q) => !brandId(q.decision!.brand!));
    if (missingBrand) return { ok: false, error: `No existe la marca ${missingBrand.decision!.brand} en el sistema.` };
    await prisma.$transaction(
      toCreate.map((q) =>
        prisma.product.create({
          data: {
            normalizedName: q.row.sku,
            originalName: q.row.description || q.row.sku,
            supplierSku: q.row.sku,
            shortDescription: q.row.description || null,
            baseCostUsd: q.row.costUsd,
            currency: "USD",
            brandId: brandId(q.decision!.brand!)!,
            searchKey: buildProductSearchKey({ supplierSku: q.row.sku, normalizedName: q.row.sku, originalName: q.row.description, brandName: q.decision!.brand }),
            sourceMetadata: { soundtubeReview: { createdFrom: state.fileName, at: new Date().toISOString() } },
          },
          select: { id: true },
        })
      )
    );

    // 2) Equivalencias confirmadas (sirven también para las próximas listas).
    const pairs = Object.entries(state.pairs)
      .filter(([, v]) => v !== "NONE")
      .map(([key, productId]) => ({ excelSku: state.rows.find((r) => skuKey(r.sku) === key)?.sku ?? key, productId }));
    await addSkuAliases(pairs);

    // 3) Precios, MUP, clasificación y bajas.
    const result = await applySoundTubeRows({
      rows: rowsWithChosenClassification(state),
      fileName: state.fileName,
      decisions: view.missing.filter((m) => m.action === "deactivate").map((m) => ({ productId: m.product.id, action: "deactivate" as const })),
      applyTaxonomy: state.applyTaxonomy,
      aliases: await loadSkuAliases(),
    });
    if (!result.ok) return result;

    state.appliedAt = new Date().toISOString();
    state.applyResult = { updated: result.updated, created: toCreate.length, deactivated: result.deactivated };
    await saveReviewState(state, 0);
    revalidatePath(PATH);
    revalidatePath("/admin", "layout");
    return {
      ok: true,
      summary: `${result.updated} productos actualizados, ${toCreate.length} creados y ${result.deactivated} desactivados.`,
    };
  } catch (error) {
    console.error("[soundtube-review] apply failed", error);
    return { ok: false, error: "No se pudo aplicar. Revisá y probá de nuevo." };
  }
}

/** Cierra la revisión: el módulo desaparece del menú. */
export async function closeSoundTubeReview(): Promise<Result> {
  await requireAdmin();
  const state = await loadReviewState();
  if (!state) return { ok: true };
  state.active = false;
  await saveReviewState(state, 0);
  revalidatePath(PATH);
  revalidatePath("/admin", "layout");
  return { ok: true };
}
