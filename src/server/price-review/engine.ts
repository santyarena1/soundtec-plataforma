/**
 * Motor de la revisión de cambios de precio.
 *
 * Simular = ejecutar el cambio dentro de una transacción, leer reglas y
 * productos como quedarían, y deshacer. Aplicar = lo mismo pero confirmando.
 * En los dos casos los precios se calculan con `priceProductsWithRules`, la
 * misma cadena que usa todo el sistema (no hay una fórmula aparte).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { getExchangeRate } from "@/lib/exchange-rate";
import {
  PRICING_PRODUCT_SELECT,
  categoryAncestorsFrom,
  preparePricingInputs,
  priceProductsWithRules,
  resetCategoryAncestorsCache,
  toPricingInput,
  type PricingRuleSet,
  type ProductPricingInput,
} from "@/lib/pricing";
import { diffPrices, touchedAudiences, type ReviewProductMeta, type ReviewRow, type ReviewSummary } from "@/lib/price-review/diff";
import type { PriceOperation } from "@/lib/price-review/operations";
import { parseRule, saveRuleRows, type Db } from "@/server/pricing/rule-save";
import { rulesOnlyRenamed } from "@/lib/price-review/rule-rename";
import { ROUNDING_SETTING_KEY, parseRoundingSetting, type PriceRoundingConfig } from "@/lib/price-rounding";

type MarginRuleRow = Prisma.MarginRuleGetPayload<object>;
type DiscountRuleRow = Prisma.DiscountRuleGetPayload<object>;

interface PricingState {
  margins: MarginRuleRow[];
  discounts: DiscountRuleRow[];
  /** null = todos los productos activos. */
  products: ProductPricingInput[];
  /** Redondeo por tramos vigente en ese momento (null = sin redondeo). */
  rounding: PriceRoundingConfig | null;
}

export interface SimulationResult {
  rows: ReviewRow[];
  summary: ReviewSummary;
}

class RollbackSignal extends Error {
  constructor() {
    super("rollback");
  }
}

const TX_OPTIONS = { timeout: 120_000, maxWait: 15_000 } as const;

/** Productos que el cambio puede mover (null = todos los activos). */
async function productScope(db: Db, op: PriceOperation): Promise<string[] | null> {
  if (op.type === "products.setCategory" || op.type === "products.setDiscount") return op.productIds;
  if (op.type === "category.merge") {
    const rows = await db.product.findMany({ where: { categoryId: op.fromId }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  return null;
}

async function readState(db: Db, productIds: string[] | null): Promise<PricingState> {
  const [margins, discounts, products, categories, roundingRow] = await Promise.all([
    db.marginRule.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "desc" }] }),
    db.discountRule.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "desc" }] }),
    db.product.findMany({
      where: productIds ? { id: { in: productIds } } : { isActive: true },
      select: PRICING_PRODUCT_SELECT,
    }),
    db.category.findMany({ select: { id: true, parentId: true } }),
    db.adminSetting.findUnique({ where: { key: ROUNDING_SETTING_KEY }, select: { value: true } }),
  ]);
  const rounding = parseRoundingSetting(roundingRow?.value);
  const parents = new Map(categories.map((c) => [c.id, c.parentId]));
  return {
    margins,
    discounts,
    rounding: rounding?.enabled ? rounding : null,
    products: products.map((p) => ({
      ...toPricingInput(p),
      categoryAncestorIds: p.categoryId ? categoryAncestorsFrom(p.categoryId, parents) : [],
    })),
  };
}

function formDataFrom(entries: Array<[string, string]>): FormData {
  const fd = new FormData();
  for (const [key, value] of entries) fd.append(key, value);
  return fd;
}

