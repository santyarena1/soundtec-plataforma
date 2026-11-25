import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aiGeneratedFields, isLongDescriptionAiGenerated, longDescriptionComesFromOfficialHtml } from "./ai-content";

const generated = {
  aiGeneratedDescription: true,
  aiDescriptionFeedbackStatus: "PENDING",
  longDescription: "El módulo C2N de Crestron es una solución versátil para integrar sistemas audiovisuales.",
  htmlContent: null,
};

describe("cartel «Generado con IA» por campo", () => {
  it("la descripción larga generada con IA lleva el cartel", () => {
    assert.equal(isLongDescriptionAiGenerated(generated), true);
    assert.equal(isLongDescriptionAiGenerated({ ...generated, aiDescriptionFeedbackStatus: "APPROVED" }), true);
  });

  it("el flag que dejó la descripción corta (sin estado de revisión) no marca la larga", () => {
    assert.equal(isLongDescriptionAiGenerated({ ...generated, aiDescriptionFeedbackStatus: null }), false);
  });

  it("sin flag o sin texto no hay cartel", () => {
    assert.equal(isLongDescriptionAiGenerated({ ...generated, aiGeneratedDescription: false }), false);
    assert.equal(isLongDescriptionAiGenerated({ ...generated, longDescription: "   " }), false);
    assert.equal(isLongDescriptionAiGenerated({ ...generated, aiGeneratedDescription: null }), false);
  });

  it("si el texto está en el HTML oficial del fabricante, es ficha oficial aunque esté marcado", () => {
    const long = "The C2N-VEQ4 provides a very simple solution for adding professional quality volume control, equalization, and signal routing.";
    const html = `<div><p>${long.replace("volume control", "volume&nbsp;control")}</p><ul><li>Four channels</li></ul></div>`;
    assert.equal(longDescriptionComesFromOfficialHtml(long, html), true);
    assert.equal(isLongDescriptionAiGenerated({ ...generated, longDescription: long, htmlContent: html }), false);
  });

  it("un HTML que no contiene el texto no lo «oficializa»", () => {
    assert.equal(isLongDescriptionAiGenerated({ ...generated, htmlContent: "<p>Altavoz colgante de 6,5 pulgadas</p>" }), true);
    // Textos cortos no alcanzan para decir que coinciden.
    assert.equal(longDescriptionComesFromOfficialHtml("Rejilla negra", "<p>Rejilla negra para bafle</p>"), false);
  });

  it("características, especificaciones y corto nunca llevan el cartel (traducir no es generar)", () => {
    const fields = aiGeneratedFields(generated);
    assert.deepEqual(fields, { longDescription: true, shortDescription: false, keyFeatures: false, specifications: false });
    assert.equal(aiGeneratedFields({ ...generated, aiGeneratedDescription: false }).longDescription, false);
  });
});
