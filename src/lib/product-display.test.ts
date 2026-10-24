import { test } from "node:test";
import assert from "node:assert/strict";
import { productSubtitle, productTitle, tangoCode } from "./product-display";

test("el título es el modelo, para todas las marcas", () => {
  assert.equal(productTitle({ normalizedName: "PPX8", originalName: "PPX8 SUBWOOFER | PASSIVE 8\" POWERPIPE" }), "PPX8");
  assert.equal(productTitle({ normalizedName: "SM400I-WH", originalName: "4\" In-Wall Speaker" }), "SM400I-WH");
  assert.equal(productTitle({ normalizedName: "  ", modelNumber: "CM62" }), "CM62");
});

test("debajo va la descripción en español; si no hay, la del fabricante", () => {
  assert.equal(productSubtitle({ normalizedName: "PPX8", shortDescription: "Subwoofer pasivo de 8\"", originalName: "PPX8 SUBWOOFER" }), "Subwoofer pasivo de 8\"");
  assert.equal(productSubtitle({ normalizedName: "BLOCKROCK-ML", shortDescription: null, originalName: "6.5\" Outdoor Monument Speaker" }), "6.5\" Outdoor Monument Speaker");
});

test("no repite el modelo como descripción", () => {
  assert.equal(productSubtitle({ normalizedName: "SW-HS-1-C", originalName: "SW-HS-1-C", shortDescription: "" }), null);
  assert.equal(productSubtitle({ normalizedName: "VLS100-LCR", originalName: "vls100-lcr" }), null);
});

test("Código Tango: se muestra si es legible; un id interno no", () => {
  assert.equal(tangoCode("3001592"), "3001592");
  assert.equal(tangoCode("7375cfa1-4e94-419c-95f3-b3fe007f5601"), null);
  assert.equal(tangoCode(null), null);
});
