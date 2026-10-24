import { test } from "node:test";
import assert from "node:assert/strict";
import { avoidedBrands, buildBriefBlocks, hasRealBrief, humanContextNotes, readQuoteIntake } from "./quote-ai-brief";

const emptyIntake = readQuoteIntake(null);

test("brief vacío o «{}» no cuenta como pedido", () => {
  assert.equal(hasRealBrief({ brief: null, intake: emptyIntake }), false);
  assert.equal(hasRealBrief({ brief: "{}", intake: readQuoteIntake({}) }), false);
  assert.equal(
    hasRealBrief({ brief: "   ", notes: "", intake: readQuoteIntake({ source: "customer_request", requestId: "x" }) }),
    false
  );
  assert.equal(hasRealBrief({ brief: "sala", intake: emptyIntake }), false);
});

test("brief con texto, notas o datos de relevamiento cuentan", () => {
  assert.equal(hasRealBrief({ brief: "Sala de reuniones para 8 personas con Teams", intake: emptyIntake }), true);
  assert.equal(hasRealBrief({ brief: null, notes: "El cliente quiere todo Crestron", intake: emptyIntake }), true);
  assert.equal(hasRealBrief({ brief: null, intake: readQuoteIntake({ people: "20" }) }), true);
  assert.equal(hasRealBrief({ brief: null, intake: readQuoteIntake({ notes: "Auditorio con grabación de charlas" }) }), true);
});

test("readQuoteIntake tolera formas raras", () => {
  assert.deepEqual(readQuoteIntake([1, 2]), emptyIntake);
  assert.equal(readQuoteIntake({ areaM2: 120 }).areaM2, "120");
});

test("avoidedBrands separa por coma, punto y coma o «y»", () => {
  assert.deepEqual(avoidedBrands(readQuoteIntake({ brandAvoid: "Bose, JBL y Yamaha" })), ["bose", "jbl", "yamaha"]);
});

test("humanContextNotes saca líneas del sistema", () => {
  const notes =
    "Generada desde el pedido #ABC123.\nSuele ir junto (planillas históricas): X\nHistórico: Y (3)\nEl cliente no quiere cables a la vista";
  assert.equal(humanContextNotes(notes), "El cliente no quiere cables a la vista");
});

test("buildBriefBlocks etiqueta todo y deja los patrones como referencia al final", () => {
  const text = buildBriefBlocks({
    brief: "Sala de directorio para 12 personas",
    contextNotes: "Nada inalámbrico",
    intake: readQuoteIntake({ notes: "Nada inalámbrico", areaM2: "40", people: "12", budgetUsd: "15000", brandAvoid: "Bose" }),
    projectType: "Sala de reuniones",
    classification: "Corporativo · Mediana",
    planNotes: ["Mesa central de 5 m"],
    patternBlock: "Equipos que suelen usarse: Crestron UC-BX30-T",
  });
  for (const label of [
    "[PEDIDO DEL CLIENTE",
    "[NOTAS DEL COMERCIAL",
    "[RELEVAMIENTO]",
    "[TIPO DE PROYECTO]",
    "[LECTURA DE PLANOS",
    "[REFERENCIA INTERNA",
  ]) {
    assert.ok(text.includes(label), label);
  }
  assert.ok(text.includes("No ofrecer: Bose"));
  assert.ok(text.includes("Superficie: 40 m²"));
  // Notas duplicadas (context + intake) salen una vez.
  assert.equal(text.split("Nada inalámbrico").length - 1, 1);
  assert.ok(text.indexOf("[REFERENCIA INTERNA") > text.indexOf("[PEDIDO DEL CLIENTE"));
  assert.ok(!text.includes("prioridad alta"));
});

test("buildBriefBlocks no agrega bloques vacíos", () => {
  const text = buildBriefBlocks({ brief: "Auditorio 200 butacas", intake: emptyIntake, planNotes: [] });
  assert.equal(text, "[PEDIDO DEL CLIENTE — manda]\nAuditorio 200 butacas");
});
