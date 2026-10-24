"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { permissionsHave } from "@/lib/permissions";
import { calculatePricesForProducts } from "@/lib/pricing";
import { getGlobalMarginPercent } from "@/lib/settings";

/**
 * Reglas de precio que tocan a un producto, para verlas y editarlas desde su
 * ficha (solapa «Precio y costos»): márgenes y descuentos generales (todo el
 * catálogo, marca, categoría, familia, proveedor) y los propios del producto.
 * Las reglas por cliente se gestionan en la ficha del cliente.
 */

export type RuleScope = "PRODUCT" | "BRAND" | "CATEGORY" | "FAMILY" | "DISTRIBUTOR" | "GLOBAL";

export type ProductRuleRow = {
  id: string;
  name: string;
  scope: RuleScope;
  scopeLabel: string;
  /** Markup (×) en márgenes, % en descuentos. */
  value: number;
  /** Cuántas subreglas comparte el grupo (editar cambia todas). */
  groupSize: number;
  /** Es la que hoy define el precio de este producto. */
  applied: boolean;
  /** Este producto está exceptuado de esa regla. */
  exempt: boolean;
  /** Markup propio cargado desde el catálogo / lista SoundTube. */
  origin: "catalog" | "soundtube" | "rule";
};

export type ProductRulesData =
  | {
      ok: true;
      margins: ProductRuleRow[];
      discounts: ProductRuleRow[];
      productDiscountPercent: number | null;
      clientRulesCount: number;
      markupSource: string;
      canMargins: boolean;
      canDiscounts: boolean;
    }
  | { ok: false; error: string };

type Result = { ok: true; changed: number } | { ok: false; error: string };

const SCOPE_LABEL: Record<RuleScope, string> = {
  PRODUCT: "Este producto",
  BRAND: "Marca",
  CATEGORY: "Categoría",
  FAMILY: "Familia",
  DISTRIBUTOR: "Proveedor",
  GLOBAL: "Todo el catálogo",
};
const SCOPE_ORDER: RuleScope[] = ["PRODUCT", "BRAND", "DISTRIBUTOR", "FAMILY", "CATEGORY", "GLOBAL"];

const num = (v: unknown) => (v == null ? null : Number(v));

