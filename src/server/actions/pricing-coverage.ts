"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { getExchangeRate } from "@/lib/exchange-rate";
import {
  findCandidateRules,
  getPriceRoundingConfig,
  preparePricingInputs,
  priceProductsWithRules,
  type AppliedRule,
  type PriceBreakdown,
  type ProductPricingInput,
} from "@/lib/pricing";
import { attachRuleExemptions, toFiniteNumber, toPricingRuleRow } from "@/lib/pricing-scope";
import type { PricingRuleRow } from "@/components/admin/pricing-rules-table";
import { expandCategoryIds } from "@/lib/category-tree";
import { proposePriceReview } from "@/server/price-review/reviews";
import { cachedCoverage } from "@/server/pricing/coverage-cache";

function reviewMessage(affected: number) {
  return affected === 0
    ? "No se aplicó todavía: no mueve ningún precio. Aplicalo con un clic en Precios › Revisión de cambios."
    : `No se aplicó todavía: mueve el precio de ${affected} producto${affected === 1 ? "" : "s"}. Quedó en Precios › Revisión de cambios para verificarlo.`;
}

const SCOPE_BY_KIND = { margin: "margins.manage", discount: "discounts.manage" } as const;

export type CoverageSource = "RULE" | "PRODUCT_FIELD" | "COEF_VTA" | "DEFAULT" | "NONE";
export type ProductCoverageRow = {
  id: string; name: string; sku: string; brandId: string | null; brandName: string | null;
  categoryId: string | null; categoryName: string | null; familyId: string | null; familyName: string | null;
  distributorId: string | null; distributorName: string | null; imageUrl: string | null; baseCostUsd: number;
  appliedRule: AppliedRule | null; appliedRuleRow: PricingRuleRow | null; candidateRules: PricingRuleRow[];
  source: CoverageSource; priceUsdFinal: number; markupMultiplier: number; discountPercent: number;
  scopeCounts: { brand: number; category: number; family: number; distributor: number; catalog: number };
};
export type ProductCoverageResult = { ok: true; total: number; withRule: number; withoutRule: number; items: ProductCoverageRow[] } | { ok: false; error: string };

const pricingSelect = {
  id: true, baseCostUsd: true, brandId: true, distributorId: true, categoryId: true, familyId: true,
  familia: true, discountPercent: true, tariffDutyPercent: true, coefNac: true, coefVta: true,
  coefVtaFob: true, ivaPercent: true, impIntPercent: true,
} satisfies Prisma.ProductSelect;

type PricingProduct = Prisma.ProductGetPayload<{ select: typeof pricingSelect }>;
function pricingInput(p: PricingProduct): ProductPricingInput {
  return {
    productId: p.id, baseCostUsd: Number(p.baseCostUsd), brandId: p.brandId, distributorId: p.distributorId,
    categoryId: p.categoryId, familyId: p.familyId, familia: p.familia,
    productDiscountPercent: p.discountPercent == null ? null : Number(p.discountPercent),
    tariffDutyPercent: p.tariffDutyPercent == null ? null : Number(p.tariffDutyPercent),
    coefNac: p.coefNac == null ? null : Number(p.coefNac), coefVta: p.coefVta == null ? null : Number(p.coefVta),
    coefVtaFob: p.coefVtaFob == null ? null : Number(p.coefVtaFob), ivaPercent: p.ivaPercent == null ? null : Number(p.ivaPercent),
    impIntPercent: p.impIntPercent == null ? null : Number(p.impIntPercent),
  };
}

function productWhere(input: { q?: string; brandIds?: string[]; categoryIds?: string[]; familyIds?: string[]; distributorIds?: string[] }): Prisma.ProductWhereInput {
  const tokens = (input.q || "").split(/\s+/).map((x) => x.trim()).filter(Boolean);
  return {
    isActive: true,
    ...(input.brandIds?.length ? { brandId: { in: input.brandIds } } : {}),
    ...(input.categoryIds?.length ? { categoryId: { in: input.categoryIds } } : {}),
    ...(input.familyIds?.length ? { familyId: { in: input.familyIds } } : {}),
    ...(input.distributorIds?.length ? { distributorId: { in: input.distributorIds } } : {}),
    ...(tokens.length ? { AND: tokens.map((t) => { const c = { contains: t, mode: "insensitive" as const }; return { OR: [
      { normalizedName: c }, { originalName: c }, { internalSku: c }, { supplierSku: c }, { shortDescription: c }, { longDescription: c }, { tariffPosition: c }, { coo: c }, { modelNumber: c }, { manufacturerItem: c }, { productLine: c },
      { brand: { name: c } }, { category: { name: c } }, { family: { name: c } }, { distributor: { name: c } },
    ] }; }) } : {}),
  };
}

