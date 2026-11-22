import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryAncestorsFrom, priceProductsWithRules, type PricingRuleSet, type ProductPricingInput } from "./pricing";
import { diffPrices, touchedAudiences, type ReviewProductMeta } from "./price-review/diff";

/*
 * Herencia de reglas por rubro y simulación de la revisión de precios con la
 * cadena real (priceProductsWithRules es la que usa todo el sistema).
 *
 * Árbol: SONIDO (s) > BAFLES PASIVOS (bp) > EMBUTIR (emb) ; CONTROL (c)
 */
const parents = new Map<string, string | null>([
  ["s", null],
  ["bp", "s"],
  ["emb", "bp"],
  ["c", null],
]);

function product(id: string, categoryId: string | null, extra: Partial<ProductPricingInput> = {}): ProductPricingInput {
  return {
    productId: id,
    baseCostUsd: 100,
    brandId: "marca",
    distributorId: null,
    categoryId,
    categoryAncestorIds: categoryId ? categoryAncestorsFrom(categoryId, parents) : [],
    familyId: null,
    familyScopeResolved: true,
    productDiscountPercent: null,
    ...extra,
  };
}

let seq = 0;
function margin(scopeType: string, scopeId: string | null, markup: number, extra: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `m${seq}`,
    name: `${scopeType} ${scopeId ?? ""}`,
    priority: 100,
    scopeType,
    scopeId,
    clientId: null,
    productId: scopeType === "PRODUCT" ? scopeId : null,
    marginPercent: (markup - 1) * 100,
    markupMultiplier: markup,
    isActive: true,
    notes: null,
    groupId: null,
    isExemption: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  };
}

function rules(margins: unknown[], discounts: unknown[] = []): PricingRuleSet {
  return {
    marginRules: margins as PricingRuleSet["marginRules"],
    discountRules: discounts as PricingRuleSet["discountRules"],
    defaultMarkupMultiplier: 1.35,
    tc: 1000,
  };
}

async function prices(products: ProductPricingInput[], set: PricingRuleSet, clientId: string | null = null) {
  const out = await priceProductsWithRules(products, clientId, set);
  return new Map([...out].map(([id, b]) => [id, Math.round(b.priceUsdFinal * 100) / 100]));
}

test("ancestros de un rubro: el propio primero, hasta la raíz", () => {
  assert.deepEqual(categoryAncestorsFrom("emb", parents), ["emb", "bp", "s"]);
  assert.deepEqual(categoryAncestorsFrom("c", parents), ["c"]);
});

test("una regla sobre un rubro alcanza a sus subrubros", async () => {
  const p = await prices([product("a", "emb"), product("b", "c")], rules([margin("CATEGORY", "s", 2)]));
  assert.equal(p.get("a"), 200, "EMBUTIR hereda la regla de SONIDO");
  assert.equal(p.get("b"), 135, "CONTROL no: queda el markup por defecto");
});

test("si hay varias reglas de rubro, gana la del rubro más profundo", async () => {
  const set = rules([margin("CATEGORY", "s", 2), margin("CATEGORY", "bp", 3), margin("CATEGORY", "emb", 4)]);
  const p = await prices([product("a", "emb"), product("b", "bp"), product("c", "s")], set);
  assert.equal(p.get("a"), 400);
  assert.equal(p.get("b"), 300);
  assert.equal(p.get("c"), 200);
  // Sin la de EMBUTIR, gana la del padre inmediato.
  const p2 = await prices([product("a", "emb")], rules([margin("CATEGORY", "s", 2), margin("CATEGORY", "bp", 3)]));
  assert.equal(p2.get("a"), 300);
});

test("se respeta el orden de prioridades: marca gana sobre rubro y la regla de cliente por rubro gana sobre la general", async () => {
  const set = rules([margin("CATEGORY", "emb", 4), margin("BRAND", "marca", 3.05)]);
  assert.equal((await prices([product("a", "emb")], set)).get("a"), 305);
  const withClient = rules([margin("BRAND", "marca", 3.05), margin("CATEGORY", "s", 2, { clientId: "cli" })]);
  assert.equal((await prices([product("a", "emb")], withClient, "cli")).get("a"), 200, "cliente + rubro (heredado) va antes que marca general");
  assert.equal((await prices([product("a", "emb")], withClient, null)).get("a"), 305);
});

test("las reglas inactivas no cuentan", async () => {
  const set = rules([margin("CATEGORY", "s", 2, { isActive: false })]);
  assert.equal((await prices([product("a", "emb")], set)).get("a"), 135);
});

test("revisión: crear una regla por rubro lista los productos que cambian con precio actual → nuevo", async () => {
  const items = [product("a", "emb"), product("b", "c"), product("c", "bp", { brandId: "otra" })];
  const before = rules([margin("BRAND", "marca", 3.05)]);
  const after = rules([margin("BRAND", "marca", 3.05), margin("CATEGORY", "bp", 2.5)]);
  const meta = new Map<string, ReviewProductMeta>(items.map((p) => [p.productId, { id: p.productId, name: p.productId.toUpperCase(), sku: null, brand: null }]));
  const { rows, summary } = diffPrices([{ clientId: null, name: "Lista general", before: await prices(items, before), after: await prices(items, after) }], meta);
  // «a» tiene regla de marca (gana sobre rubro): no cambia. «c» es de otra marca y está en el rubro: 135 → 250.
  assert.equal(summary.affectedProducts, 1);
  assert.equal(rows[0].productId, "c");
  assert.equal(rows[0].beforeUsd, 135);
  assert.equal(rows[0].afterUsd, 250);
  assert.equal(rows[0].diffUsd, 115);
  assert.equal(rows[0].pct, 85.19);
  assert.equal(summary.up, 1);
  assert.equal(summary.totalBeforeUsd, 135);
  assert.equal(summary.totalAfterUsd, 250);
});

test("revisión: retirar una regla tapada por otra da 0 cambios (caso reglas FAMILY)", async () => {
  const items = [product("a", "emb", { familyId: "accessory" }), product("b", "c", { familyId: "accessory" })];
  const familyRule = margin("FAMILY", "accessory", 2.75);
  const brand = margin("BRAND", "marca", 3.05);
  const before = rules([brand, familyRule]);
  const after = rules([brand, { ...familyRule, isActive: false }]);
  const { rows, summary } = diffPrices([{ clientId: null, name: "Lista general", before: await prices(items, before), after: await prices(items, after) }], new Map());
  assert.equal(summary.affectedProducts, 0);
  assert.equal(rows.length, 0);
  assert.deepEqual([...touchedAudiences(before.marginRules as never, after.marginRules as never)], [null]);
});

test("qué listas mirar: un cambio de regla de cliente toca solo a ese cliente", () => {
  const r1 = { id: "1", clientId: "cli", isActive: true, marginPercent: 10 };
  const r2 = { id: "2", clientId: null, isActive: true, marginPercent: 20 };
  assert.deepEqual([...touchedAudiences([r1, r2], [{ ...r1, marginPercent: 30 }, r2])], ["cli"]);
  assert.deepEqual([...touchedAudiences([r1, r2], [r1])], [null]);
  assert.deepEqual([...touchedAudiences([r1, r2], [r1, r2])], []);
});