/** Ejecuta el cambio sobre `db` (una transacción). Tira error con un mensaje para el usuario si no se puede. */
export async function executeOperation(db: Db, op: PriceOperation): Promise<void> {
  switch (op.type) {
    case "rule.save": {
      const form = formDataFrom(op.form);
      const parsed = parseRule(form, op.kind);
      if (!parsed.ok) throw new Error(parsed.error);
      const ids = (name: string, one: string) => {
        const many = form.getAll(name).map(String).filter(Boolean);
        const single = String(form.get(one) || "");
        return many.length ? many : single ? [single] : [];
      };
      await saveRuleRows(db, op.kind, parsed, {
        id: form.get("id")?.toString() || undefined,
        groupId: form.get("groupId")?.toString() || undefined,
        replaceGroup: form.get("replaceGroup") === "on",
        excludeProductIds: ids("excludeProductIds", "excludeProductId"),
      });
      return;
    }
    case "rules.update": {
      if (!op.ids.length) return;
      if (op.kind === "margin") {
        const { discountPercent: _ignored, ...data } = op.data;
        void _ignored;
        await db.marginRule.updateMany({ where: { id: { in: op.ids } }, data });
      } else {
        await db.discountRule.updateMany({
          where: { id: { in: op.ids } },
          data: {
            ...(op.data.isActive !== undefined ? { isActive: op.data.isActive } : {}),
            ...(op.data.discountPercent !== undefined ? { discountPercent: op.data.discountPercent } : {}),
            ...(op.data.notes !== undefined ? { notes: op.data.notes } : {}),
          },
        });
      }
      return;
    }
    case "rules.delete": {
      if (!op.ids.length) return;
      if (op.kind === "margin") await db.marginRule.deleteMany({ where: { id: { in: op.ids } } });
      else await db.discountRule.deleteMany({ where: { id: { in: op.ids } } });
      return;
    }
    case "products.setCategory": {
      const target = await db.category.findUnique({ where: { id: op.categoryId }, select: { tangoPath: true, isActive: true } });
      if (!target?.tangoPath || !target.isActive) throw new Error("El rubro elegido no está en el árbol de Tango.");
      await db.product.updateMany({ where: { id: { in: op.productIds } }, data: { categoryId: op.categoryId } });
      return;
    }
    case "products.setDiscount": {
      await db.product.updateMany({ where: { id: { in: op.productIds } }, data: { discountPercent: op.discountPercent } });
      return;
    }
    case "pricing.rounding": {
      const value = JSON.stringify(op.config);
      await db.adminSetting.upsert({
        where: { key: ROUNDING_SETTING_KEY },
        update: { value },
        create: { key: ROUNDING_SETTING_KEY, value, description: "Redondeo del precio de venta por tramos (aprobado en Revisión de cambios)." },
      });
      return;
    }
    case "category.merge": {
      if (op.fromId === op.toId) throw new Error("Elegí otro rubro para unir.");
      const [from, to, activeChildren] = await Promise.all([
        db.category.findUnique({ where: { id: op.fromId }, select: { id: true } }),
        db.category.findUnique({ where: { id: op.toId }, select: { tangoPath: true, isActive: true } }),
        db.category.count({ where: { parentId: op.fromId, isActive: true } }),
      ]);
      if (!from) throw new Error("El rubro a unir ya no existe.");
      if (!to?.tangoPath || !to.isActive) throw new Error("El rubro destino no está en el árbol de Tango.");
      if (activeChildren > 0) throw new Error("Ese rubro tiene subrubros activos: uní o desactivá primero los subrubros.");
      await db.product.updateMany({ where: { categoryId: op.fromId }, data: { categoryId: op.toId } });
      await db.compatibilityRule.updateMany({ where: { categoryId: op.fromId }, data: { categoryId: op.toId } });
      await db.quoteService.updateMany({ where: { categoryId: op.fromId }, data: { categoryId: op.toId } });
      await db.categoryEquivalence.updateMany({ where: { categoryId: op.fromId }, data: { categoryId: op.toId } }).catch(() => undefined);
      await db.category.update({ where: { id: op.fromId }, data: { isActive: false } });
      return;
    }
  }
}

/** Corre el cambio en una transacción; si `commit` es false la deshace. Devuelve el estado antes y después. */
async function runInTransaction(op: PriceOperation, commit: boolean): Promise<{ before: PricingState; after: PricingState }> {
  let captured: { before: PricingState; after: PricingState } | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const scope = await productScope(tx, op);
      const before = await readState(tx, scope);
      await executeOperation(tx, op);
      const after = await readState(tx, scope);
      captured = { before, after };
      if (!commit) throw new RollbackSignal();
    }, TX_OPTIONS);
  } catch (err) {
    if (!(err instanceof RollbackSignal)) throw err;
  }
  if (!captured) throw new Error("No se pudo simular el cambio.");
  if (commit && (op.type === "category.merge" || op.type === "products.setCategory")) resetCategoryAncestorsCache();
  return captured;
}

async function pricesFor(state: PricingState, clientId: string | null, base: Omit<PricingRuleSet, "marginRules" | "discountRules" | "rounding">) {
  const prepared = await preparePricingInputs(state.products);
  const result = await priceProductsWithRules(prepared, clientId, {
    ...base,
    marginRules: state.margins,
    discountRules: state.discounts,
    rounding: state.rounding,
  });
  return new Map([...result].map(([id, b]) => [id, b.priceUsdFinal]));
}

