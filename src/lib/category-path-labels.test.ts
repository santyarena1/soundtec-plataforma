import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryPathLabel, categoryPathLabels } from "./category-tree";

const nodes = [
  { id: "s", name: "Sonido", parentId: null, level: 1 },
  { id: "b", name: "Bafles pasivos", parentId: "s", level: 2 },
  { id: "e", name: "Bafles de embutir", parentId: "b", level: 3 },
  { id: "v", name: "Video", parentId: null, level: 1 },
];

test("arma la ruta completa de cada nodo, igual que categoryPathLabel", () => {
  const labels = categoryPathLabels(nodes);
  assert.equal(labels.get("e"), "Sonido › Bafles pasivos › Bafles de embutir");
  assert.equal(labels.get("v"), "Video");
  for (const n of nodes) assert.equal(labels.get(n.id), categoryPathLabel(n.id, nodes));
});

test("un padre que no existe corta la ruta y un ciclo no cuelga", () => {
  const labels = categoryPathLabels([
    { id: "x", name: "Huérfano", parentId: "falta" },
    { id: "a", name: "A", parentId: "c" },
    { id: "c", name: "C", parentId: "a" },
  ]);
  assert.equal(labels.get("x"), "Huérfano");
  assert.ok(labels.get("a")?.endsWith("A"));
});

test("con miles de rubros responde rápido (antes rearmaba el índice por cada nodo)", () => {
  const many = Array.from({ length: 4000 }, (_, i) => ({ id: `n${i}`, name: `R${i}`, parentId: i ? `n${Math.floor((i - 1) / 3)}` : null, level: 1 }));
  const started = Date.now();
  const labels = categoryPathLabels(many);
  assert.equal(labels.size, 4000);
  assert.ok(Date.now() - started < 300);
});
