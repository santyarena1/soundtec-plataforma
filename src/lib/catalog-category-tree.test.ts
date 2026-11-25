import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCategoryCountTree, categoryAncestry, categoryChildren, compareCategoryNames } from "./catalog-category-tree";

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

  it("principales e hijos en orden alfabético (no por cantidad)", () => {
    assert.deepEqual(categoryChildren(null, tree).map((n) => n.id), ["ctl", "son"]);
    assert.deepEqual(categoryChildren("baf", tree).map((n) => n.id), ["pared", "techo"]);
  });

  it("el orden alfabético respeta acentos, ñ, mayúsculas y números (es-AR)", () => {
    const names = ["Video", "Ángulos", "audio", "Ñandú", "Nodos", "Accesorios", "Cable 10 m", "Cable 2 m", "Óptica", "Zócalos"];
    const sorted = [...names].sort(compareCategoryNames);
    assert.deepEqual(sorted, ["Accesorios", "Ángulos", "audio", "Cable 2 m", "Cable 10 m", "Nodos", "Ñandú", "Óptica", "Video", "Zócalos"]);
  });

  it("ordena alfabéticamente en todos los niveles del árbol", () => {
    const deep = buildCategoryCountTree(
      [
        { id: "v", name: "Video", parentId: null },
        { id: "a", name: "Audio", parentId: null },
        { id: "a2", name: "Parlantes", parentId: "a" },
        { id: "a1", name: "Amplificadores", parentId: "a" },
        { id: "a1b", name: "Clase D", parentId: "a1" },
        { id: "a1a", name: "Clase AB", parentId: "a1" },
      ],
      [
        { categoryId: "v", count: 50 },
        { categoryId: "a2", count: 30 },
        { categoryId: "a1b", count: 9 },
        { categoryId: "a1a", count: 1 },
      ]
    );
    assert.deepEqual(categoryChildren(null, deep).map((n) => n.name), ["Audio", "Video"]);
    assert.deepEqual(categoryChildren("a", deep).map((n) => n.name), ["Amplificadores", "Parlantes"]);
    assert.deepEqual(categoryChildren("a1", deep).map((n) => n.name), ["Clase AB", "Clase D"]);
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
