import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { commercialTagFor, discountTagLabel } from "./commercial-tags";
import { labelColors, normalizeHexColor } from "./label-colors";

describe("cartel comercial del producto", () => {
  it("«Últimas unidades» NO sale por datos del proveedor (discontinuado o stock en origen)", () => {
    const fromSupplier = { commercialTag: null, isDiscontinued: true, stockStatus: "LOW_STOCK", stockQuantity: 1 };
    assert.equal(commercialTagFor(fromSupplier), null);
  });

  it("«Últimas unidades» sale solo si el equipo la eligió (stock propio de Soundtec)", () => {
    const tag = commercialTagFor({ commercialTag: "ULTIMAS_UNIDADES" });
    assert.equal(tag?.label, "Últimas unidades");
    assert.equal(tag?.kind, "chosen");
    assert.match(tag?.hint ?? "", /Soundtec/);
  });

  it("con descuento dice «Descuento 20%» (ya no «Oferta −20%»)", () => {
    const tag = commercialTagFor({ discountPercent: 20 });
    assert.equal(tag?.label, "Descuento 20%");
    assert.equal(tag?.kind, "discount");
    assert.equal(discountTagLabel(12.5), "Descuento 12,5%");
  });

  it("sin precio no hay cartel de descuento; el elegido en el panel manda sobre el descuento", () => {
    assert.equal(commercialTagFor({ discountPercent: 20, priceOnRequest: true }), null);
    assert.equal(commercialTagFor({ commercialTag: "LIQUIDACION", discountPercent: 20 })?.label, "Liquidación");
  });
});

describe("color de las etiquetas del panel", () => {
  it("texto blanco sobre oscuro y oscuro sobre claro", () => {
    assert.equal(labelColors("#1e3553").color, "#ffffff");
    assert.equal(labelColors("#fde047").color, "#111827");
  });

  it("colores inválidos caen al gris del portal", () => {
    assert.equal(normalizeHexColor("#abc"), "#aabbcc");
    assert.equal(normalizeHexColor("red"), null);
    assert.equal(labelColors("javascript:alert(1)").background, "#475569");
  });
});