/** Compara precios antes/después para la lista general y los clientes con condiciones propias que correspondan. */
export async function comparePricing(before: PricingState, after: PricingState, productScoped: boolean): Promise<SimulationResult> {
  const [markupRaw, tc] = await Promise.all([getSetting("pricing.default_markup", "1.35"), getExchangeRate()]);
  const parsedMarkup = Number(markupRaw);
  const base = {
    defaultMarkupMultiplier: Number.isFinite(parsedMarkup) && parsedMarkup > 0 ? parsedMarkup : 1.35,
    tc: Number.isFinite(tc) && tc > 0 ? tc : 1,
  };
  const allRules = [...before.margins, ...before.discounts, ...after.margins, ...after.discounts];
  const clientsWithRules = [...new Set(allRules.map((r) => r.clientId).filter((id): id is string => Boolean(id)))];
  let audiences: Array<string | null>;
  if (productScoped) {
    audiences = [null, ...clientsWithRules];
  } else {
    const touched = new Set([
      ...touchedAudiences(before.margins, after.margins),
      ...touchedAudiences(before.discounts, after.discounts),
    ]);
    audiences = touched.has(null) ? [null, ...clientsWithRules] : [...touched];
  }

  const clientNames = new Map(
    (
      await prisma.client.findMany({
        where: { id: { in: audiences.filter((id): id is string => Boolean(id)) } },
        select: { id: true, companyName: true, contactName: true },
      })
    ).map((c) => [c.id, c.companyName || c.contactName || c.id])
  );

  const prices = [];
  for (const clientId of audiences) {
    prices.push({
      clientId,
      name: clientId ? `Cliente: ${clientNames.get(clientId) ?? clientId}` : "Lista general",
      before: await pricesFor(before, clientId, base),
      after: await pricesFor(after, clientId, base),
    });
  }

  const ids = new Set<string>();
  for (const audience of prices) {
    for (const [id, value] of audience.after) if (Math.abs(value - (audience.before.get(id) ?? 0)) >= 0.005) ids.add(id);
    for (const id of audience.before.keys()) if (!audience.after.has(id)) ids.add(id);
  }
  const meta = new Map<string, ReviewProductMeta>();
  const idList = [...ids];
  for (let i = 0; i < idList.length; i += 1000) {
    const rows = await prisma.product.findMany({
      where: { id: { in: idList.slice(i, i + 1000) } },
      select: { id: true, normalizedName: true, internalSku: true, brand: { select: { name: true } } },
    });
    for (const r of rows) meta.set(r.id, { id: r.id, name: r.normalizedName, sku: r.internalSku, brand: r.brand?.name ?? null });
  }
  return diffPrices(prices, meta);
}

/** Simula el cambio sin guardar nada. */
export async function simulateOperation(op: PriceOperation): Promise<SimulationResult> {
  return (await simulateOperationDetailed(op)).result;
}

/**
 * Simula y además dice si el cambio fue solo de nombre (reglas iguales salvo
 * nombre o nota): esos no mueven precios y se pueden guardar directo.
 */
export async function simulateOperationDetailed(op: PriceOperation): Promise<{ result: SimulationResult; namesOnly: boolean }> {
  const { before, after } = await runInTransaction(op, false);
  const namesOnly =
    op.type === "rule.save" &&
    (op.kind === "margin"
      ? rulesOnlyRenamed(before.margins, after.margins) && sameRules(before.discounts, after.discounts)
      : rulesOnlyRenamed(before.discounts, after.discounts) && sameRules(before.margins, after.margins));
  const result = await comparePricing(before, after, op.type !== "rule.save" && op.type !== "rules.update" && op.type !== "rules.delete");
  return { result, namesOnly: namesOnly && result.summary.affectedProducts === 0 };
}

function sameRules(before: Array<{ id: string; updatedAt?: Date }>, after: Array<{ id: string; updatedAt?: Date }>): boolean {
  if (before.length !== after.length) return false;
  const ids = new Set(before.map((r) => r.id));
  return after.every((r) => ids.has(r.id));
}

/** Aplica el cambio de verdad y devuelve lo que se movió realmente. */
export async function commitOperation(op: PriceOperation): Promise<SimulationResult> {
  const { before, after } = await runInTransaction(op, true);
  return comparePricing(before, after, op.type !== "rule.save" && op.type !== "rules.update" && op.type !== "rules.delete");
}
