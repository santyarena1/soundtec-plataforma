import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToPlainText, longDescriptionInput, longFactsForPrompt, shortFactsForPrompt } from "./ai-description-context";

const product = {
  normalizedName: "AM-8",
  originalName: "AMP AM-8 8CH",
  modelNumber: "AM-8",
  shortDescription: "Amplificador de 8 canales.",
  specifications: [{ label: "Power", labelEs: "Potencia", value: "8 x 60 W" }, { foo: 1 }],
  keyFeatures: ["Control por IP", "", 3],
  htmlContent: "<div><h2>Overview</h2><p>Eight-channel amplifier &amp; DSP.</p><script>x()</script></div>",
  sourceCategoryPath: "Amplifiers > Multi-channel",
  productLine: null,
  brand: { name: "Sonance" },
  category: { name: "Amplificadores", tangoPath: "SONIDO > AMPLIFICADORES" },
  series: { name: "Professional" },
};

test("la larga recibe specs, características, serie, rubro completo y extracto del HTML oficial", () => {
  const input = longDescriptionInput(product);
  assert.equal(input.name, "AM-8");
  assert.equal(input.brand, "Sonance");
  assert.equal(input.category, "Sonido › Amplificadores");
  assert.equal(input.short, "Amplificador de 8 canales.");
  const facts = longFactsForPrompt(input.facts!);
  assert.match(facts, /Serie: Professional/);
  assert.match(facts, /Categoría del fabricante: Amplifiers > Multi-channel/);
  assert.match(facts, /Potencia: 8 x 60 W/);
  assert.match(facts, /Características: Control por IP$/m);
  assert.match(facts, /Extracto de la ficha oficial del fabricante: Overview Eight-channel amplifier & DSP\./);
  assert.doesNotMatch(facts, /x\(\)/);
});

test("lo escrito y no guardado (edición rápida) manda sobre lo guardado", () => {
  const input = longDescriptionInput(product, { name: "AM-8 nuevo", short: "  " });
  assert.equal(input.name, "AM-8 nuevo");
  assert.equal(input.short, undefined);
});

test("la corta no lleva el HTML oficial; sin datos no hay líneas", () => {
  assert.doesNotMatch(shortFactsForPrompt({ officialHtml: "<p>Texto</p>", modelNumber: "X" }), /oficial/);
  assert.equal(longFactsForPrompt({}), "");
  assert.equal(htmlToPlainText(null), "");
});
