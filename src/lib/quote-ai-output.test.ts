import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analysisSchema,
  cleanProjectTitle,
  composeItemDescription,
  itemRewriteSchema,
  parseGeneratedSections,
} from "./quote-ai-output";

const LONG = "La sala se resuelve con una barra de videoconferencia y un panel en la mesa.";

test("acepta body o content y descarta tipos desconocidos", () => {
  const map = parseGeneratedSections({
    sections: [
      { type: "proposal", body: `<p>${LONG}</p>` },
      { type: "design_criteria", content: `<ul><li>${LONG}</li></ul>` },
      { type: "key_products", content: LONG },
      { type: "intro", body: LONG },
    ],
  });
  assert.deepEqual([...map.keys()], ["proposal", "design_criteria", "key_products"]);
  assert.equal(map.get("key_products"), LONG);
});

test("sanea el HTML devuelto", () => {
  const map = parseGeneratedSections({
    sections: [{ type: "functionality", body: `<p onclick="x()">${LONG}</p><script>alert(1)</script>` }],
  });
  const body = map.get("functionality") || "";
  assert.ok(!/<script|onclick/i.test(body), body);
  assert.match(body, /videoconferencia/);
});

test("ignora cuerpos vacíos o demasiado cortos y respuestas sin sections", () => {
  assert.equal(parseGeneratedSections({ sections: [{ type: "proposal", body: "  " }] }).size, 0);
  assert.equal(parseGeneratedSections({ sections: [{ type: "proposal", body: "<p>Ok.</p>" }] }).size, 0);
  assert.equal(parseGeneratedSections({}).size, 0);
  assert.equal(parseGeneratedSections("nada").size, 0);
  assert.equal(parseGeneratedSections({ sections: "x" }).size, 0);
});

test("quita fences de markdown", () => {
  const map = parseGeneratedSections({ sections: [{ type: "proposal", body: "```html\n<p>" + LONG + "</p>\n```" }] });
  assert.equal(map.get("proposal"), `<p>${LONG}</p>`);
});

test("cleanProjectTitle descarta referencias inventadas", () => {
  assert.equal(cleanProjectTitle("PROP-001"), "");
  assert.equal(cleanProjectTitle("Propuesta Nº 15 sala"), "");
  assert.equal(cleanProjectTitle("COT 2024"), "");
  assert.equal(cleanProjectTitle("Sala de directorio — Puerto Madero"), "Sala de directorio — Puerto Madero");
  assert.equal(cleanProjectTitle(""), "");
});

test("analysisSchema normaliza cantidades y filtra ítems vacíos", () => {
  const out = analysisSchema.parse({
    projectTitle: "Auditorio",
    facts: [{ text: "200 butacas" }, "grabación"],
    items: [
      { search: "Shure ULXD4Q", quantity: 0, kind: "PRODUCT" },
      { search: "", quantity: 2, kind: "PRODUCT" },
      { search: "Instalación", quantity: "3", kind: "SERVICE", serviceType: "instalacion" },
      { search: "Algo", quantity: 1, kind: "OTRO" },
    ],
  });
  assert.deepEqual(out.facts, [{ text: "200 butacas" }, { text: "grabación" }]);
  assert.equal(out.items.length, 3);
  assert.equal(out.items[0].quantity, 1);
  assert.equal(out.items[1].quantity, 3);
  assert.equal(out.items[2].kind, "PRODUCT");
  assert.deepEqual(out.assumptions, []);
});

test("itemRewriteSchema exige description string", () => {
  assert.equal(itemRewriteSchema.safeParse({ description: 3 }).success, false);
  assert.equal(itemRewriteSchema.safeParse({ description: "  " }).success, false);
  const ok = itemRewriteSchema.parse({ description: "Barra de video", quantity: 0 });
  assert.equal(ok.quantity, null);
});

test("composeItemDescription conserva el título de la fila", () => {
  const original = "Crestron — UC-BX30-T\nTexto viejo";
  assert.equal(
    composeItemDescription(original, "Barra de videoconferencia para Teams."),
    "Crestron — UC-BX30-T\nBarra de videoconferencia para Teams."
  );
  // Si la IA repite el título, no se duplica.
  assert.equal(composeItemDescription(original, "Crestron — UC-BX30-T\nBarra de video."), "Crestron — UC-BX30-T\nBarra de video.");
});

test("composeItemDescription saca líneas «[a confirmar]»", () => {
  const out = composeItemDescription("Equipo X", "Línea buena.\nPotencia: [a confirmar]\nOtra buena.");
  assert.equal(out, "Equipo X\nLínea buena.\nOtra buena.");
  // Si no queda nada, deja el original.
  assert.equal(composeItemDescription("Equipo X\nviejo", "[a confirmar]"), "Equipo X\nviejo");
});
