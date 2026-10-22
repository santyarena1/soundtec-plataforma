"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { calculatePricesForProducts } from "@/lib/pricing";
import { autoPriority, markupToMarginPercent } from "@/lib/pricing-scope";
import { getGlobalMarginPercent } from "@/lib/settings";

/**
 * Editor de precios desde el catálogo (admins con márgenes y costos): ver por
 * qué regla sale el precio de cada producto y cambiarlo sin ir a Márgenes.
 */

const SOUNDTUBE_GROUP = "soundtube-excel-mup";
const MAX_PRODUCTS = 300;
const MAX_MARKUP = 20;

const SCOPE_LABEL: Record<string, string> = {
  PRODUCT: "Producto",
  BRAND: "Marca",
  CATEGORY: "Categoría",
  FAMILY: "Familia",
  DISTRIBUTOR: "Proveedor",
  GLOBAL: "Todo el catálogo",
  CLIENT: "Cliente",
};

export type EditorRule = {
  id: string;
  name: string;
  scope: string;
  scopeName: string | null;
  markup: number;
  groupId: string | null;
  /** Productos del catálogo a los que hoy les aplica (entre los elegidos). */
  selectedCount: number;
  /** Regla de la lista SoundTube: se reemplaza con la próxima lista. */
  fromSoundTubeList: boolean;
};

export type EditorProduct = {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  costUsd: number;
  costoNacUsd: number;
  markup: number;
  /** De dónde sale el markup. */
  source: "RULE" | "COEF_VTA" | "DEFAULT";
  ruleId: string | null;
  /** Tiene un markup propio (regla de producto). */
  ownRule: boolean;
  discountPercent: number;
  finalPriceUsd: number;
};

export type EditorData = { ok: true; products: EditorProduct[]; rules: EditorRule[]; defaultMarkup: number } | { ok: false; error: string };

type Result = { ok: true; changed: number } | { ok: false; error: string };

const idsSchema = z.array(z.string().min(1).max(64)).min(1, "Elegí al menos un producto.").max(MAX_PRODUCTS, `Máximo ${MAX_PRODUCTS} productos por vez.`);
const markupSchema = z.number().gt(1, "El markup tiene que ser mayor a 1 (si no, vendés al costo o por debajo).").max(MAX_MARKUP, `Máximo ×${MAX_MARKUP}.`);

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function refresh() {
  revalidatePath("/portal/products");
  revalidatePath("/admin/products");
  revalidatePath("/admin/margins");
}

async function guard() {
  return requireStaff("margins.manage", { costs: true });
}

export async function loadPriceEditor(productIds: string[]): Promise<EditorData> {
  await guard();
  const ids = idsSchema.safeParse([...new Set(productIds)]);
  if (!ids.success) return { ok: false, error: ids.error.issues[0]?.message ?? "Selección inválida." };
  const [rows, globalMargin] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: ids.data } },
      select: {
        id: true,
        normalizedName: true,
        supplierSku: true,
        modelNumber: true,
        baseCostUsd: true,
        brandId: true,
        distributorId: true,
        categoryId: true,
        familyId: true,
        familia: true,
        discountPercent: true,
        tariffDutyPercent: true,
        coefNac: true,
        coefVta: true,
        coefVtaFob: true,
        ivaPercent: true,
        impIntPercent: true,
        brand: { select: { name: true } },
      },
    }),
    getGlobalMarginPercent(),
  ]);
  const prices = await calculatePricesForProducts(
    rows.map((p) => ({
      productId: p.id,
      baseCostUsd: num(p.baseCostUsd) ?? 0,
      brandId: p.brandId,
      distributorId: p.distributorId,
      categoryId: p.categoryId,
      familyId: p.familyId,
      familia: p.familia ?? null,
      productDiscountPercent: num(p.discountPercent),
      tariffDutyPercent: num(p.tariffDutyPercent),
      coefNac: num(p.coefNac),
      coefVta: num(p.coefVta),
      coefVtaFob: num(p.coefVtaFob),
      ivaPercent: num(p.ivaPercent),
      impIntPercent: num(p.impIntPercent),
    })),
    null,
    globalMargin
  );
  const ownRules = new Set(
    (
      await prisma.marginRule.findMany({
        where: { scopeType: "PRODUCT", clientId: null, isExemption: false, productId: { in: ids.data } },
        select: { productId: true },
      })
    ).flatMap((r) => (r.productId ? [r.productId] : []))
  );
  const products: EditorProduct[] = rows.map((p) => {
    const b = prices.get(p.id);
    return {
      id: p.id,
      name: p.normalizedName,
      sku: p.modelNumber ?? p.supplierSku,
      brand: p.brand?.name ?? null,
      costUsd: num(p.baseCostUsd) ?? 0,
      costoNacUsd: b?.costoNacUsd ?? 0,
      markup: b?.markupMultiplier ?? 0,
      source: (b?.markupSource ?? "DEFAULT") as EditorProduct["source"],
      ruleId: b?.appliedMarginRule?.id ?? null,
      ownRule: ownRules.has(p.id),
      discountPercent: b?.discountPercent ?? 0,
      finalPriceUsd: b?.finalPriceUsd ?? 0,
    };
  });

  const ruleIds = [...new Set(products.flatMap((p) => (p.ruleId ? [p.ruleId] : [])))];
  const ruleRows = ruleIds.length ? await prisma.marginRule.findMany({ where: { id: { in: ruleIds } } }) : [];
  const scopeNames = new Map<string, string>();
  const byType = (t: string) => ruleRows.filter((r) => r.scopeType === t && r.scopeId).map((r) => r.scopeId!);
  const [brands, categories, families, distributors] = await Promise.all([
    prisma.brand.findMany({ where: { id: { in: byType("BRAND") } }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { id: { in: byType("CATEGORY") } }, select: { id: true, name: true } }),
    prisma.productFamily.findMany({ where: { id: { in: byType("FAMILY") } }, select: { id: true, name: true } }),
    prisma.distributor.findMany({ where: { id: { in: byType("DISTRIBUTOR") } }, select: { id: true, name: true } }),
  ]);
  for (const x of [...brands, ...categories, ...families, ...distributors]) scopeNames.set(x.id, x.name);
  const rules: EditorRule[] = ruleRows.map((r) => ({
    id: r.id,
    name: r.name,
    scope: SCOPE_LABEL[r.scopeType] ?? r.scopeType,
    scopeName: r.scopeId ? scopeNames.get(r.scopeId) ?? null : null,
    markup: num(r.markupMultiplier) ?? 1 + (num(r.marginPercent) ?? 0) / 100,
    groupId: r.groupId,
    selectedCount: products.filter((p) => p.ruleId === r.id).length,
    fromSoundTubeList: r.groupId === SOUNDTUBE_GROUP,
  }));
  const defaultMarkup = 1 + globalMargin / 100;
  return { ok: true, products, rules, defaultMarkup };
}

