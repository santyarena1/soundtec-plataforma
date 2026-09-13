"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { calculatePricesForProducts, findCandidateRules, type AppliedRule, type ProductPricingInput } from "@/lib/pricing";
import { attachRuleExemptions, toFiniteNumber, toPricingRuleRow } from "@/lib/pricing-scope";
import type { PricingRuleRow } from "@/components/admin/pricing-rules-table";

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

async function ruleRows(kind: "margin" | "discount", clientId: string | null) {
  const where = { isActive: true, OR: [{ clientId }, { clientId: null }] };
  const rules = kind === "margin"
    ? await prisma.marginRule.findMany({ where, orderBy: [{ priority: "asc" }, { createdAt: "desc" }] })
    : await prisma.discountRule.findMany({ where, orderBy: [{ priority: "asc" }, { createdAt: "desc" }] });
  const typedRules = rules as unknown as Array<{
    id: string; name: string; priority: number; scopeType: import("@prisma/client").RuleScopeType;
    scopeId: string | null; clientId: string | null; productId: string | null; groupId: string | null;
    isActive: boolean; isExemption: boolean; createdAt: Date; updatedAt: Date;
    marginPercent?: Prisma.Decimal; markupMultiplier?: Prisma.Decimal | null; discountPercent?: Prisma.Decimal;
  }>;
  const ids = typedRules.map((r) => r.scopeId).filter((x): x is string => Boolean(x));
  const clientIds = typedRules.map((r) => r.clientId).filter((x): x is string => Boolean(x));
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
  return { raw: typedRules, rows: attachRuleExemptions(typedRules.map((r) => toPricingRuleRow({
    id: r.id, name: r.name, scopeType: r.scopeType, scopeId: r.scopeId, clientId: r.clientId,
    isActive: r.isActive, createdAt: r.createdAt, updatedAt: r.updatedAt,
    percent: kind === "margin" ? toFiniteNumber(r.marginPercent) : toFiniteNumber(r.discountPercent),
    markupMultiplier: r.markupMultiplier != null ? Number(r.markupMultiplier) : null,
    groupId: r.groupId, isExemption: r.isExemption, clientName: r.clientId ? clientNames.get(r.clientId) : null,
    resourceName: r.scopeId ? names.get(r.scopeId) : null,
  }))) };
}

