/**
 * Regla de nombres: en Soundtec el nombre del producto es su código
 * (modelo de Sonance, SKU de SoundTube), no el título descriptivo del portal.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { codeNameFor, isSonancePortalBrand } from "./product-code-name";

describe("codeNameFor", () => {
  it("usa el modelNumber para las marcas del portal Sonance", () => {
    assert.equal(
      codeNameFor({ source: "sonance", modelNumber: "DSP 2-150 MKIII", supplierSku: "93542" }),
      "DSP 2-150 MKIII"
    );
    assert.equal(
      codeNameFor({ source: "sonance", modelNumber: "  VP82R ", supplierSku: "93016" }),
      "VP82R"
    );
  });

  it("no inventa nombre si Sonance no manda modelNumber", () => {
    assert.equal(codeNameFor({ source: "sonance", modelNumber: "", supplierSku: "93542" }), null);
    assert.equal(codeNameFor({ source: "sonance", modelNumber: null, supplierSku: "93542" }), null);
  });

  it("usa el SKU para SoundTube", () => {
    assert.equal(
      codeNameFor({ source: "soundtube", modelNumber: null, supplierSku: "CM31-EZ-BK" }),
      "CM31-EZ-BK"
    );
    assert.equal(codeNameFor({ source: "soundtube", modelNumber: "x", supplierSku: " " }), null);
  });
});

describe("isSonancePortalBrand", () => {
  it("reconoce las marcas que entran por el portal Sonance", () => {
    for (const brand of ["SONANCE", "BLAZE BY SONANCE", "JAMES", "IPORT", "TRUFIG", "sonance"]) {
      assert.equal(isSonancePortalBrand(brand), true, brand);
    }
  });

  it("deja afuera Crestron y las marcas de SoundTube", () => {
    for (const brand of ["Crestron", "SoundTube", "Phase Technology", null, undefined]) {
      assert.equal(isSonancePortalBrand(brand), false, String(brand));
    }
  });
});
