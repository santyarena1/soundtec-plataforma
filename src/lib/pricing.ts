import { Prisma, RuleScopeType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

/**
 * Motor central de precios.
 *
 * Pipeline de cálculo:
 *
 *   costoNacUsd = costoBase × coefNac
 *   precioUsd   = costoNacUsd × markup directo × (1 - descuento%)
 *   precioARS   = precioUsd × TC × IVA × impuestos internos
 *
 * Prioridad de MÁRGENES (la PRIMERA que matchea gana; orden estricto):
 *   1. cliente + producto
 *   2. cliente + marca
 *   3. cliente + categoría
 *   4. cliente + familia
 *   5. cliente (regla global del cliente)
 *   6. producto
 *   7. marca
 *   8. distribuidor
 *   9. familia
 *  10. categoría
 *  11. global del sistema
 *
 * Prioridad de DESCUENTOS (idéntica lógica, primera que matchea gana):
 *   1. cliente + producto
 *   2. cliente + marca
 *   3. cliente + categoría
 *   4. cliente + familia
 *   5. cliente (regla global del cliente)
 *   6. producto explícito (Product.discountPercent)
 *   7. producto por regla
 *   8. marca
 *   9. distribuidor
 *  10. familia
 *  11. categoría
 *  12. global
 *
 * Notas:
 *  - `MarginRule.priority` no se usa para reordenar la cadena; se usa solo
 *    para desempate cuando hay varias reglas dentro del MISMO nivel.
 *  - El cliente NUNCA ve baseCost, márgenes ni reglas aplicadas: usar
 *    `toVisibleBreakdown` para devolver solo lo público.
 *  - La posición arancelaria es un costo extra sobre el costo base.
 */

export type ViewerRole = "ADMIN" | "SUPER_ADMIN" | "CLIENT";

export interface ProductPricingInput {
  productId: string;
  baseCostUsd: number;
  brandId: string | null;
  distributorId: string | null;
  categoryId: string | null;
  familyId: string | null;
  productDiscountPercent: number | null;
  /** % de derechos arancelarios sobre el costo base (NCM). */
  tariffDutyPercent?: number | null;
  coefNac?: number | null;
  coefVta?: number | null;
  coefVtaFob?: number | null;
  ivaPercent?: number | null;
  impIntPercent?: number | null;
}

export interface AppliedRule {
  id: string;
  name: string;
  scopeType: RuleScopeType;
  percent: number;
  priority: number;
  source: "MARGIN" | "DISCOUNT";
}

export interface PriceBreakdown {
  baseCostUsd: number;
  tariffDutyPercent: number;
  tariffDutyAmountUsd: number;
  landedCostUsd: number;
  marginPercent: number;
  appliedMarginRule: AppliedRule | null;
  priceBeforeDiscountUsd: number;
  discountPercent: number;
  appliedDiscountRule: AppliedRule | null;
  discountSource: "RULE" | "PRODUCT" | null;
  finalPriceUsd: number;
  costoNacUsd: number;
  markupMultiplier: number;
  priceUsdFinal: number;
  priceFobUsd: number;
  priceNacFinalArs: number;
  tc: number;
  ivaPercent: number;
  impIntPercent: number;
}

export interface VisibleBreakdown extends Pick<PriceBreakdown, "discountPercent" | "finalPriceUsd"> {
  priceBeforeDiscountUsd: number | null;
  showInternals: boolean;
}

interface CalculatePriceOptions {
  product: ProductPricingInput;
  clientId?: string | null;
  defaultGlobalMarginPercent?: number;
  defaultMarkupMultiplier?: number;
  tc?: number;
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number(value.toString());
}

function optionalNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parsedSetting(value: string, fallback: number): number {
  if (!value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function calculateCustomerPrice(options: CalculatePriceOptions): Promise<PriceBreakdown> {
  const { product, clientId } = options;
  void options.defaultGlobalMarginPercent;
  const [marginRules, discountRules, defaultMarkupSetting, tcSetting] = await Promise.all([
    prisma.marginRule.findMany({
      where: {
        isActive: true,
        OR: [
          { clientId: clientId ?? null },
          { clientId: null },
        ],
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    }),
    prisma.discountRule.findMany({
      where: {
        isActive: true,
        OR: [
          { clientId: clientId ?? null },
          { clientId: null },
        ],
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    }),
    options.defaultMarkupMultiplier == null
      ? getSetting("pricing.default_markup", "1.35")
      : Promise.resolve(String(options.defaultMarkupMultiplier)),
    options.tc == null
      ? getSetting("pricing.tc", "1")
      : Promise.resolve(String(options.tc)),
  ]);

  type AnyRule = {
    id: string;
    name: string;
    isActive: boolean;
    priority: number;
    scopeType: RuleScopeType;
    scopeId: string | null;
    clientId: string | null;
    productId: string | null;
  };

  // Cadena de matchers de mayor a menor prioridad
  const matcherChain: Array<(rule: AnyRule) => boolean> = [
    (r) => !!clientId && r.clientId === clientId && r.scopeType === "PRODUCT" && r.scopeId === product.productId,
    (r) => !!clientId && r.clientId === clientId && r.scopeType === "BRAND" && r.scopeId === product.brandId,
    (r) => !!clientId && r.clientId === clientId && r.scopeType === "CATEGORY" && r.scopeId === product.categoryId,
    (r) => !!clientId && r.clientId === clientId && r.scopeType === "FAMILY" && r.scopeId === product.familyId,
    (r) => !!clientId && r.clientId === clientId && r.scopeType === "CLIENT",
    (r) => r.scopeType === "PRODUCT" && r.scopeId === product.productId && !r.clientId,
    (r) => r.scopeType === "BRAND" && r.scopeId === product.brandId && !r.clientId,
    (r) => r.scopeType === "DISTRIBUTOR" && r.scopeId === product.distributorId && !r.clientId,
    (r) => r.scopeType === "FAMILY" && r.scopeId === product.familyId && !r.clientId,
    (r) => r.scopeType === "CATEGORY" && r.scopeId === product.categoryId && !r.clientId,
    (r) => r.scopeType === "GLOBAL" && !r.clientId,
  ];

  function findFirstMatching<T extends AnyRule>(rules: T[]): T | null {
    for (const matcher of matcherChain) {
      const found = rules.find((r) => matcher(r as AnyRule));
      if (found) return found;
    }
    return null;
  }

  const margin = findFirstMatching(marginRules);
  const marginWithMarkup = margin as (typeof margin & { markupMultiplier?: Prisma.Decimal | null });
  const defaultMarkupMultiplier = parsedSetting(defaultMarkupSetting, 1.35);
  const tc = parsedSetting(tcSetting, 1);
  const ruleMarkup = margin
    ? marginWithMarkup.markupMultiplier != null
      ? toNumber(marginWithMarkup.markupMultiplier)
      : 1 + toNumber(margin.marginPercent) / 100
    : undefined;
  const markupMultiplier = ruleMarkup
    ?? optionalNumber(product.coefVta)
    ?? defaultMarkupMultiplier;
  const marginPercent = (markupMultiplier - 1) * 100;
  const baseCost = toNumber(product.baseCostUsd);
  const tariffDutyPercent = Math.max(0, toNumber(product.tariffDutyPercent ?? 0));
  const tariffDutyAmount = baseCost * (tariffDutyPercent / 100);
  const landedCost = baseCost + tariffDutyAmount;
  const costoNacUsd = baseCost * (optionalNumber(product.coefNac) ?? 1);
  const priceBeforeDiscount = costoNacUsd * markupMultiplier;

  let appliedDiscountRule: AppliedRule | null = null;
  let discountPercent = 0;
  let discountSource: "RULE" | "PRODUCT" | null = null;

  // Priority order:
  //   1-5. Client-specific rules (chain indices 0-4)
  //   6.   Product.discountPercent (explicit field, higher priority than product rules)
  //   7-12. Non-client rules: product-rule, brand, distributor, family, category, global (chain indices 5-10)
  function findMatchingAtLevel(rules: typeof discountRules, startIdx: number, endIdx: number) {
    for (let i = startIdx; i <= endIdx; i++) {
      const found = rules.find((r) => matcherChain[i](r as AnyRule));
      if (found) return found;
    }
    return null;
  }

  const clientDiscount = findMatchingAtLevel(discountRules, 0, 4);
  if (clientDiscount) {
    discountPercent = toNumber(clientDiscount.discountPercent);
    appliedDiscountRule = {
      id: clientDiscount.id,
      name: clientDiscount.name,
      scopeType: clientDiscount.scopeType,
      percent: discountPercent,
      priority: clientDiscount.priority,
      source: "DISCOUNT",
    };
    discountSource = "RULE";
  } else if (product.productDiscountPercent && product.productDiscountPercent > 0) {
    discountPercent = product.productDiscountPercent;
    discountSource = "PRODUCT";
  } else {
    const nonClientDiscount = findMatchingAtLevel(discountRules, 5, 10);
    if (nonClientDiscount) {
      discountPercent = toNumber(nonClientDiscount.discountPercent);
      appliedDiscountRule = {
        id: nonClientDiscount.id,
        name: nonClientDiscount.name,
        scopeType: nonClientDiscount.scopeType,
        percent: discountPercent,
        priority: nonClientDiscount.priority,
        source: "DISCOUNT",
      };
      discountSource = "RULE";
    }
  }

  const priceUsdFinal = priceBeforeDiscount * (1 - discountPercent / 100);
  const priceFobUsd = baseCost * (optionalNumber(product.coefVtaFob) ?? markupMultiplier);
  const ivaPercent = optionalNumber(product.ivaPercent) ?? 21;
  const impIntPercent = optionalNumber(product.impIntPercent) ?? 0;
  const priceNacFinalArs = priceUsdFinal
    * tc
    * (1 + ivaPercent / 100)
    * (1 + impIntPercent / 100);

  return {
    baseCostUsd: baseCost,
    tariffDutyPercent,
    tariffDutyAmountUsd: tariffDutyAmount,
    landedCostUsd: landedCost,
    marginPercent,
    appliedMarginRule: margin
      ? {
          id: margin.id,
          name: margin.name,
          scopeType: margin.scopeType,
          percent: marginPercent,
          priority: margin.priority,
          source: "MARGIN",
        }
      : null,
    priceBeforeDiscountUsd: priceBeforeDiscount,
    discountPercent,
    appliedDiscountRule,
    discountSource,
    costoNacUsd,
    markupMultiplier,
    priceUsdFinal,
    priceFobUsd,
    priceNacFinalArs,
    tc,
    ivaPercent,
    impIntPercent,
    finalPriceUsd: priceUsdFinal,
  };
}

export function toVisibleBreakdown(breakdown: PriceBreakdown, role: ViewerRole): VisibleBreakdown {
  const isInternal = role === "ADMIN" || role === "SUPER_ADMIN";
  return {
    finalPriceUsd: breakdown.priceUsdFinal,
    discountPercent: breakdown.discountPercent,
    priceBeforeDiscountUsd: breakdown.discountPercent > 0 ? breakdown.priceBeforeDiscountUsd : null,
    showInternals: isInternal,
  };
}

export async function calculatePricesForProducts(
  products: ProductPricingInput[],
  clientId: string | null,
  defaultGlobalMarginPercent = 35
): Promise<Map<string, PriceBreakdown>> {
  void defaultGlobalMarginPercent;
  const [defaultMarkupRaw, tcRaw] = await Promise.all([
    getSetting("pricing.default_markup", "1.35"),
    getSetting("pricing.tc", "1"),
  ]);
  const defaultMarkupMultiplier = parsedSetting(defaultMarkupRaw, 1.35);
  const tc = parsedSetting(tcRaw, 1);
  const results = new Map<string, PriceBreakdown>();
  await Promise.all(
    products.map(async (p) => {
      const r = await calculateCustomerPrice({
        product: p,
        clientId,
        defaultMarkupMultiplier,
        tc,
      });
      results.set(p.productId, r);
    })
  );
  return results;
}

/**
 * Decide si un producto en particular es visible para un cliente.
 * Tiene en cuenta reglas por producto, marca, categoría, familia y distribuidor.
 * Modo default = blacklist (todo visible salvo reglas con canView=false).
 */
export async function isProductVisibleToClient(
  product: { id: string; brandId: string | null; categoryId: string | null; distributorId: string | null; familyId: string | null },
  clientId: string
): Promise<boolean> {
  const vis = await getClientVisibility(clientId);
  if (vis.hidden.productIds.has(product.id)) return false;
  if (product.brandId && vis.hidden.brandIds.has(product.brandId)) return false;
  if (product.categoryId && vis.hidden.categoryIds.has(product.categoryId)) return false;
  if (product.distributorId && vis.hidden.distributorIds.has(product.distributorId)) return false;
  if (product.familyId && vis.hidden.familyIds.has(product.familyId)) return false;
  return true;
}

/**
 * Devuelve los IDs de scopes (brand/category/distributor/family/product) que el cliente tiene OCULTOS.
 * Si `defaultShowAll` es true (default del sistema), todo es visible salvo reglas con canView=false.
 * Si fuera false (modo whitelist), sólo serían visibles los que tengan canView=true; lo dejamos preparado.
 */
export async function getClientVisibility(clientId: string) {
  const rules = await prisma.visibilityRule.findMany({ where: { clientId } });
  const hidden = {
    productIds: new Set<string>(),
    brandIds: new Set<string>(),
    categoryIds: new Set<string>(),
    distributorIds: new Set<string>(),
    familyIds: new Set<string>(),
  };
  const allowed = {
    productIds: new Set<string>(),
    brandIds: new Set<string>(),
    categoryIds: new Set<string>(),
    distributorIds: new Set<string>(),
    familyIds: new Set<string>(),
  };

  for (const rule of rules) {
    const targetSet = rule.canView ? allowed : hidden;
    if (!rule.scopeId) continue;
    switch (rule.scopeType) {
      case "PRODUCT":
        targetSet.productIds.add(rule.scopeId);
        break;
      case "BRAND":
        targetSet.brandIds.add(rule.scopeId);
        break;
      case "CATEGORY":
        targetSet.categoryIds.add(rule.scopeId);
        break;
      case "DISTRIBUTOR":
        targetSet.distributorIds.add(rule.scopeId);
        break;
      case "FAMILY":
        targetSet.familyIds.add(rule.scopeId);
        break;
      default:
        break;
    }
  }

  return { hidden, allowed };
}
