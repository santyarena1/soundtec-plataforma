import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moreFromSeriesTitle, seriesChipLabel } from "./chip";
import { moreFromSeriesQuery, NO_SERIES, seriesFilterWhere, shouldShowSeriesFilter } from "./series-filter";

describe("chip de serie en la tarjeta", () => {
  it("muestra «Serie X» con el nombre de la marca, sin traducir", () => {
    assert.equal(seriesChipLabel({ seriesName: "Horizon" }), "Serie Horizon");
    assert.equal(seriesChipLabel({ seriesName: " Visual Performance " }), "Serie Visual Performance");
  });

  it("sin serie no hay chip: nunca cae a la familia vieja", () => {
    // La tarjeta solo conoce seriesName: «Accessory», «Grille», «Comercial» no tienen por dónde aparecer.
    const legacy = { seriesName: null, familyName: "Accessory", familia: "Grille" } as { seriesName: null };
    assert.equal(seriesChipLabel(legacy), null);
    assert.equal(seriesChipLabel({ seriesName: "  " }), null);
    assert.equal(seriesChipLabel({}), null);
  });

  it("título del bloque de la ficha", () => {
    assert.equal(moreFromSeriesTitle("Landscape"), "Más de la serie Landscape");
  });
});

describe("filtro «Serie» de la marca", () => {
  it("aparece solo con una marca elegida y 2 o más series", () => {
    assert.equal(shouldShowSeriesFilter(["crestron"], 10), true);
    assert.equal(shouldShowSeriesFilter(["crestron"], 1), false);
    assert.equal(shouldShowSeriesFilter(["crestron", "sonance"], 10), false);
    assert.equal(shouldShowSeriesFilter([], 10), false);
    assert.equal(shouldShowSeriesFilter(undefined, 10), false);
  });

  it("where por serie; «none» trae los sin serie", () => {
    assert.deepEqual(seriesFilterWhere(["a", "b", "a"]), { lineId: { in: ["a", "b"] } });
    assert.deepEqual(seriesFilterWhere([NO_SERIES]), { lineId: null });
    assert.deepEqual(seriesFilterWhere(["a", NO_SERIES]), { OR: [{ lineId: { in: ["a"] } }, { lineId: null }] });
  });
});

describe("«Más de la serie»", () => {
  const product = { id: "p1", lineId: "horizon", brandId: "crestron" };

  it("misma serie y marca, sin el producto abierto, hasta 8", () => {
    assert.deepEqual(moreFromSeriesQuery(product), { brandIds: ["crestron"], lineIds: ["horizon"], excludeId: "p1", take: 8 });
    assert.equal(moreFromSeriesQuery(product, 50)?.take, 8);
    assert.equal(moreFromSeriesQuery(product, 4)?.take, 4);
  });

  it("sin serie o sin marca no hay bloque", () => {
    assert.equal(moreFromSeriesQuery({ ...product, lineId: null }), null);
    assert.equal(moreFromSeriesQuery({ ...product, brandId: null }), null);
  });
});
