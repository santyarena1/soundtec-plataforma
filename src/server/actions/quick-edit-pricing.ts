"use server";

/**
 * Pestaña Precios de la edición rápida: de dónde sale el precio, simulación en
 * vivo con el motor real (src/lib/pricing.ts) y guardado con la convención del
 * sistema (ver src/lib/quick-edit/price-draft.ts): lo propio del producto va
 * directo, las reglas de alcance mayor quedan en Precios › Revisión de cambios.
 */
import { z } from "zod";
import { Prisma, RuleScopeType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateCustomerPrice, getPriceRoundingConfig, PRICING_PRODUCT_SELECT, toPricingInput, type PriceBreakdown } from "@/lib/pricing";
import { markupToMarginPercent } from "@/lib/pricing-scope";
import { getExchangeRate } from "@/lib/exchange-rate";
import type { PriceRoundingConfig } from "@/lib/price-rounding";
import {
  applyPriceDraft,
  planPriceSave,
  simulateDiscountRules,
  simulateMarginRules,
  type DraftRule,
  type PriceDraft,
  type ProductPriceFields,
} from "@/lib/quick-edit/price-draft";
import { proposePriceReview } from "@/server/price-review/reviews";
import { clearProductsMarkup, setProductsMarkup, updateRuleMarkup } from "@/server/actions/price-editor";
import { loadProductPricingRules, type ProductRuleRow } from "@/server/actions/product-pricing-rules";
import { actorOf, refreshProductViews, requireQuickEdit, saveProductPatch } from "@/server/quick-edit/shared";

const OWN_GROUP_PREFIX = "catalogo";
const MAX_MARKUP = 20;
const SCOPE_LABEL: Record<string, string> = {
  PRODUCT: "este producto",
  BRAND: "la marca",
  CATEGORY: "el rubro",
  LINE: "la serie",
  FAMILY: "la familia",
  DISTRIBUTOR: "el proveedor",
  GLOBAL: "todo el catálogo",
  CLIENT: "el cliente",
};

export interface PriceSnapshot {
  costoNacUsd: number;
  markup: number;
  markupSource: "RULE" | "COEF_VTA" | "DEFAULT";
  marginRule: { name: string; scope: string; forClient: boolean } | null;
  listUsd: number;
  discountPercent: number;
  discountSource: "RULE" | "PRODUCT" | null;
  discountRule: { name: string; scope: string; forClient: boolean } | null;
  finalUsd: number;
  unroundedUsd: number;
  finalArs: number;
  ivaPercent: number;
  tc: number;
}

export interface PriceHistoryRow {
  id: string;
  status: string;
  title: string;
  createdAt: string;
  by: string | null;
  beforeUsd: number | null;
  afterUsd: number | null;
}

export interface QuickPricingData {
  fields: ProductPriceFields;
  currency: string;
  msrpUsd: number | null;
  costUpdatedAt: string | null;
  ownMarkup: number | null;
  rules: Array<ProductRuleRow & { kind: "margin" | "discount" }>;
  clientRulesCount: number;
  rounding: PriceRoundingConfig | null;
  current: PriceSnapshot;
  history: PriceHistoryRow[];
  distributors: Array<{ id: string; name: string }>;
  canMargins: boolean;
  canDiscounts: boolean;
}

const num = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

function snapshot(b: PriceBreakdown): PriceSnapshot {
  const rule = (r: PriceBreakdown["appliedMarginRule"]) => (r ? { name: r.name, scope: SCOPE_LABEL[r.scopeType] ?? r.scopeType, forClient: !!r.clientId } : null);
  return {
    costoNacUsd: b.costoNacUsd,
    markup: b.markupMultiplier,
    markupSource: b.markupSource,
    marginRule: rule(b.appliedMarginRule),
    listUsd: b.priceBeforeDiscountUsd,
    discountPercent: b.discountPercent,
    discountSource: b.discountSource,
    discountRule: rule(b.appliedDiscountRule),
    finalUsd: b.priceUsdFinal,
    unroundedUsd: b.priceUnroundedUsd,
    finalArs: b.priceNacFinalArs,
    ivaPercent: b.ivaPercent,
    tc: b.tc,
  };
}

