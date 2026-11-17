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

import { hasConfigurator } from "./product-display";
import { documentKind } from "./document-kind";

test("«Configurable» solo con opciones de configurador cargadas", () => {
  assert.equal(hasConfigurator({ isCustomizable: true, optionCount: 0 }), false);
  assert.equal(hasConfigurator({ isCustomizable: false, optionCount: 3 }), false);
  assert.equal(hasConfigurator({ isCustomizable: true, optionCount: 2 }), true);
});

test("documentación: el formato sale de la extensión, no del tipo de almacenamiento", () => {
  assert.deepEqual(documentKind({ type: "image", url: "https://res.cloudinary.com/x/image/upload/v1/spec.pdf" }), {
    format: "PDF",
    category: null,
    label: "PDF",
    isImage: false,
  });
  assert.equal(documentKind({ type: "raw", url: "https://cdn.x/plano-VXXT6.dxf" }).label, "DXF (CAD)");
  assert.equal(documentKind({ type: "raw", url: "https://cdn.x/archivo.zip?dl=1" }).label, "ZIP");
  assert.equal(documentKind({ type: "Spec Sheets", url: "https://x/doc.pdf" }).label, "Hoja técnica · PDF");
  assert.equal(documentKind({ type: "Guides & Manuals", url: "https://x/manual" }).label, "Guías y manuales");
  assert.equal(documentKind({ type: "application/pdf", url: "https://x/descarga" }).label, "PDF");
  assert.equal(documentKind({ type: "Multimedia", url: "https://x/foto.JPG" }).isImage, true);
  assert.equal(documentKind({ type: "raw", url: "https://x/sin-extension" }).label, null);
});

import { pickRecentArrivals } from "./recent-arrivals";

test("recién llegados: sin foto o con el logo de la marca como foto, no entran", () => {
  const logo = "https://cdn/x/logo-james.png";
  const rows = [
    { id: "a", images: [{ url: logo }] },
    { id: "b", images: [] },
    { id: "c", images: [{ url: "https://cdn/x/fxa550.png" }] },
    { id: "d", images: [{ url: "https://cdn/x/fxa550.png" }] },
    { id: "e", images: [{ url: "https://cdn/x/stake.png" }] },
  ];
  const usage = new Map([[logo, 57], ["https://cdn/x/fxa550.png", 2]]);
  assert.deepEqual(pickRecentArrivals(rows, usage, 6).map((r) => r.id), ["c", "e"]);
  assert.deepEqual(pickRecentArrivals(rows, usage, 1).map((r) => r.id), ["c"]);
});

import { SOUNDTEC_PHONE, displayCompanyPhone } from "./company-contact";

test("teléfono de Soundtec: un solo formato en todos lados", () => {
  assert.equal(SOUNDTEC_PHONE, "+54 11 4586-0400");
  assert.equal(displayCompanyPhone("(+ 54 11) 4586 0400"), SOUNDTEC_PHONE);
  assert.equal(displayCompanyPhone("(+54 11) 4586-0400"), SOUNDTEC_PHONE);
  assert.equal(displayCompanyPhone("11 4586-0400"), SOUNDTEC_PHONE);
  assert.equal(displayCompanyPhone(""), SOUNDTEC_PHONE);
  // Otro número cargado en Configuración se respeta.
  assert.equal(displayCompanyPhone("+54 11 5555-1234"), "+54 11 5555-1234");
});