/** Reglas activas que pueden alcanzar a la vista (globales + las del cliente elegido). */
async function loadActiveRules(clientId: string | null) {
  const where = { isActive: true, OR: [{ clientId }, { clientId: null }] };
  const orderBy = [{ priority: "asc" as const }, { createdAt: "desc" as const }];
  const [marginRules, discountRules] = await Promise.all([
    prisma.marginRule.findMany({ where, orderBy }),
    prisma.discountRule.findMany({ where, orderBy }),
  ]);
  return { marginRules, discountRules };
}

type RawCoverageRule = {
  id: string; name: string; scopeType: string; scopeId: string | null; clientId: string | null; groupId: string | null;
  isActive: boolean; isExemption: boolean; createdAt: Date; updatedAt: Date;
  marginPercent?: Prisma.Decimal; markupMultiplier?: Prisma.Decimal | null; discountPercent?: Prisma.Decimal;
};

/** Filas para mostrar (con nombre del recurso y del cliente) de las reglas de una clase. */
async function ruleRowsFor(kind: "margin" | "discount", rules: RawCoverageRule[]): Promise<PricingRuleRow[]> {
  const ids = [...new Set(rules.map((r) => r.scopeId).filter((x): x is string => Boolean(x)))];
  const clientIds = [...new Set(rules.map((r) => r.clientId).filter((x): x is string => Boolean(x)))];
  const [clients, brands, categories, families, distributors, products] = await Promise.all([
    prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, companyName: true } }),
    prisma.brand.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.productFamily.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.distributor.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, normalizedName: true } }),
  ]);
  const names = new Map<string, string>([...brands, ...categories, ...families, ...distributors].map((x) => [x.id, x.name]));
  for (const p of products) names.set(p.id, p.normalizedName);
  const clientNames = new Map(clients.map((x) => [x.id, x.companyName]));
  return attachRuleExemptions(rules.map((r) => toPricingRuleRow({
    id: r.id, name: r.name, scopeType: r.scopeType, scopeId: r.scopeId, clientId: r.clientId,
    isActive: r.isActive, createdAt: r.createdAt, updatedAt: r.updatedAt,
    percent: kind === "margin" ? toFiniteNumber(r.marginPercent) : toFiniteNumber(r.discountPercent),
    markupMultiplier: r.markupMultiplier != null ? Number(r.markupMultiplier) : null,
    groupId: r.groupId, isExemption: r.isExemption, clientName: r.clientId ? clientNames.get(r.clientId) : null,
    resourceName: r.scopeId ? names.get(r.scopeId) : null,
  })));
}

/** Cuántos productos activos hay por marca/rubro/familia/proveedor (para «Toda la marca (N)» del modal). */
async function scopeCountMaps() {
  const active = { isActive: true };
  const [brand, category, family, distributor, catalog] = await Promise.all([
    prisma.product.groupBy({ by: ["brandId"], where: active, _count: { _all: true } }),
    prisma.product.groupBy({ by: ["categoryId"], where: active, _count: { _all: true } }),
    prisma.product.groupBy({ by: ["familyId"], where: active, _count: { _all: true } }),
    prisma.product.groupBy({ by: ["distributorId"], where: active, _count: { _all: true } }),
    prisma.product.count({ where: active }),
  ]);
  return {
    brand: new Map(brand.map((x) => [x.brandId || "", x._count._all])),
    category: new Map(category.map((x) => [x.categoryId || "", x._count._all])),
    family: new Map(family.map((x) => [x.familyId || "", x._count._all])),
    distributor: new Map(distributor.map((x) => [x.distributorId || "", x._count._all])),
    catalog,
  };
}

/** Lo que se muestra de cada producto viene en la misma lectura que el cálculo (sin otra consulta por página). */
const listSelect = { ...pricingSelect, normalizedName: true, internalSku: true } satisfies Prisma.ProductSelect;

/** Nombres de marcas, rubros, familias y proveedores para las filas. */
async function scopeNameMaps() {
  const select = { id: true, name: true };
  const [brands, categories, families, distributors] = await Promise.all([
    prisma.brand.findMany({ select }),
    prisma.category.findMany({ select }),
    prisma.productFamily.findMany({ select }),
    prisma.distributor.findMany({ select }),
  ]);
  const toMap = (rows: Array<{ id: string; name: string }>) => new Map(rows.map((r) => [r.id, r.name]));
  return { brand: toMap(brands), category: toMap(categories), family: toMap(families), distributor: toMap(distributors) };
}

/**
 * Precio de TODO el catálogo activo para un cliente (o la lista general), con
 * las reglas leídas una vez, y todo lo que no depende de filtros ni página. Los
 * filtros se aplican sobre esto en memoria: cambiar de marca, rubro, «con/sin
 * regla» o de página no vuelve a calcular precios. Las filas de reglas para
 * mostrar se arman una vez por clase.
 */
