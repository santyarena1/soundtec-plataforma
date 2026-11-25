import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { toPublicShareListItems } from "./share-list-public";

// Lo que devuelve resolveShareablePriceListProducts + calculatePricesForProducts:
// el pricing real trae costo, margen, coeficiente, TC y la regla aplicada.
const rawItem = {
  id: "p1",
  name: "AM-200",
  sku: "AM-200",
  shortDescription: "Presentador",
  brandName: "Crestron",
  categoryName: "Video",
  familyName: "AirMedia",
  kind: "PRODUCT",
  stockStatus: "IN_STOCK",
  stockQuantity: 37,
  imageUrl: null,
  pricing: {
    finalPriceUsd: 1925.004,
    priceBeforeDiscountUsd: 1925,
    discountPercent: 0,
    baseCostUsd: 700,
    landedCostUsd: 700,
    costoNacUsd: 700,
    marginPercent: 175,
    markupMultiplier: 2.75,
    tc: 1700,
    appliedMarginRule: { id: "r1", name: "CRESTRON COEFICIENTE 26-08-17" },
  },
};

const FORBIDDEN = /baseCost|landedCost|costoNac|marginPercent|markupMultiplier|appliedMarginRule|appliedDiscountRule|"tc"|COEFICIENTE|familyName|kind/;

test("la lista pública no serializa costo, margen, coeficiente ni regla", () => {
  const out = toPublicShareListItems([rawItem], { showSku: true, showStock: true, hidePrices: false });
  const json = JSON.stringify(out);
  assert.doesNotMatch(json, FORBIDDEN);
  assert.deepEqual(out[0].price, { currency: "USD", finalUsd: 1925, beforeDiscountUsd: 1925, discountPercent: 0 });
});

test("sin stock en la lista, no viaja ni la cantidad ni el estado", () => {
  const out = toPublicShareListItems([rawItem], { showSku: true, showStock: false, hidePrices: false });
  const json = JSON.stringify(out);
  assert.equal(out[0].stock, null);
  assert.doesNotMatch(json, /37|IN_STOCK|stockQuantity/);
});

test("con precios ocultos o sin SKU, no viajan", () => {
  const out = toPublicShareListItems([rawItem], { showSku: false, showStock: true, hidePrices: true });
  assert.equal(out[0].price, null);
  assert.equal(out[0].sku, null);
  assert.deepEqual(out[0].stock, { status: "IN_STOCK", quantity: 37 });
});

test("la página pública pasa al cliente solo el objeto mínimo", () => {
  const page = readFileSync(path.join(process.cwd(), "src/app/lista/[slug]/page.tsx"), "utf8");
  assert.match(page, /toPublicShareListItems\(/);
  assert.doesNotMatch(page, /<ShareListTable[\s\S]*?items=\{items\}/);
  const table = readFileSync(path.join(process.cwd(), "src/app/lista/[slug]/share-list-table.tsx"), "utf8");
  assert.doesNotMatch(table, /pricing|stockQuantity/);
});
