import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PriceListRow } from "./price-list";
import { buildPriceListPlan, suggestCandidates, type CatalogProduct } from "./price-list-plan";

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

  it("reconoce el mismo SKU escrito con espacios o guiones distintos", () => {
    const plan = buildPriceListPlan(
      [row("SQUAREROOT 6.5 GG"), row("IPD4-CM62-KIT")],
      [product("a", "SQUAREROOT 6.5-GG"), product("b", "IPD4-CM62 KIT")]
    );
    assert.deepEqual(plan.matched.map((m) => [m.product.id, m.looseMatch]), [["a", true], ["b", true]]);
    assert.equal(plan.notInSystem.length, 0);
    assert.equal(plan.missing.length, 0);
  });

  it("la coincidencia exacta gana y no se mezclan SKUs con barra distinta", () => {
    const plan = buildPriceListPlan(
      [row("SQUAREROOT 6.5-GG"), row("SQUAREROOT 6.5 GG/T")],
      [product("a", "SQUAREROOT 6.5-GG"), product("b", "SQUAREROOT 6.5 GG")]
    );
    assert.deepEqual(plan.matched.map((m) => [m.product.id, m.looseMatch]), [["a", false]]);
    assert.deepEqual(plan.notInSystem.map((r) => r.sku), ["SQUAREROOT 6.5 GG/T"]);
    assert.deepEqual(plan.missing.map((p) => p.id), ["b"]);
  });

  it("si la coincidencia aproximada es ambigua, no adivina", () => {
    const plan = buildPriceListPlan([row("AB-1"), row("AB 1")], [product("a", "AB1")]);
    assert.equal(plan.matched.length, 0);
    assert.equal(plan.notInSystem.length, 2);
  });

  it("usa las equivalencias confirmadas antes que la coincidencia aproximada", () => {
    const plan = buildPriceListPlan(
      [row("PS1090a"), row("PL350")],
      [product("a", "PS1090a-BK"), product("b", "PL350-GB")],
      new Map([["PS1090A", "a"]])
    );
    assert.deepEqual(plan.matched.map((m) => [m.product.id, m.aliasMatch]), [["a", true]]);
    assert.deepEqual(plan.notInSystem.map((r) => r.sku), ["PL350"]);
    assert.deepEqual(plan.missing.map((p) => p.id), ["b"]);
  });
});

describe("suggestCandidates", () => {
  const products = [product("kit", "CI20X MP KIT"), product("bk", "PS1090a-BK"), product("x", "OTRO"), product("short", "CI2")];
  it("sugiere productos con el mismo comienzo de SKU", () => {
    assert.deepEqual(suggestCandidates(row("CI20X MP"), products).map((p) => p.id), ["kit"]);
    assert.deepEqual(suggestCandidates(row("PS1090a"), products).map((p) => p.id), ["bk"]);
  });
  it("no sugiere con SKUs demasiado cortos ni sin relación", () => {
    assert.deepEqual(suggestCandidates(row("ZZZ-9999"), products), []);
    assert.deepEqual(suggestCandidates(row("CI"), products), []);
  });
});
