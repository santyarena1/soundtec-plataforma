/**
 * Orden "Más relevantes": vistas de ficha cuando hay datos suficientes;
 * mientras no, Crestron Home primero y de mayor a menor precio.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MIN_VIEWS_FOR_RELEVANCE, compareByRelevance, hasEnoughViews } from "./catalog-relevance";

const p = (id: string, crestronHome: boolean, price: number) => ({ id, isCrestronHomeCompatible: crestronHome, price });

describe("hasEnoughViews", () => {
  it("requiere el mínimo de vistas", () => {
    assert.equal(hasEnoughViews(MIN_VIEWS_FOR_RELEVANCE - 1), false);
    assert.equal(hasEnoughViews(MIN_VIEWS_FOR_RELEVANCE), true);
  });
});

describe("compareByRelevance", () => {
  const items = [p("a", false, 900), p("b", true, 100), p("c", true, 500), p("d", false, 50)];

  it("sin datos: Crestron Home primero, después precio de mayor a menor", () => {
    const sorted = [...items].sort(compareByRelevance(new Map(), false)).map((i) => i.id);
    assert.deepEqual(sorted, ["c", "b", "a", "d"]);
  });

  it("con datos: más vistas primero, y el respaldo desempata", () => {
    const views = new Map([["d", 10], ["a", 3], ["b", 3]]);
    const sorted = [...items].sort(compareByRelevance(views, true)).map((i) => i.id);
    assert.deepEqual(sorted, ["d", "b", "a", "c"]);
  });

  it("con pocas vistas ignora el conteo", () => {
    const views = new Map([["d", 10]]);
    const sorted = [...items].sort(compareByRelevance(views, false)).map((i) => i.id);
    assert.deepEqual(sorted, ["c", "b", "a", "d"]);
  });
});

import { compareByPrice, missingPriceLast, sortablePrice } from "./catalog-price-sort";

describe("orden por precio: sin precio al final", () => {
  const item = (id: string, price: number | null, requiresQuote = false) => ({
    id,
    requiresQuote,
    pricing: price === null ? null : { finalPriceUsd: price },
  });
  const items = [item("sin", null), item("caro", 900), item("cero", 0), item("consultar", 50, true), item("barato", 20)];
  const sorted = (direction: "asc" | "desc") =>
    [...items].sort((a, b) => missingPriceLast(a, b) || compareByPrice(a, b, direction)).map((i) => i.id);

  it("menor precio: los que tienen precio primero, de menor a mayor", () => {
    assert.deepEqual(sorted("asc").slice(0, 2), ["barato", "caro"]);
    assert.deepEqual(new Set(sorted("asc").slice(2)), new Set(["sin", "cero", "consultar"]));
  });

  it("mayor precio: también con los sin precio al final", () => {
    assert.deepEqual(sorted("desc").slice(0, 2), ["caro", "barato"]);
  });

  it("«a consultar» y precio 0 cuentan como sin precio", () => {
    assert.equal(sortablePrice(item("x", 0)), null);
    assert.equal(sortablePrice(item("x", 50, true)), null);
    assert.equal(sortablePrice(item("x", 50)), 50);
  });
});
