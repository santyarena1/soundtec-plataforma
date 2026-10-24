import { test } from "node:test";
import assert from "node:assert/strict";
import { TONE_RULES, findGenericPhrases } from "./quote-ai-tone";
import { featureLines, hasProductFacts, productFactsBlock, specLines } from "./quote-ai-items";

test("detecta muletillas aunque estén en HTML o con acentos distintos", () => {
  const text =
    "<p>Nuestra propuesta, de <strong>alta gama</strong>, es una Solución Integral garantizando una experiencia fluida desde el primer día.</p>";
  const found = findGenericPhrases(text);
  for (const p of ["alta gama", "solución integral", "garantizando una experiencia", "desde el primer día"]) {
    assert.ok(found.includes(p), p);
  }
  assert.ok(findGenericPhrases("Equipo de ultima generacion").includes("última generación"));
});

test("no marca texto concreto ni palabras que contienen la frase", () => {
  assert.deepEqual(findGenericPhrases("La barra se monta sobre la pantalla y el panel va en la mesa."), []);
  // «robustez» no es «robusto»
  assert.deepEqual(findGenericPhrases("Se evaluó la robustez del soporte."), []);
});

test("las reglas de tono incluyen la lista negra y un ejemplo", () => {
  assert.match(TONE_RULES, /«alta gama»/);
  assert.match(TONE_RULES, /EJEMPLO DEL REGISTRO/);
});

test("ficha de producto: specs y features reales, aviso si no hay ficha", () => {
  assert.deepEqual(
    specLines([
      { label: "Output", labelEs: "Salida", value: "HDMI", valueEs: "HDMI 2.0" },
      { label: "X", value: "" },
    ]),
    ["Salida: HDMI 2.0"]
  );
  assert.deepEqual(featureLines(["Teams certificado", "", 3]), ["Teams certificado"]);
  const block = productFactsBlock({
    quantity: 2,
    facts: { brand: "Crestron", name: "TSW-770", specifications: [{ label: "Pantalla", value: "7 in" }] },
  });
  assert.match(block, /^- 2 × Crestron TSW-770/);
  assert.match(block, /Specs: Pantalla: 7 in/);
  const bare = productFactsBlock({ quantity: 1, facts: { name: "Botonera" } });
  assert.match(bare, /sin ficha técnica/);
});

test("hasProductFacts: sin ficha ni nombre descriptivo no hay datos", () => {
  assert.equal(hasProductFacts({ normalizedName: "CB2-BTNLAT-T_ENGRAVED", originalName: "CB2-BTNLAT-T_ENGRAVED" }), false);
  assert.equal(hasProductFacts({ normalizedName: "X1", specifications: [{ label: "a", value: "b" }] }), true);
  assert.equal(hasProductFacts({ normalizedName: "PS-C85RT", originalName: "Altavoz de techo serie profesional PS-C85RT" }), true);
});