async function computeCoverageBase(clientId: string | null) {
  const [all, rules, markupRaw, tc, rounding, counts, names] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, orderBy: { normalizedName: "asc" }, select: listSelect }),
    loadActiveRules(clientId),
    getSetting("pricing.default_markup", "1.35"),
    getExchangeRate(),
    getPriceRoundingConfig(),
    scopeCountMaps(),
    scopeNameMaps(),
  ]);
  const parsedMarkup = Number(markupRaw);
  const prepared = await preparePricingInputs(all.map(pricingInput), { familiaLoaded: true });
  const breakdowns: Map<string, PriceBreakdown> = await priceProductsWithRules(prepared, clientId, {
    marginRules: rules.marginRules,
    discountRules: rules.discountRules,
    defaultMarkupMultiplier: Number.isFinite(parsedMarkup) && parsedMarkup > 0 ? parsedMarkup : 1.35,
    tc,
    rounding,
  });
  const ruleRowCache: Partial<Record<"margin" | "discount", Promise<PricingRuleRow[]>>> = {};
  const ruleRows = (kind: "margin" | "discount") =>
    (ruleRowCache[kind] ??= ruleRowsFor(kind, (kind === "margin" ? rules.marginRules : rules.discountRules) as unknown as RawCoverageRule[]));
  return { all, rules, counts, names, breakdowns, ruleRows, preparedById: new Map(prepared.map((x) => [x.productId, x])) };
}

