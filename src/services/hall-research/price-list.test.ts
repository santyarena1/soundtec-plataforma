import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanCategory, parseHallPriceListRows, parseMoney, skuKey } from "./price-list";
import { buildHallPriceListPlan, physicalData, priceChanged, type HallCatalogProduct } from "./price-list-plan";

const HEADER = [
  "Name", "Replacement Item", "Brands", "Item Status", "Item Category", "MSRP", "Distributor",
  "Short Description", "Long Description", "Device\nHeight (mm)", "Device\nWidth (mm)", "Device\nLength (mm)",
  "Weight (lbs)", "Web Link", "Image URL",
];
const row = (sku: string, cost: string, extra: Partial<Record<string, string>> = {}) => [
  sku, extra.replacement ?? "", extra.brand ?? "Atlona", "Active", "01 - Extenders", extra.msrp ?? "$1,060.00", cost,
  "Short", "Long", "26", "109", "132", "1", "https://hallresearch.com/product/x", "https://cdn/x.png",
];

describe("parseMoney", () => {
  it("lee montos con $ y miles", () => assert.equal(parseMoney("$1,060.00"), 1060));
  it("vacío → undefined", () => assert.equal(parseMoney(""), undefined));
  it("acepta números", () => assert.equal(parseMoney(493.5), 493.5));
});

describe("cleanCategory", () => {
  it("saca el número de orden", () => assert.equal(cleanCategory("01 - Extenders"), "Extenders"));
  it("deja el texto si no hay número", () => assert.equal(cleanCategory("Audio"), "Audio"));
});

describe("parseHallPriceListRows", () => {
  it("toma Distributor como costo y MSRP aparte", () => {
    const { rows } = parseHallPriceListRows([HEADER, row("AT-1", "$530.00")]);
    assert.equal(rows[0].costUsd, 530);
    assert.equal(rows[0].msrpUsd, 1060);
    assert.equal(rows[0].category, "Extenders");
    assert.equal(rows[0].deviceHeightMm, 26);
    assert.equal(rows[0].excelRow, 2);
  });
  it("encuentra el encabezado aunque haya filas antes", () => {
    const { rows } = parseHallPriceListRows([["Lista Q4"], [], HEADER, row("AT-1", "$1.00")]);
    assert.equal(rows[0].excelRow, 4);
  });
  it("marca filas sin costo o sin marca y saltea vacías", () => {
    const parsed = parseHallPriceListRows([HEADER, row("AT-1", ""), row("AT-2", "$5", { brand: "" }), ["", "", ""]]);
    assert.equal(parsed.rows.length, 0);
    assert.deepEqual(parsed.invalid.map((i) => i.reason), ["Sin costo (Distributor)", "Sin marca"]);
  });
  it("SKU repetido: usa la primera fila", () => {
    const parsed = parseHallPriceListRows([HEADER, row("AT-1", "$5"), row("at-1 ", "$9")]);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].costUsd, 5);
    assert.equal(parsed.duplicates.length, 1);
  });
  it("sin encabezado → error claro", () => assert.throws(() => parseHallPriceListRows([["a", "b"]]), /encabezado/));
});

const product = (id: string, sku: string, cost = 10, msrp: number | null = 20): HallCatalogProduct => ({
  id, sku, name: sku, brand: "Atlona", costUsd: cost, msrpUsd: msrp, isActive: true,
});

describe("buildHallPriceListPlan", () => {
  it("separa existentes, nuevos y los que quedaron afuera", () => {
    const { rows } = parseHallPriceListRows([HEADER, row("AT-1", "$5"), row("AT-NEW", "$7")]);
    const plan = buildHallPriceListPlan(rows, [product("p1", "at-1"), product("p2", "AT-OLD")]);
    assert.deepEqual(plan.matched.map((m) => m.product.id), ["p1"]);
    assert.deepEqual(plan.toCreate.map((r) => r.sku), ["AT-NEW"]);
    assert.deepEqual(plan.missing.map((p) => p.id), ["p2"]);
  });
  it("dos productos con el mismo SKU: el segundo queda como «afuera»", () => {
    const { rows } = parseHallPriceListRows([HEADER, row("AT-1", "$5")]);
    const plan = buildHallPriceListPlan(rows, [product("p1", "AT-1"), product("p2", "AT-1")]);
    assert.equal(plan.matched.length, 1);
    assert.deepEqual(plan.missing.map((p) => p.id), ["p2"]);
  });
});

describe("priceChanged", () => {
  const { rows } = parseHallPriceListRows([HEADER, row("AT-1", "$10.00", { msrp: "$20.00" })]);
  it("igual → false", () => assert.equal(priceChanged(product("p", "AT-1", 10, 20), rows[0]), false));
  it("cambia el costo → true", () => assert.equal(priceChanged(product("p", "AT-1", 9, 20), rows[0]), true));
  it("cambia el MSRP → true", () => assert.equal(priceChanged(product("p", "AT-1", 10, null), rows[0]), true));
});

describe("physicalData", () => {
  it("convierte mm a cm y libras a kg", () => {
    const { rows } = parseHallPriceListRows([HEADER, row("AT-1", "$5")]);
    assert.deepEqual(physicalData(rows[0]), { heightCm: 2.6, widthCm: 10.9, depthCm: 13.2, weight: 0.454 });
  });
});

describe("skuKey", () => {
  it("normaliza espacios y mayúsculas", () => assert.equal(skuKey(" at-ome-ms42 "), "AT-OME-MS42"));
});
