import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCategoryCountTree, categoryAncestry, categoryChildren } from "./catalog-category-tree";

const nodes = [
  { id: "son", name: "Sonido", parentId: null },
  { id: "baf", name: "Bafles de embutir", parentId: "son" },
  { id: "techo", name: "Techo", parentId: "baf" },
  { id: "pared", name: "Pared", parentId: "baf" },
  { id: "amp", name: "Amplificadores", parentId: "son" },
  { id: "ctl", name: "Control", parentId: null },
  { id: "ind", name: "Indumentaria", parentId: null },
];

describe("árbol de rubros del catálogo", () => {
  const tree = buildCategoryCountTree(nodes, [
    { categoryId: "techo", count: 5 },
    { categoryId: "pared", count: 2 },
    { categoryId: "son", count: 1 },
    { categoryId: "ctl", count: 3 },
  ]);
  const count = (id: string) => tree.find((n) => n.id === id)?.count;

  it("cada nodo cuenta lo suyo y lo de sus subrubros", () => {
    assert.equal(count("techo"), 5);
    assert.equal(count("baf"), 7);
    assert.equal(count("son"), 8);
    assert.equal(count("ctl"), 3);
  });

  it("los rubros sin productos (ni abajo) no aparecen", () => {
    assert.equal(count("amp"), undefined);
    assert.equal(count("ind"), undefined);
  });

  it("principales e hijos ordenados por cantidad", () => {
    assert.deepEqual(categoryChildren(null, tree).map((n) => n.id), ["son", "ctl"]);
    assert.deepEqual(categoryChildren("baf", tree).map((n) => n.id), ["techo", "pared"]);
  });

  it("arma el camino desde el rubro principal", () => {
    assert.deepEqual(categoryAncestry("techo", tree).map((n) => n.name), ["Sonido", "Bafles de embutir", "Techo"]);
    assert.deepEqual(categoryAncestry("nada", tree), []);
    assert.deepEqual(categoryAncestry(null, tree), []);
  });

  it("no se cuelga con un ciclo en el árbol", () => {
    const loop = [
      { id: "a", name: "A", parentId: "b" },
      { id: "b", name: "B", parentId: "a" },
    ];
    const result = buildCategoryCountTree(loop, [{ categoryId: "a", count: 1 }]);
    assert.equal(result.find((n) => n.id === "a")?.count, 1);
    assert.equal(categoryAncestry("a", result).length, 2);
  });
});
