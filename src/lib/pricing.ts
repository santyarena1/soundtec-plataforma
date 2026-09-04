import { Prisma, RuleScopeType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { getExchangeRate } from "@/lib/exchange-rate";

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
 *   5. cliente + proveedor
 *   6. cliente (regla global del cliente)
 *   7. producto
 *   8. marca
 *   9. distribuidor
 *  10. familia
 *  11. categoría
 *  12. global del sistema
 *
 * Prioridad de DESCUENTOS (idéntica lógica, primera que matchea gana):
 *   1. cliente + producto
 *   2. cliente + marca
 *   3. cliente + categoría
 *   4. cliente + familia
 *   5. cliente + proveedor
 *   6. cliente (regla global del cliente)
 *   7. producto explícito (Product.discountPercent)
 *   8. producto por regla
 *   9. marca
 *  10. distribuidor
 *  11. familia
 *  12. categoría
 *  13. global
 *
 * Notas:
 *  - `MarginRule.priority` no se usa para reordenar la cadena; se usa solo
 *    para desempate cuando hay varias reglas dentro del MISMO nivel.
 *  - Una subregla PRODUCT con `isExemption` no aplica un valor propio: saca
 *    a ese producto de todo el `groupId` y sigue la cadena (cae al default).
 *  - Si `familyId` está vacío, se intenta resolver ProductFamily por el texto
 *    `familia` (mismo nombre, sin distinguir mayúsculas). Si no hay regla ni
 *    COEF VTA, el markup es `pricing.default_markup` (×1.35).
 *  - El cliente NUNCA ve baseCost, márgenes ni reglas aplicadas: usar
 *    `toVisibleBreakdown` para devolver solo lo público.
 *  - La posición arancelaria es un costo extra sobre el costo base.
 */

export type ViewerRole = "ADMIN" | "SUPER_ADMIN" | "CLIENT";

export type MarkupSource = "RULE" | "COEF_VTA" | "DEFAULT";

export interface ProductPricingInput {
  productId: string;
  baseCostUsd: number;
  brandId: string | null;
  distributorId: string | null;
  categoryId: string | null;
  familyId: string | null;
  /**
   * Texto libre del producto (campo FAMILIA). Si `familyId` está vacío, el
   * motor lo usa para matchear ProductFamily por nombre (imports suelen
   * llenar esto y dejar el subrubro sin vincular).
   */
  familia?: string | null;
  /** Evita un segundo lookup si el caller ya resolvió la familia. */
  familyScopeResolved?: boolean;
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
  markupSource: MarkupSource;
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

type PricingMarginRule = Awaited<ReturnType<typeof loadPricingRules>>["marginRules"][number];
type PricingDiscountRule = Awaited<ReturnType<typeof loadPricingRules>>["discountRules"][number];

interface CalculatePriceOptions {
  product: ProductPricingInput;
  clientId?: string | null;
  defaultGlobalMarginPercent?: number;
  defaultMarkupMultiplier?: number;
  tcOverride?: number;
  /** Si vienen de un batch (catálogo), evita un findMany por producto. */
  marginRules?: PricingMarginRule[];
  discountRules?: PricingDiscountRule[];
}

async function loadPricingRules(clientId: string | null) {
  const [marginRules, discountRules] = await Promise.all([
    prisma.marginRule.findMany({
      where: {
        isActive: true,
        OR: [{ clientId: clientId ?? null }, { clientId: null }],
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    }),
    prisma.discountRule.findMany({
      where: {
        isActive: true,
        OR: [{ clientId: clientId ?? null }, { clientId: null }],
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    }),
  ]);
  return { marginRules, discountRules };
}

function exemptionGroupIds(
  rules: Array<{
    isExemption: boolean;
    groupId: string | null;
    scopeType: RuleScopeType;
    scopeId: string | null;
    productId: string | null;
    clientId: string | null;
  }>,
  productId: string,
  clientId: string | null
) {
  const skipped = new Set<string>();
  for (const rule of rules) {
    if (!rule.isExemption || !rule.groupId) continue;
    const productMatch =
      rule.scopeType === "PRODUCT" && (rule.scopeId === productId || rule.productId === productId);
    if (!productMatch) continue;
    if (rule.clientId && rule.clientId !== clientId) continue;
    skipped.add(rule.groupId);
  }
  return skipped;
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

/** Comparar FAMILIA (texto) con ProductFamily.name: trim + minúsculas. */
export function normalizeTaxonomyName(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function familyIdFromFamiliaText(
  familia: string | null | undefined,
  families: Array<{ id: string; name: string }>
): string | null {
  const key = normalizeTaxonomyName(familia);
  if (!key) return null;
  const found = families.find((f) => normalizeTaxonomyName(f.name) === key);
  return found?.id ?? null;
}

/**
 * Si el producto no tiene subrubro (`familyId`) pero sí texto en FAMILIA,
 * busca un ProductFamily con el mismo nombre. Así las reglas por familia
 * (Bracket, Accessory, CCA Series…) aplican aunque el import no haya
 * vinculado el ID.
 */
async function resolveFamilyIds(
  products: ProductPricingInput[]
): Promise<Map<string, string | null>> {
  const resolved = new Map<string, string | null>();
  for (const product of products) {
    if (product.familyId) resolved.set(product.productId, product.familyId);
  }
  const missing = products.filter((product) => !resolved.get(product.productId));
  if (missing.length === 0) return resolved;

  const needsDb = missing.filter((product) => !normalizeTaxonomyName(product.familia));
  const [families, rows] = await Promise.all([
    prisma.productFamily.findMany({ select: { id: true, name: true } }),
    needsDb.length > 0
      ? prisma.product.findMany({
          where: { id: { in: needsDb.map((product) => product.productId) } },
          select: { id: true, familia: true, familyId: true },
        })
      : Promise.resolve(
          [] as Array<{ id: string; familia: string | null; familyId: string | null }>
        ),
  ]);

  const familiaById = new Map<string, string | null>();
  for (const row of rows) {
    familiaById.set(row.id, row.familia);
    if (row.familyId) resolved.set(row.id, row.familyId);
  }

  for (const product of missing) {
    if (resolved.get(product.productId)) continue;
    const text = product.familia ?? familiaById.get(product.productId) ?? null;
    resolved.set(product.productId, familyIdFromFamiliaText(text, families));
  }
  return resolved;
}

/** Productos de esas familias: por `familyId` o por texto FAMILIA si el ID está vacío. */
export async function familyScopeProductWhere(
  familyIds: string[]
): Promise<Prisma.ProductWhereInput> {
  if (familyIds.length === 0) return { familyId: { in: [] } };
  const families = await prisma.productFamily.findMany({
    where: { id: { in: familyIds } },
    select: { id: true, name: true },
  });
  const names = families.map((family) => family.name).filter((name) => name.trim().length > 0);
  return {
    OR: [
      { familyId: { in: familyIds } },
      ...(names.length > 0
        ? [
            {
              AND: [
                { familyId: null },
                {
                  OR: names.map((name) => ({
                    familia: { equals: name, mode: "insensitive" as const },
                  })),
                },
              ],
            },
          ]
        : []),
    ],
  };
}

export async function calculateCustomerPrice(options: CalculatePriceOptions): Promise<PriceBreakdown> {
  const { clientId } = options;
  void options.defaultGlobalMarginPercent;
  let product = options.product;
  if (!product.familyScopeResolved) {
    const familyIds = await resolveFamilyIds([product]);
    product = {
      ...product,
      familyId: familyIds.get(product.productId) ?? product.familyId,
      familyScopeResolved: true,
    };
  }
  const hasRuleCache = options.marginRules != null && options.discountRules != null;
  const [cachedRules, defaultMarkupSetting, exchangeRate] = await Promise.all([
    hasRuleCache
      ? Promise.resolve({ marginRules: options.marginRules!, discountRules: options.discountRules! })
      : loadPricingRules(clientId ?? null),
    options.defaultMarkupMultiplier == null
      ? getSetting("pricing.default_markup", "1.35")
      : Promise.resolve(String(options.defaultMarkupMultiplier)),
    options.tcOverride == null
      ? getExchangeRate()
      : Promise.resolve(options.tcOverride),
  ]);
  const { marginRules, discountRules } = cachedRules;

  type AnyRule = {
    id: string;
    name: string;
    isActive: boolean;
    priority: number;
    scopeType: RuleScopeType;
    scopeId: string | null;
    clientId: string | null;
    productId: string | null;
    groupId: string | null;
    isExemption: boolean;
  };

  // Si un producto matchea una subregla PRODUCT marcada como excepción,
  // se salta TODO el grupo (cae a la siguiente regla de la cadena).
  const skippedMarginGroups = exemptionGroupIds(marginRules, product.productId, clientId ?? null);
  const skippedDiscountGroups = exemptionGroupIds(discountRules, product.productId, clientId ?? null);

  // Cadena de matchers de mayor a menor prioridad
  const matcherChain: Array<(rule: AnyRule) => boolean> = [
    (r) => !!clientId && r.clientId === clientId && r.scopeType === "PRODUCT" && r.scopeId === product.productId,
    (r) => !!clientId && r.clientId === clientId && r.scopeType === "BRAND" && r.scopeId === product.brandId,
    (r) => !!clientId && r.clientId === clientId && r.scopeType === "CATEGORY" && r.scopeId === product.categoryId,
    (r) => !!clientId && r.clientId === clientId && r.scopeType === "FAMILY" && r.scopeId === product.familyId,
    (r) => !!clientId && r.clientId === clientId && r.scopeType === "DISTRIBUTOR" && r.scopeId === product.distributorId,
    (r) =>
      !!clientId &&
      r.clientId === clientId &&
      (r.scopeType === "CLIENT" || r.scopeType === "GLOBAL"),
    (r) => r.scopeType === "PRODUCT" && r.scopeId === product.productId && !r.clientId,
    (r) => r.scopeType === "BRAND" && r.scopeId === product.brandId && !r.clientId,
    (r) => r.scopeType === "DISTRIBUTOR" && r.scopeId === product.distributorId && !r.clientId,
    (r) => r.scopeType === "FAMILY" && r.scopeId === product.familyId && !r.clientId,
    (r) => r.scopeType === "CATEGORY" && r.scopeId === product.categoryId && !r.clientId,
    (r) => r.scopeType === "GLOBAL" && !r.clientId,
  ];
  const clientLevels = 6;
  const lastLevel = matcherChain.length - 1;

  function findFirstMatching<T extends AnyRule>(rules: T[], skippedGroups: Set<string>): T | null {
    for (const matcher of matcherChain) {
      const found = rules.find((r) => {
        if (r.isExemption) return false;
        if (r.groupId && skippedGroups.has(r.groupId)) return false;
        return matcher(r as AnyRule);
      });
      if (found) return found;
    }
    return null;
  }

  const margin = findFirstMatching(marginRules, skippedMarginGroups);
  const marginWithMarkup = margin as (typeof margin & { markupMultiplier?: Prisma.Decimal | null });
  const defaultMarkupMultiplier = parsedSetting(defaultMarkupSetting, 1.35);
  const tc = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1;
  const ruleMarkup = margin
    ? marginWithMarkup.markupMultiplier != null
      ? toNumber(marginWithMarkup.markupMultiplier) // 2.75 → ×2.75, nunca 1+2.75
      : 1 + toNumber(margin.marginPercent) / 100
    : undefined;
  const coefVtaMarkup = optionalNumber(product.coefVta);
  let markupMultiplier: number;
  let markupSource: MarkupSource;
  if (ruleMarkup != null) {
    markupMultiplier = ruleMarkup;
    markupSource = "RULE";
  } else if (coefVtaMarkup != null) {
    markupMultiplier = coefVtaMarkup;
    markupSource = "COEF_VTA";
  } else {
    markupMultiplier = defaultMarkupMultiplier;
    markupSource = "DEFAULT";
  }
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
  function findMatchingAtLevel(
    rules: typeof discountRules,
    startIdx: number,
    endIdx: number,
    skippedGroups: Set<string>
  ) {
    for (let i = startIdx; i <= endIdx; i++) {
      const found = rules.find((r) => {
        if (r.isExemption) return false;
        if (r.groupId && skippedGroups.has(r.groupId)) return false;
        return matcherChain[i](r as AnyRule);
      });
      if (found) return found;
    }
    return null;
  }

  const clientDiscount = findMatchingAtLevel(discountRules, 0, clientLevels - 1, skippedDiscountGroups);
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
    const nonClientDiscount = findMatchingAtLevel(discountRules, clientLevels, lastLevel, skippedDiscountGroups);
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
    markupSource,
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
  if (products.length === 0) return new Map();

  // Una sola lectura de reglas/TC/markup para todo el lote. Antes el catálogo
  // pedía margin+discount por cada producto (miles de queries) y se colgaba.
  const [defaultMarkupRaw, tc, rules, familyIds] = await Promise.all([
    getSetting("pricing.default_markup", "1.35"),
    getExchangeRate(),
    loadPricingRules(clientId),
    resolveFamilyIds(products),
  ]);
  const defaultMarkupMultiplier = parsedSetting(defaultMarkupRaw, 1.35);
  const results = new Map<string, PriceBreakdown>();
  for (const p of products) {
    const r = await calculateCustomerPrice({
      product: {
        ...p,
        familyId: familyIds.get(p.productId) ?? p.familyId,
        familyScopeResolved: true,
      },
      clientId,
      defaultMarkupMultiplier,
      tcOverride: tc,
      marginRules: rules.marginRules,
      discountRules: rules.discountRules,
    });
    results.set(p.productId, r);
  }
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