async function loadProduct(productId: string) {
  return prisma.product.findUnique({
    where: { id: productId },
    select: { ...PRICING_PRODUCT_SELECT, requiresQuote: true, currency: true, listPriceUsd: true, fieldUpdatedAt: true },
  });
}

function fieldsOf(p: NonNullable<Awaited<ReturnType<typeof loadProduct>>>): ProductPriceFields {
  return {
    baseCostUsd: num(p.baseCostUsd) ?? 0,
    distributorId: p.distributorId,
    coefNac: num(p.coefNac),
    coefVta: num(p.coefVta),
    coefVtaFob: num(p.coefVtaFob),
    tariffDutyPercent: num(p.tariffDutyPercent),
    ivaPercent: num(p.ivaPercent),
    impIntPercent: num(p.impIntPercent),
    discountPercent: num(p.discountPercent),
    requiresQuote: p.requiresQuote,
  };
}

/** Reglas activas generales y, si se pide, las de un cliente (mismo criterio que el motor). */
async function activeRules(clientId: string | null) {
  const where = { isActive: true, OR: [{ clientId: null }, ...(clientId ? [{ clientId }] : [])] };
  const orderBy = [{ priority: "asc" as const }, { createdAt: "desc" as const }];
  const [marginRules, discountRules] = await Promise.all([prisma.marginRule.findMany({ where, orderBy }), prisma.discountRule.findMany({ where, orderBy })]);
  return { marginRules, discountRules };
}

async function ownMarkupOf(productId: string): Promise<number | null> {
  const rule = await prisma.marginRule.findFirst({
    where: { scopeType: "PRODUCT", clientId: null, isExemption: false, isActive: true, productId, groupId: { startsWith: OWN_GROUP_PREFIX } },
    select: { markupMultiplier: true, marginPercent: true },
  });
  return rule ? (num(rule.markupMultiplier) ?? 1 + (num(rule.marginPercent) ?? 0) / 100) : null;
}

async function priceHistory(productId: string): Promise<PriceHistoryRow[]> {
  // Revisiones de precio en las que aparece este producto (precio general, sin cliente).
  const rows = await prisma.$queryRaw<Array<{ id: string; status: string; title: string; createdAt: Date; createdByName: string | null; row: { beforeUsd?: number | null; afterUsd?: number | null } | null }>>`
    SELECT id, status::text AS status, title, "createdAt", "createdByName",
      (SELECT elem FROM jsonb_array_elements(items) elem
        WHERE elem->>'productId' = ${productId} ORDER BY (elem->>'clientId') IS NOT NULL LIMIT 1) AS row
    FROM "PriceReview"
    WHERE jsonb_typeof(items) = 'array' AND items @> ${JSON.stringify([{ productId }])}::jsonb
    ORDER BY "createdAt" DESC
    LIMIT 8`;
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
    by: r.createdByName,
    beforeUsd: num(r.row?.beforeUsd),
    afterUsd: num(r.row?.afterUsd),
  }));
}

