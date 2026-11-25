import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CatalogProduct } from "@/lib/catalog";
import { customerProductCode } from "@/lib/product-display";
import { toCompareColumnView } from "./compare";

const TANGO = "6511483";

const product: CatalogProduct = {
  id: "prod1",
  // En la vista cliente el catálogo ya lo manda en null; acá se fuerza para ver que la comparación tampoco lo pase.
  internalSku: TANGO,
  supplierSku: "AM-3200-WF",
  modelNumber: "AM-3200-WF",
  manufacturerItem: null,
  originalName: "AirMedia Receiver 3200",
  normalizedName: "AM-3200-WF",
  shortDescription: "Receptor AirMedia",
  brandName: "Crestron",
  categoryName: "Presentación inalámbrica",
  seriesName: null,
  primaryImage: null,
  requiresQuote: false,
  isDiscontinued: false,
  commercialTag: null,
  stockStatus: "ON_REQUEST",
  stockQuantity: null,
  isCustomizable: false,
  isCrestronHomeCompatible: false,
  isFeatured: false,
  kind: "PRINCIPAL",
  accessoryRequiredWithPrimary: false,
  pricing: null,
  isFavorite: false,
  labels: [],
};

describe("Código Tango: solo para el equipo de Soundtec", () => {
  it("la comparación no manda el Código Tango al navegador", () => {
    const view = toCompareColumnView({ product, title: "AM-3200-WF", docs: [] }, "/portal/products");
    assert.ok(!JSON.stringify(view).includes(TANGO));
  });

  it("listas compartidas y exportaciones usan el código del fabricante, nunca el interno", () => {
    assert.equal(customerProductCode({ modelNumber: "AM-3200-WF", supplierSku: "X" }), "AM-3200-WF");
    assert.equal(customerProductCode({ modelNumber: " ", manufacturerItem: null, supplierSku: "SKU-9" }), "SKU-9");
    assert.equal(customerProductCode({}), null);
  });
});
