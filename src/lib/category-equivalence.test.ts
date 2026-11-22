import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveEquivalences, equivalenceKey, equivalenceLookupOrder } from "./category-equivalence";

test("clave de la ruta del proveedor: sin tildes, minúsculas y separadores unificados", () => {
  assert.equal(equivalenceKey("Lighting and Environmental > Cameo > Keypad Buttons"), "lighting and environmental > cameo > keypad buttons");
  assert.equal(equivalenceKey("Accessories / Parts"), "accessories > parts");
  assert.equal(equivalenceKey("accessories>parts"), "accessories > parts");
  assert.equal(equivalenceKey("  Iluminación  ›  Dímers "), "iluminacion > dimers");
  assert.equal(equivalenceKey("In-Ceiling/In-wall"), "in-ceiling/in-wall", "una barra pegada no separa");
  assert.equal(equivalenceKey(""), "");
  assert.equal(equivalenceKey(null), "");
});

test("sugiere solo con ≥90 % al mismo rubro y al menos 3 productos", () => {
  const rows = [
    ...Array.from({ length: 9 }, () => ({ brandKey: "st", sourcePath: "Pendant Speakers", categoryId: "colgantes" })),
    { brandKey: "st", sourcePath: "Pendant Speakers", categoryId: "otro" },
    ...Array.from({ length: 4 }, () => ({ brandKey: "st", sourcePath: "Accessories / Parts", categoryId: "accesorios" })),
    ...Array.from({ length: 4 }, () => ({ brandKey: "st", sourcePath: "Accessories / Parts", categoryId: "repuestos" })),
    ...Array.from({ length: 2 }, () => ({ brandKey: "st", sourcePath: "Subwoofers", categoryId: "subs" })),
    { brandKey: "cr", sourcePath: "Pendant Speakers", categoryId: "x" },
  ];
  const out = deriveEquivalences(rows);
  assert.equal(out.length, 1, "Accessories (50/50) y Subwoofers (2 productos) no se sugieren");
  assert.deepEqual(
    { brandKey: out[0].brandKey, sourceKey: out[0].sourceKey, categoryId: out[0].categoryId, sampleCount: out[0].sampleCount, sampleShare: out[0].sampleShare },
    { brandKey: "st", sourceKey: "pendant speakers", categoryId: "colgantes", sampleCount: 9, sampleShare: 0.9 }
  );
});

test("no sugiere rutas que no dicen qué es el producto (discontinuados o solo la marca)", () => {
  const rows = (path: string, brandName = "Rockustics") =>
    Array.from({ length: 5 }, () => ({ brandKey: "b", brandName, sourcePath: path, categoryId: "c" }));
  assert.equal(deriveEquivalences(rows("Inactive > Discontinued > H")).length, 0);
  assert.equal(deriveEquivalences(rows("Rockustics")).length, 0);
  assert.equal(deriveEquivalences(rows("Phase Tech", "Phase Tech")).length, 0);
  assert.equal(deriveEquivalences(rows("Pendant Speakers")).length, 1);
});

test("ignora productos sin ruta del proveedor o sin rubro", () => {
  assert.deepEqual(deriveEquivalences([{ brandKey: "", sourcePath: null, categoryId: "a" }, { brandKey: "", sourcePath: "x", categoryId: null }]), []);
});

test("busca de la equivalencia más específica a la más general", () => {
  assert.deepEqual(equivalenceLookupOrder("crestron", "b1"), [
    { source: "crestron", brandKey: "b1" },
    { source: "crestron", brandKey: "" },
    { source: "*", brandKey: "b1" },
    { source: "*", brandKey: "" },
  ]);
  assert.deepEqual(equivalenceLookupOrder("crestron", ""), [
    { source: "crestron", brandKey: "" },
    { source: "*", brandKey: "" },
  ]);
});
