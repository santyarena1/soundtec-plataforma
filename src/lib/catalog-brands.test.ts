import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brandHref, brandQuery, totalProducts, withCrestronHome, type CatalogBrand } from "./catalog-brands";

const brand = (id: string, name: string, count: number): CatalogBrand => ({ id, name, logoUrl: null, count });

describe("Crestron Home (marca virtual)", () => {
  const brands = [brand("s", "SONANCE", 600), brand("c", "Crestron", 1385), brand("t", "SoundTube", 364)];

  it("va justo después de Crestron y abre el filtro de Crestron Home", () => {
    const list = withCrestronHome(brands, 120);
    assert.deepEqual(list.map((b) => b.name), ["SONANCE", "Crestron", "Crestron Home", "SoundTube"]);
    assert.equal(brandQuery(list[2]), "crestron=1");
    assert.equal(brandQuery(list[1]), "brand=c");
  });

  it("sin productos compatibles no aparece", () => {
    assert.equal(withCrestronHome(brands, 0).length, 3);
  });

  it("el total no cuenta dos veces los productos de Crestron Home", () => {
    assert.equal(totalProducts(withCrestronHome(brands, 120)), 600 + 1385 + 364);
  });
});

describe("brandHref", () => {
  it("marca con productos: su listado", () => {
    assert.equal(brandHref(brand("c", "Crestron", 10), "/portal/products"), "/portal/products?brand=c");
  });
  it("marca sin productos todavía: la consulta", () => {
    assert.equal(brandHref(brand("b", "BrightSign", 0), "/catalogo"), "/catalogo/consultar?marca=b");
  });
  it("marca virtual: su filtro", () => {
    assert.equal(brandHref(withCrestronHome([brand("c", "Crestron", 10)], 5)[1], "/catalogo"), "/catalogo?crestron=1");
  });
});
