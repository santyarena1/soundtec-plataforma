/** Planilla «Para revisar»: correcciones sobre la hoja de productos de la lista. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyCorrections, type Correction } from "./corrections";

const HEAD = ["Item Number/SKU", "Item Description", "SPRDIS US", "MUP", "FAMILIA"];
const list = (): unknown[][] => [
  ["LISTA"],
  HEAD,
  ["MSK-1", "Actuator", 176.4, 2.75, "Transductor"], // fila 3
  ["OS-440", "Amp", 310.8, 3.05, "Amplifier"], // fila 4
  ["CM31 MP", "Master pack", 410, 2.75, "Embutir"], // fila 5
  ["OMNI 8", "Planter", 379, 3.05, "Landscape"], // fila 6
  ["KIT - X", "Kit", 350, 2.75, "Wireless"], // fila 7
];
const values = (r: unknown[]) => Object.fromEntries(HEAD.map((h, i) => [h.toLowerCase(), r[i]]));
const c = (sheet: string, row: number, answer: string, r: unknown[]): Correction => ({ sheet, row, answer, values: values(r) });

describe("applyCorrections", () => {
  it("aplica valores editados, ELIMINAR, marca y SKU corregido sin correr la numeración", () => {
    const { grid, report } = applyCorrections(list(), [
      c("1 Repetido distinto", 4, "", ["OS-440", "Amp", 310.8, 2.75, "Amplifier"]),
      c("2 Repetido igual", 6, "", ["OMNI 8", "Planter", 379, 3.05, "Planter"]),
      c("3 Sin precios grises", 7, "PHASE TECH", ["KIT - X", "Kit", 350, 2.75, "Wireless"]),
      c("4 SKU con espacios", 5, "ELIMINAR", ["CM31 MP", "Master pack", 410, 2.75, "Embutir"]),
      // Copia sin tocar de la misma fila en otra hoja: no pisa la corrección.
      c("4 SKU con espacios", 6, "CORRECTO", ["OMNI 8", "Planter", 379, 3.05, "Landscape"]),
      c("4 SKU con espacios", 7, "CORRECTO", ["KIT-X", "Kit", 350, 2.75, "Wireless"]),
    ]);
    assert.equal(grid[3]![3], 2.75);
    assert.equal(grid[5]![4], "Planter");
    assert.deepEqual(grid[4], []);
    assert.equal(grid[6]![0], "KIT-X");
    assert.equal(grid[6]![5], "PHASE TECH");
    assert.equal(grid[1]![5], "MARCA");
    assert.equal(report.deleted.length, 1);
    assert.deepEqual(report.renamed, [{ from: "KIT - X", to: "KIT-X" }]);
  });

  it("no toca una fila si el SKU no coincide con la lista", () => {
    const { grid, report } = applyCorrections(list(), [c("1 Repetido distinto", 3, "", ["OTRO", "x", 1, 9, "y"])]);
    assert.equal(grid[2]![3], 2.75);
    assert.equal(report.skipped.length, 1);
  });

  it("OK en un repetido deja esa fila y saca las otras del mismo SKU", () => {
    const g = list();
    g.push(["MSK-1", "Actuator", 176.4, 3.05, "Actuator"]); // fila 8
    const { grid } = applyCorrections(g, [c("1 Repetido distinto", 3, "OK", ["MSK-1", "Actuator", 176.4, 2.75, "Transductor"])]);
    assert.deepEqual(grid[7], []);
    assert.equal(grid[2]![0], "MSK-1");
  });
});