export async function loadProductPricingRules(productId: string): Promise<ProductRulesData> {
  const { permissions } = await requireStaff(["margins.manage", "discounts.manage"], { costs: true });
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      brandId: true,
      categoryId: true,
      familyId: true,
      familia: true,
      distributorId: true,
      baseCostUsd: true,
      discountPercent: true,
      tariffDutyPercent: true,
      coefNac: true,
      coefVta: true,
      coefVtaFob: true,
      ivaPercent: true,
      impIntPercent: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
      family: { select: { name: true } },
      distributor: { select: { name: true } },
    },
  });
  if (!product) return { ok: false, error: "El producto no existe." };

  // Familia: por id o, si no tiene, por el texto FAMILIA (igual que el motor de precios).
  const familyIds = new Set<string>(product.familyId ? [product.familyId] : []);
  let familyName = product.family?.name ?? null;
  if (!product.familyId && product.familia?.trim()) {
    const byName = await prisma.productFamily.findFirst({ where: { name: { equals: product.familia.trim(), mode: "insensitive" } }, select: { id: true, name: true } });
    if (byName) {
      familyIds.add(byName.id);
      familyName = byName.name;
    }
  }

  const scopeWhere = [
    { scopeType: "PRODUCT" as const, OR: [{ productId }, { scopeId: productId }] },
    ...(product.brandId ? [{ scopeType: "BRAND" as const, scopeId: product.brandId }] : []),
    ...(product.categoryId ? [{ scopeType: "CATEGORY" as const, scopeId: product.categoryId }] : []),
    ...(familyIds.size ? [{ scopeType: "FAMILY" as const, scopeId: { in: [...familyIds] } }] : []),
    ...(product.distributorId ? [{ scopeType: "DISTRIBUTOR" as const, scopeId: product.distributorId }] : []),
    { scopeType: "GLOBAL" as const },
  ];
  const where = { clientId: null, isActive: true, OR: scopeWhere };
  const [marginRules, discountRules, clientRulesCount, prices] = await Promise.all([
    prisma.marginRule.findMany({ where, orderBy: [{ priority: "asc" }, { createdAt: "desc" }] }),
    prisma.discountRule.findMany({ where, orderBy: [{ priority: "asc" }, { createdAt: "desc" }] }),
    prisma.discountRule.count({ where: { isActive: true, clientId: { not: null }, OR: scopeWhere } }),
    calculatePricesForProducts(
      [
        {
          productId: product.id,
          baseCostUsd: Number(product.baseCostUsd),
          brandId: product.brandId,
          distributorId: product.distributorId,
          categoryId: product.categoryId,
          familyId: product.familyId,
          familia: product.familia ?? null,
          productDiscountPercent: num(product.discountPercent),
          tariffDutyPercent: num(product.tariffDutyPercent),
          coefNac: num(product.coefNac),
          coefVta: num(product.coefVta),
          coefVtaFob: num(product.coefVtaFob),
          ivaPercent: num(product.ivaPercent),
          impIntPercent: num(product.impIntPercent),
        },
      ],
      null,
      await getGlobalMarginPercent()
    ),
  ]);
  const breakdown = prices.get(product.id);

  const scopeName = (scope: RuleScope) =>
    scope === "BRAND"
      ? product.brand?.name
      : scope === "CATEGORY"
        ? product.category?.name
        : scope === "FAMILY"
          ? familyName
          : scope === "DISTRIBUTOR"
            ? product.distributor?.name
            : null;

  async function rows(kind: "margin" | "discount"): Promise<ProductRuleRow[]> {
    const rules = (kind === "margin" ? marginRules : discountRules) as Array<{
      id: string;
      name: string;
      scopeType: string;
      groupId: string | null;
      isExemption: boolean;
      productId: string | null;
      markupMultiplier?: unknown;
      marginPercent?: unknown;
      discountPercent?: unknown;
    }>;
    const exemptGroups = new Set(rules.filter((r) => r.isExemption && r.productId === productId && r.groupId).map((r) => r.groupId!));
    const groupIds = [...new Set(rules.filter((r) => r.groupId).map((r) => r.groupId!))];
    const groupCounts = new Map<string, number>();
    if (groupIds.length) {
      const counted =
        kind === "margin"
          ? await prisma.marginRule.groupBy({ by: ["groupId"], where: { groupId: { in: groupIds }, isExemption: false }, _count: { _all: true } })
          : await prisma.discountRule.groupBy({ by: ["groupId"], where: { groupId: { in: groupIds }, isExemption: false }, _count: { _all: true } });
      for (const row of counted) if (row.groupId) groupCounts.set(row.groupId, row._count._all);
    }
    const appliedId = kind === "margin" ? breakdown?.appliedMarginRule?.id : breakdown?.appliedDiscountRule?.id;
    return rules
      .filter((r) => !r.isExemption)
      .map((r) => {
        const scope = r.scopeType as RuleScope;
        const name = scopeName(scope);
        const value =
          kind === "margin"
            ? (num(r.markupMultiplier) ?? 1 + (num(r.marginPercent) ?? 0) / 100)
            : (num(r.discountPercent) ?? 0);
        return {
          id: r.id,
          name: r.name,
          scope,
          scopeLabel: name ? `${SCOPE_LABEL[scope]}: ${name}` : SCOPE_LABEL[scope],
          value,
          groupSize: r.groupId ? (groupCounts.get(r.groupId) ?? 1) : 1,
          applied: r.id === appliedId,
          exempt: !!(r.groupId && exemptGroups.has(r.groupId)),
          origin: r.groupId === "soundtube-excel-mup" ? "soundtube" : r.groupId?.startsWith("catalogo") ? "catalog" : "rule",
        } satisfies ProductRuleRow;
      })
      .sort((a, b) => SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope));
  }

  return {
    ok: true,
    margins: await rows("margin"),
    discounts: await rows("discount"),
    productDiscountPercent: num(product.discountPercent),
    clientRulesCount,
    markupSource: breakdown?.markupSource ?? "DEFAULT",
    canMargins: permissions.fullAccess || permissionsHave(permissions, "margins.manage"),
    canDiscounts: permissions.fullAccess || permissionsHave(permissions, "discounts.manage"),
  };
}

const percentSchema = z.number().min(0, "El descuento no puede ser negativo.").max(100, "Máximo 100%.");

/** Cambia el % de una regla de descuento (y de su grupo, si es agrupada: igual que en Descuentos). */
export async function updateDiscountRulePercent(ruleId: string, percent: number): Promise<Result> {
  await requireStaff("discounts.manage", { costs: true });
  const parsed = percentSchema.safeParse(percent);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Porcentaje inválido." };
  const rule = await prisma.discountRule.findUnique({ where: { id: ruleId }, select: { id: true, groupId: true, clientId: true } });
  if (!rule) return { ok: false, error: "La regla no existe." };
  if (rule.clientId) return { ok: false, error: "Las condiciones de un cliente se editan en su ficha." };
  const where = rule.groupId ? { groupId: rule.groupId, isExemption: false } : { id: rule.id };
  const updated = await prisma.discountRule.updateMany({ where, data: { discountPercent: parsed.data } });
  revalidatePath("/admin/discounts");
  revalidatePath("/admin/products");
  revalidatePath("/portal/products");
  return { ok: true, changed: updated.count };
}