/** Foto principal de cada producto de la página (una sola consulta). */
async function primaryImages(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const images = await prisma.productImage.findMany({
    where: { productId: { in: ids } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { productId: true, url: true },
  });
  const first = new Map<string, string>();
  for (const image of images) if (!first.has(image.productId)) first.set(image.productId, image.url);
  return first;
}

/**
 * Cobertura por producto: qué regla le toca a cada uno. Para contar «con regla /
 * sin regla» hay que calcular todo lo filtrado; se hace en UNA pasada con las
 * reglas, el dólar y el redondeo leídos una sola vez (antes eran lotes de 500
 * que volvían a pedirlos), y pasar de página reutiliza ese cálculo.
 */
export async function listProductRuleCoverage(input: {
  kind: "margin" | "discount"; q?: string; brandIds?: string[]; categoryIds?: string[]; familyIds?: string[];
  distributorIds?: string[]; coverage?: "all" | "with_rule" | "without_rule"; clientId?: string | null; page?: number; pageSize?: number;
}): Promise<ProductCoverageResult> {
  try {
    const kind = input.kind === "discount" ? "discount" : "margin";
    await requireStaff(SCOPE_BY_KIND[kind], { costs: true });
    const clientId = input.clientId || null;
    const page = Math.max(1, input.page || 1);
    const pageSize = [25, 50, 100].includes(input.pageSize || 0) ? input.pageSize! : 25;
    const hasText = Boolean((input.q || "").trim());

    // Un rubro incluye sus subrubros (como las reglas de precio). La búsqueda de texto
    // (muchos campos) la resuelve la base; el resto de los filtros, la memoria.
    const [categoryIds, textMatches, base] = await Promise.all([
      input.categoryIds?.length ? expandCategoryIds(input.categoryIds) : Promise.resolve([] as string[]),
      hasText
        ? prisma.product.findMany({ where: productWhere({ q: input.q }), select: { id: true } }).then((rows) => new Set(rows.map((r) => r.id)))
        : Promise.resolve(null),
      cachedCoverage(JSON.stringify({ clientId }), () => computeCoverageBase(clientId)),
    ]);
    const { rules, counts, names, breakdowns, preparedById } = base;
    const inList = (ids: string[] | undefined, id: string | null) => !ids?.length || (id !== null && ids.includes(id));
    const categorySet = new Set(categoryIds);
    const all = base.all.filter(
      (p) =>
        inList(input.brandIds, p.brandId) &&
        (!categorySet.size || (p.categoryId !== null && categorySet.has(p.categoryId))) &&
        inList(input.familyIds, p.familyId) &&
        inList(input.distributorIds, p.distributorId) &&
        (!textMatches || textMatches.has(p.id))
    );

    const hasRule = (p: PricingProduct) => {
      const b = breakdowns.get(p.id);
      return kind === "margin" ? b?.markupSource === "RULE" : Boolean(b?.appliedDiscountRule || b?.discountSource === "PRODUCT");
    };
    const withRule = all.filter(hasRule).length;
    const coverage = input.coverage || "all";
    const filtered = coverage === "all" ? all : all.filter((p) => (coverage === "with_rule" ? hasRule(p) : !hasRule(p)));
    const selected = filtered.slice((page - 1) * pageSize, page * pageSize);

    const [images, ruleRows] = await Promise.all([primaryImages(selected.map((p) => p.id)), base.ruleRows(kind)]);
    const rowMap = new Map(ruleRows.map((r) => [r.id, r]));
    const matchable = (kind === "margin" ? rules.marginRules : rules.discountRules) as Parameters<typeof findCandidateRules>[0];

    const items = selected.flatMap((p): ProductCoverageRow[] => {
      const b = breakdowns.get(p.id);
      if (!b) return [];
      const candidates = findCandidateRules(matchable, preparedById.get(p.id) ?? pricingInput(p), clientId)
        .map((r) => rowMap.get(r.id))
        .filter((r): r is PricingRuleRow => Boolean(r));
      const applied = kind === "margin" ? b.appliedMarginRule : b.appliedDiscountRule;
      const source: CoverageSource =
        kind === "margin" ? b.markupSource : b.discountSource === "RULE" ? "RULE" : b.discountSource === "PRODUCT" ? "PRODUCT_FIELD" : "NONE";
      return [{
        id: p.id, name: p.normalizedName, sku: p.internalSku || "",
        brandId: p.brandId, brandName: (p.brandId && names.brand.get(p.brandId)) || null,
        categoryId: p.categoryId, categoryName: (p.categoryId && names.category.get(p.categoryId)) || null,
        familyId: p.familyId, familyName: (p.familyId && names.family.get(p.familyId)) || p.familia || null,
        distributorId: p.distributorId, distributorName: (p.distributorId && names.distributor.get(p.distributorId)) || null,
        imageUrl: images.get(p.id) || null, baseCostUsd: Number(p.baseCostUsd),
        appliedRule: applied, appliedRuleRow: applied ? rowMap.get(applied.id) || null : null, candidateRules: candidates, source,
        priceUsdFinal: b.priceUsdFinal, markupMultiplier: b.markupMultiplier, discountPercent: b.discountPercent,
        scopeCounts: {
          brand: counts.brand.get(p.brandId || "") || 0,
          category: counts.category.get(p.categoryId || "") || 0,
          family: counts.family.get(p.familyId || "") || 0,
          distributor: counts.distributor.get(p.distributorId || "") || 0,
          catalog: counts.catalog,
        },
      }];
    });
    return { ok: true, total: filtered.length, withRule, withoutRule: all.length - withRule, items };
  } catch (error) {
    console.error("listProductRuleCoverage", error);
    return { ok: false, error: "No se pudo cargar la cobertura. Probá de nuevo." };
  }
}

function revalidateRuleViews(kind: "margin" | "discount") {
  revalidatePath("/admin/price-reviews");
  revalidatePath(kind === "margin" ? "/admin/margins" : "/admin/discounts");
}

/** Activar/desactivar una regla también pasa por Revisión de cambios (no se aplica directo). */
export async function setPricingRuleActive(input: { kind: "margin" | "discount"; id: string; active: boolean }) {
  const { user } = await requireStaff(SCOPE_BY_KIND[input.kind], { costs: true });
  const rule = input.kind === "margin"
    ? await prisma.marginRule.findUnique({ where: { id: input.id }, select: { name: true } })
    : await prisma.discountRule.findUnique({ where: { id: input.id }, select: { name: true } });
  if (!rule) return { ok: false as const, error: "La regla no existe." };
  const review = await proposePriceReview({ type: "rules.update", kind: input.kind, ids: [input.id], data: { isActive: input.active } },
    `${input.active ? "Activar" : "Desactivar"} regla: ${rule.name}`, { id: user.id, name: user.name ?? user.email ?? null });
  revalidateRuleViews(input.kind);
  return { ok: false as const, error: reviewMessage(review.affectedProducts), reviewId: review.id };
}

export async function removePricingRule(input: { kind: "margin" | "discount"; id: string }) {
  const { user } = await requireStaff(SCOPE_BY_KIND[input.kind], { costs: true });
  const rule = input.kind === "margin"
    ? await prisma.marginRule.findUnique({ where: { id: input.id }, select: { name: true } })
    : await prisma.discountRule.findUnique({ where: { id: input.id }, select: { name: true } });
  if (!rule) return { ok: false as const, error: "La regla no existe." };
  const review = await proposePriceReview({ type: "rules.delete", kind: input.kind, ids: [input.id] },
    `Borrar regla: ${rule.name}`, { id: user.id, name: user.name ?? user.email ?? null });
  revalidateRuleViews(input.kind);
  return { ok: false as const, error: reviewMessage(review.affectedProducts), reviewId: review.id };
}