export async function loadQuickEditPricing(productId: string): Promise<{ ok: true; data: QuickPricingData } | { ok: false; error: string }> {
  const { access } = await requireQuickEdit();
  const product = await loadProduct(String(productId).slice(0, 64));
  if (!product) return { ok: false, error: "El producto no existe." };
  const canRules = access.canEditMargins || access.canEditDiscountRules;
  const [rulesData, ownMarkup, rounding, breakdown, history, distributors] = await Promise.all([
    canRules ? loadProductPricingRules(product.id) : Promise.resolve(null),
    ownMarkupOf(product.id),
    getPriceRoundingConfig(),
    calculateCustomerPrice({ product: toPricingInput(product), clientId: null }),
    priceHistory(product.id).catch((error) => {
      console.error("[quick-edit] historial de precios", error);
      return [] as PriceHistoryRow[];
    }),
    prisma.distributor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const stamps = (product.fieldUpdatedAt ?? {}) as Record<string, unknown>;
  const rules = rulesData?.ok
    ? [...rulesData.margins.map((r) => ({ ...r, kind: "margin" as const })), ...rulesData.discounts.map((r) => ({ ...r, kind: "discount" as const }))]
    : [];
  return {
    ok: true,
    data: {
      fields: fieldsOf(product),
      currency: product.currency,
      msrpUsd: num(product.listPriceUsd),
      costUpdatedAt: typeof stamps.baseCostUsd === "string" ? stamps.baseCostUsd : null,
      ownMarkup,
      rules,
      clientRulesCount: rulesData?.ok ? rulesData.clientRulesCount : 0,
      rounding,
      current: snapshot(breakdown),
      history,
      distributors,
      canMargins: access.canEditMargins,
      canDiscounts: access.canEditDiscountRules,
    },
  };
}

const fieldsSchema = z.object({
  baseCostUsd: z.number().min(0, "El costo no puede ser negativo.").max(10_000_000),
  distributorId: z.string().max(64).nullable(),
  coefNac: z.number().min(0).max(100).nullable(),
  coefVta: z.number().min(0).max(100).nullable(),
  coefVtaFob: z.number().min(0).max(100).nullable(),
  tariffDutyPercent: z.number().min(0).max(1000).nullable(),
  ivaPercent: z.number().min(0).max(100).nullable(),
  impIntPercent: z.number().min(0).max(1000).nullable(),
  discountPercent: z.number().min(0, "El descuento no puede ser negativo.").max(100, "Descuento máximo: 100 %.").nullable(),
  requiresQuote: z.boolean(),
});
const draftSchema = z.object({
  fields: fieldsSchema,
  ownMarkup: z.number().gt(1, "El markup tiene que ser mayor a 1.").max(MAX_MARKUP, `Markup máximo ×${MAX_MARKUP}.`).nullable(),
  ruleValues: z.record(z.string().max(64), z.number().min(0).max(1000)),
});

function badDraft(error: z.ZodError) {
  return { ok: false as const, error: error.issues[0]?.message ?? "Valores inválidos." };
}

/** Precio actual y simulado (general y, si se elige, para un cliente). No guarda nada. */
export async function simulateQuickEditPrice(
  productId: string,
  draft: PriceDraft,
  clientId: string | null
): Promise<{ ok: true; general: { before: PriceSnapshot; after: PriceSnapshot }; client: { name: string; before: PriceSnapshot; after: PriceSnapshot } | null } | { ok: false; error: string }> {
  const { access } = await requireQuickEdit();
  const parsed = draftSchema.safeParse(draft);
  if (!parsed.success) return badDraft(parsed.error);
  const product = await loadProduct(String(productId).slice(0, 64));
  if (!product) return { ok: false, error: "El producto no existe." };
  // Sin permiso de márgenes/descuentos, las reglas no se simulan (quedan como están).
  const ruleValues = Object.fromEntries(
    Object.entries(parsed.data.ruleValues).filter(() => access.canEditMargins || access.canEditDiscountRules)
  );
  const currentOwn = await ownMarkupOf(product.id);
  const ownMarkup = access.canEditMargins ? parsed.data.ownMarkup : currentOwn;
  const client = clientId
    ? await prisma.client.findUnique({ where: { id: String(clientId).slice(0, 64) }, select: { id: true, companyName: true, tradeName: true } })
    : null;
  const [tc, rounding] = await Promise.all([getExchangeRate(), getPriceRoundingConfig()]);
  const input = toPricingInput(product);
  const draftInput = applyPriceDraft(input, parsed.data.fields);

  async function pair(forClient: string | null) {
    const rules = await activeRules(forClient);
    const marginRules = simulateMarginRules(
      rules.marginRules,
      product!.id,
      ownMarkup,
      access.canEditMargins ? ruleValues : {},
      (r, m) => ({ ...r, markupMultiplier: new Prisma.Decimal(m), marginPercent: new Prisma.Decimal(markupToMarginPercent(m)) }),
      (m) => ({
        id: "simulado-markup-propio",
        name: "Markup propio (simulado)",
        priority: -1000,
        scopeType: RuleScopeType.PRODUCT,
        scopeId: product!.id,
        productId: product!.id,
        clientId: null,
        groupId: `${OWN_GROUP_PREFIX}:${product!.id}`,
        isExemption: false,
        isActive: true,
        notes: null,
        markupMultiplier: new Prisma.Decimal(m),
        marginPercent: new Prisma.Decimal(markupToMarginPercent(m)),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
    const discountRules = simulateDiscountRules(rules.discountRules, access.canEditDiscountRules ? ruleValues : {}, (r, p) => ({ ...r, discountPercent: new Prisma.Decimal(p) }));
    const [before, after] = await Promise.all([
      calculateCustomerPrice({ product: input, clientId: forClient, marginRules: rules.marginRules, discountRules: rules.discountRules, tcOverride: tc, rounding }),
      calculateCustomerPrice({ product: draftInput, clientId: forClient, marginRules, discountRules, tcOverride: tc, rounding }),
    ]);
    return { before: snapshot(before), after: snapshot(after) };
  }

  const [general, forClient] = await Promise.all([pair(null), client ? pair(client.id) : Promise.resolve(null)]);
  return { ok: true, general, client: client && forClient ? { name: client.tradeName || client.companyName, ...forClient } : null };
}

export async function searchQuickEditClients(query: string): Promise<Array<{ id: string; name: string }>> {
  await requireQuickEdit();
  const q = String(query ?? "").trim().slice(0, 80);
  if (q.length < 2) return [];
  const rows = await prisma.client.findMany({
    where: { OR: [{ companyName: { contains: q, mode: "insensitive" } }, { tradeName: { contains: q, mode: "insensitive" } }, { taxId: { contains: q } }] },
    orderBy: { companyName: "asc" },
    take: 8,
    select: { id: true, companyName: true, tradeName: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.tradeName ? `${r.tradeName} (${r.companyName})` : r.companyName }));
}

/** Una regla de alcance mayor (o de descuento): queda pendiente en Revisión de cambios, con su grupo. */
async function proposeRuleChange(kind: "margin" | "discount", ruleId: string, value: number, actor: { id: string; name: string | null }): Promise<string> {
  const rule =
    kind === "margin"
      ? await prisma.marginRule.findUnique({ where: { id: ruleId }, select: { id: true, name: true, groupId: true, clientId: true } })
      : await prisma.discountRule.findUnique({ where: { id: ruleId }, select: { id: true, name: true, groupId: true, clientId: true } });
  if (!rule) throw new Error("Una de las reglas ya no existe.");
  if (rule.clientId) throw new Error("Las condiciones de un cliente se editan en su ficha.");
  const where = rule.groupId ? { groupId: rule.groupId, isExemption: false } : { id: rule.id };
  const members =
    kind === "margin"
      ? await prisma.marginRule.findMany({ where, select: { id: true } })
      : await prisma.discountRule.findMany({ where, select: { id: true } });
  const ids = members.map((m) => m.id);
  if (kind === "margin" && !(value > 1 && value <= MAX_MARKUP)) throw new Error(`El markup de «${rule.name}» tiene que estar entre ×1 y ×${MAX_MARKUP}.`);
  if (kind === "discount" && !(value >= 0 && value <= 100)) throw new Error(`El descuento de «${rule.name}» tiene que estar entre 0 y 100 %.`);
  const review = await proposePriceReview(
    kind === "margin"
      ? { type: "rules.update", kind, ids, data: { markupMultiplier: value, marginPercent: Math.min(999.999, markupToMarginPercent(value)) } }
      : { type: "rules.update", kind, ids, data: { discountPercent: value } },
    `${kind === "margin" ? `Cambiar markup a ×${value}` : `Cambiar descuento a ${value} %`}: ${rule.name}${ids.length > 1 ? ` (y ${ids.length - 1} subreglas)` : ""} · desde la ficha del portal`,
    actor
  );
  return review.affectedProducts === 0
    ? `«${rule.name}»: no mueve ningún precio; aplicalo con un clic en Precios › Revisión de cambios.`
    : `«${rule.name}»: mueve ${review.affectedProducts} productos. Quedó en Precios › Revisión de cambios para aprobarlo.`;
}

/** Guarda la pestaña Precios: lo propio del producto directo, las reglas generales a revisión. */
export async function saveQuickEditPrices(productId: string, draft: PriceDraft): Promise<{ ok: true; applied: string[]; review: string[] } | { ok: false; error: string; applied?: string[]; review?: string[] }> {
  const { user, access } = await requireQuickEdit();
  const parsed = draftSchema.safeParse(draft);
  if (!parsed.success) return badDraft(parsed.error);
  const product = await loadProduct(String(productId).slice(0, 64));
  if (!product) return { ok: false, error: "El producto no existe." };
  const rulesData = access.canEditMargins || access.canEditDiscountRules ? await loadProductPricingRules(product.id) : null;
  const currentRules: DraftRule[] = rulesData?.ok
    ? [
        ...rulesData.margins.map((r) => ({ id: r.id, kind: "margin" as const, scope: r.scope, value: r.value, origin: r.origin })),
        ...rulesData.discounts.map((r) => ({ id: r.id, kind: "discount" as const, scope: r.scope, value: r.value, origin: r.origin })),
      ]
    : [];
  const plan = planPriceSave({ fields: fieldsOf(product), ownMarkup: await ownMarkupOf(product.id), rules: currentRules }, parsed.data);
  const applied: string[] = [];
  const review: string[] = [];
  if (!plan.hasChanges) return { ok: true, applied: ["No había cambios para guardar."], review };

  if (Object.keys(plan.fields).length) {
    const saved = await saveProductPatch(product.id, plan.fields);
    if (!saved.ok) return { ok: false, error: saved.error, applied, review };
    applied.push("Datos de precio del producto guardados (directo, solo este producto).");
  }
  try {
    for (const change of plan.changes) {
      if (change.route === "review") {
        const allowed = change.kind === "margin" ? access.canEditMargins : access.canEditDiscountRules;
        if (!allowed) throw new Error("No tenés permiso para cambiar esa regla.");
        review.push(await proposeRuleChange(change.kind, change.ruleId, change.value, actorOf(user)));
        continue;
      }
      if (!access.canEditMargins) throw new Error("No tenés permiso para cambiar el markup.");
      const result =
        change.route === "direct-own-markup"
          ? await setProductsMarkup([product.id], change.value)
          : change.route === "clear-own-markup"
            ? await clearProductsMarkup([product.id])
            : await updateRuleMarkup(change.ruleId, change.value);
      if (!result.ok) {
        // updateRuleMarkup devuelve «no se aplicó todavía» cuando la mandó a revisión.
        if (/Revisión de cambios/.test(result.error)) review.push(result.error);
        else throw new Error(result.error);
        continue;
      }
      applied.push(change.route === "clear-own-markup" ? "Markup propio quitado: vuelve a la regla que le toque." : "Markup de este producto guardado (directo).");
    }
  } catch (error) {
    refreshProductViews(product.id);
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo guardar.", applied, review };
  }
  refreshProductViews(product.id);
  return { ok: true, applied, review };
}