/** Markup propio (regla de producto) para cada producto elegido. Actualiza la que ya tenga. */
export async function setProductsMarkup(productIds: string[], markup: number): Promise<Result> {
  await guard();
  const ids = idsSchema.safeParse([...new Set(productIds)]);
  if (!ids.success) return { ok: false, error: ids.error.issues[0]?.message ?? "Selección inválida." };
  const m = markupSchema.safeParse(markup);
  if (!m.success) return { ok: false, error: m.error.issues[0]?.message ?? "Markup inválido." };
  const marginPercent = Math.min(999.999, markupToMarginPercent(m.data));
  const [products, existing] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: ids.data } }, select: { id: true, supplierSku: true, normalizedName: true } }),
    prisma.marginRule.findMany({ where: { scopeType: "PRODUCT", clientId: null, isExemption: false, productId: { in: ids.data } }, select: { id: true, productId: true } }),
  ]);
  const ruleByProduct = new Map(existing.map((r) => [r.productId!, r.id]));
  const groupId = `catalogo-${Date.now().toString(36)}`;
  await prisma.$transaction(
    products.map((p) => {
      const rule = ruleByProduct.get(p.id);
      const name = `${p.supplierSku ?? p.normalizedName} · markup ×${m.data}`;
      return rule
        ? prisma.marginRule.update({ where: { id: rule }, data: { markupMultiplier: m.data, marginPercent, name, isActive: true } })
        : prisma.marginRule.create({
            data: {
              name,
              priority: autoPriority("PRODUCT", false),
              scopeType: "PRODUCT",
              scopeId: p.id,
              productId: p.id,
              markupMultiplier: m.data,
              marginPercent,
              groupId,
              notes: "Cargada desde el catálogo (editor de precios).",
            },
          });
    })
  );
  refresh();
  return { ok: true, changed: products.length };
}

/** Precio de venta final buscado para un producto: calcula el markup que lo da. */
export async function setProductTargetPrice(productId: string, finalPriceUsd: number): Promise<Result> {
  await guard();
  const target = z.number().positive("Poné el precio final.").max(10_000_000).safeParse(finalPriceUsd);
  if (!target.success) return { ok: false, error: target.error.issues[0]?.message ?? "Precio inválido." };
  const data = await loadPriceEditor([productId]);
  if (!data.ok) return data;
  const p = data.products[0];
  if (!p || p.costoNacUsd <= 0) return { ok: false, error: "El producto no tiene costo: cargalo antes de fijar un precio." };
  const markup = Math.round((target.data / (p.costoNacUsd * (1 - p.discountPercent / 100))) * 10000) / 10000;
  return setProductsMarkup([productId], markup);
}

/** Cambia el markup de una regla (y de las subreglas de su grupo, si es una regla agrupada). */
export async function updateRuleMarkup(ruleId: string, markup: number): Promise<Result> {
  await guard();
  const m = markupSchema.safeParse(markup);
  if (!m.success) return { ok: false, error: m.error.issues[0]?.message ?? "Markup inválido." };
  const rule = await prisma.marginRule.findUnique({ where: { id: ruleId }, select: { id: true, groupId: true } });
  if (!rule) return { ok: false, error: "La regla no existe." };
  const marginPercent = Math.min(999.999, markupToMarginPercent(m.data));
  // Las reglas de la lista SoundTube son una por producto: se cambia solo esa.
  const where = rule.groupId && rule.groupId !== SOUNDTUBE_GROUP ? { groupId: rule.groupId, isExemption: false } : { id: rule.id };
  const updated = await prisma.marginRule.updateMany({ where, data: { markupMultiplier: m.data, marginPercent } });
  refresh();
  return { ok: true, changed: updated.count };
}

/** Saca el markup propio: los productos vuelven a la regla general (marca, categoría…). */
export async function clearProductsMarkup(productIds: string[]): Promise<Result> {
  await guard();
  const ids = idsSchema.safeParse([...new Set(productIds)]);
  if (!ids.success) return { ok: false, error: ids.error.issues[0]?.message ?? "Selección inválida." };
  // El MUP de la lista SoundTube no se toca: lo maneja la lista.
  const removed = await prisma.marginRule.deleteMany({
    where: { scopeType: "PRODUCT", clientId: null, isExemption: false, productId: { in: ids.data }, NOT: { groupId: SOUNDTUBE_GROUP } },
  });
  refresh();
  return { ok: true, changed: removed.count };
}