export async function listProductRuleCoverage(input: {
  kind: "margin" | "discount"; q?: string; brandIds?: string[]; categoryIds?: string[]; familyIds?: string[];
  distributorIds?: string[]; coverage?: "all" | "with_rule" | "without_rule"; clientId?: string | null; page?: number; pageSize?: number;
}): Promise<ProductCoverageResult> {
  try {
    await requireAdmin();
    const where = productWhere(input); const clientId = input.clientId || null;
    const page = Math.max(1, input.page || 1); const pageSize = [25, 50, 100].includes(input.pageSize || 0) ? input.pageSize! : 25;
    const all = await prisma.product.findMany({ where, orderBy: { normalizedName: "asc" }, select: pricingSelect });
    const breakdowns = new Map<string, Awaited<ReturnType<typeof calculatePricesForProducts>> extends Map<string, infer B> ? B : never>();
    for (let i = 0; i < all.length; i += 500) {
      const batch = await calculatePricesForProducts(all.slice(i, i + 500).map(pricingInput), clientId);
      for (const [id, value] of batch) breakdowns.set(id, value);
    }
    const hasRule = (p: PricingProduct) => { const b = breakdowns.get(p.id); return input.kind === "margin" ? b?.markupSource === "RULE" : Boolean(b?.appliedDiscountRule || b?.discountSource === "PRODUCT"); };
    const withRule = all.filter(hasRule).length; const coverage = input.coverage || "all";
    const filtered = coverage === "all" ? all : all.filter((p) => coverage === "with_rule" ? hasRule(p) : !hasRule(p));
    const selected = filtered.slice((page - 1) * pageSize, page * pageSize); const ids = selected.map((p) => p.id);
    const [details, rules] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: ids } }, select: { ...pricingSelect, normalizedName: true, internalSku: true,
        brand: { select: { name: true } }, category: { select: { name: true } }, family: { select: { name: true } }, distributor: { select: { name: true } },
        images: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { url: true } }, } }),
      ruleRows(input.kind, clientId),
    ]);
    const detailMap = new Map(details.map((p) => [p.id, p])); const rowMap = new Map(rules.rows.map((r) => [r.id, r]));
    const countBy = async (field: "brandId" | "categoryId" | "familyId" | "distributorId") => prisma.product.groupBy({ by: [field], where: { isActive: true }, _count: { _all: true } });
    const [brandCounts, categoryCounts, familyCounts, distributorCounts, catalogCount] = await Promise.all([countBy("brandId"), countBy("categoryId"), countBy("familyId"), countBy("distributorId"), prisma.product.count({ where: { isActive: true } })]);
    const maps = [brandCounts, categoryCounts, familyCounts, distributorCounts].map((rows, i) => new Map(rows.map((x) => [String(x[["brandId","categoryId","familyId","distributorId"][i] as keyof typeof x] || ""), x._count._all])));
    const items = selected.map((base) => { const p = detailMap.get(base.id)!; const b = breakdowns.get(p.id)!; const candidates = findCandidateRules(rules.raw, pricingInput(p), clientId).map((r) => rowMap.get(r.id)).filter((r): r is PricingRuleRow => Boolean(r));
      const applied = input.kind === "margin" ? b.appliedMarginRule : b.appliedDiscountRule; const source: CoverageSource = input.kind === "margin" ? b.markupSource : b.discountSource === "RULE" ? "RULE" : b.discountSource === "PRODUCT" ? "PRODUCT_FIELD" : "NONE";
      return { id: p.id, name: p.normalizedName, sku: p.internalSku || "", brandId: p.brandId, brandName: p.brand?.name || null, categoryId: p.categoryId, categoryName: p.category?.name || null,
        familyId: p.familyId, familyName: p.family?.name || p.familia || null, distributorId: p.distributorId, distributorName: p.distributor?.name || null, imageUrl: p.images[0]?.url || null,
        baseCostUsd: Number(p.baseCostUsd), appliedRule: applied, appliedRuleRow: applied ? rowMap.get(applied.id) || null : null, candidateRules: candidates, source,
        priceUsdFinal: b.priceUsdFinal, markupMultiplier: b.markupMultiplier, discountPercent: b.discountPercent,
        scopeCounts: { brand: maps[0].get(p.brandId || "") || 0, category: maps[1].get(p.categoryId || "") || 0, family: maps[2].get(p.familyId || "") || 0, distributor: maps[3].get(p.distributorId || "") || 0, catalog: catalogCount } };
    });
    return { ok: true, total: filtered.length, withRule, withoutRule: all.length - withRule, items };
  } catch (error) { console.error("listProductRuleCoverage", error); return { ok: false, error: "No se pudo cargar la cobertura. Probá de nuevo." }; }
}

export async function setPricingRuleActive(input: { kind: "margin" | "discount"; id: string; active: boolean }) {
  await requireAdmin();
  if (input.kind === "margin") await prisma.marginRule.update({ where: { id: input.id }, data: { isActive: input.active } });
  else await prisma.discountRule.update({ where: { id: input.id }, data: { isActive: input.active } });
  revalidatePath(input.kind === "margin" ? "/admin/margins" : "/admin/discounts"); return { ok: true as const };
}

export async function removePricingRule(input: { kind: "margin" | "discount"; id: string }) {
  await requireAdmin();
  if (input.kind === "margin") await prisma.marginRule.delete({ where: { id: input.id } });
  else await prisma.discountRule.delete({ where: { id: input.id } });
  revalidatePath(input.kind === "margin" ? "/admin/margins" : "/admin/discounts"); return { ok: true as const };
}