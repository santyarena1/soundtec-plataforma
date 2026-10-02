import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PriceListRow } from "./price-list";
import { buildPriceListPlan, type CatalogProduct } from "./price-list-plan";

function row(sku: string, costUsd = 10, mup = 3.05): PriceListRow {
  return { excelRow: 3, sku, description: "", costUsd, mup };
}

function product(id: string, sku: string | null): CatalogProduct {
  return { id, sku, name: sku ?? id, brand: "SoundTube", costUsd: 1, isActive: true };
}

describe("buildPriceListPlan", () => {
  it("separa actualizados, SKUs nuevos y productos que quedan afuera", () => {
    const plan = buildPriceListPlan(
      [row("CM31-EZ-BK"), row("NEW-SKU")],
      [product("p1", "cm31-ez-bk"), product("p2", "OLD-SKU"), product("p3", null)]
    );
    assert.deepEqual(plan.matched.map((m) => m.product.id), ["p1"]);
    assert.deepEqual(plan.notInSystem.map((r) => r.sku), ["NEW-SKU"]);
    assert.deepEqual(plan.missing.map((p) => p.id), ["p2", "p3"]);
  });

  it("un SKU del Excel puede actualizar varios productos con el mismo SKU", () => {
    const plan = buildPriceListPlan([row("SD-1")], [product("a", "SD-1"), product("b", "sd-1 ")]);
    assert.equal(plan.matched.length, 2);
    assert.equal(plan.notInSystem.length, 0);
  });
});
