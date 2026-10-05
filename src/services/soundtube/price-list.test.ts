/**
 * Lector de la lista de precios SoundTube en Excel: encabezados, costo/MUP,
 * clasificación y duplicados.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parsePriceListGrid, skuKey } from "./price-list";

const HEADER = [
  "Item Number/SKU", "Item Description", "MSRP/MAP", "SPRDIS CH", "SPRDIS EU", "SPRDIS US",
  "MUP", "PRECIO", "CATEGORIA", "SEGMENTO", "FAMILIA", "TIPO",
];

function grid(...rows: unknown[][]): unknown[][] {
  return [["LISTA SOUNDTUBE 2609 - CONFIDENCIAL -"], HEADER, ...rows];
}

describe("parsePriceListGrid", () => {
  it("toma SKU, costo SPRDIS US, MUP y clasificación; ignora PRECIO y grises", () => {
    const parsed = parsePriceListGrid(
      grid(["CM31-EZ-BK", "3\" In Ceiling Speaker in Black", 133, 53.55, 59.85, 56.7, 2.75, 155.925, "Bafle", "Comercial", "Embutir", "Ceiling Mount"])
    );
    assert.deepEqual(parsed.rows, [
      {
        excelRow: 3,
        sku: "CM31-EZ-BK",
        description: "3\" In Ceiling Speaker in Black",
        costUsd: 56.7,
        mup: 2.75,
        categoria: "Bafle",
        segmento: "Comercial",
        familia: "Embutir",
        tipo: "Ceiling Mount",
      },
    ]);
    assert.equal(parsed.warnings.length, 0);
  });

  it("en duplicados usa la última fila y avisa si cambia el precio", () => {
    const parsed = parsePriceListGrid(
      grid(
        ["MSK-1", "Actuator", "", "", "", 176.4, 2.75],
        ["CB5", "Cherry Bomb", "", "", "", 401.1, 3.05],
        ["msk-1", "Actuator", "", "", "", 176.4, 3.05],
        ["CB5", "Cherry Bomb", "", "", "", 401.1, 3.05]
      )
    );
    assert.equal(parsed.rows.length, 2);
    const msk = parsed.rows.find((r) => skuKey(r.sku) === "MSK-1");
    assert.equal(msk?.mup, 3.05);
    assert.equal(msk?.excelRow, 5);
    assert.equal(parsed.warnings.length, 1, "CB5 repetido igual no avisa");
    assert.deepEqual(parsed.warnings[0].excelRows, [3, 5]);
  });

  it("informa los repetidos con clasificación distinta, una opción por clasificación", () => {
    const parsed = parsePriceListGrid(
      grid(
        ["MSK-1", "x", "", "", "", 176.4, 2.75, "", "Bafle", "Comercial", "Transductor", "Sound Masking"],
        ["MSK-1", "x", "", "", "", 176.4, 2.75, "", "Bafle", "Comercial", "Actuator", "Sound Masking"],
        ["CB5", "x", "", "", "", 401.1, 3.05, "", "Bafle", "Exterior", "Landscape", "Bullet"],
        ["CB5", "x", "", "", "", 401.1, 3.05, "", "Bafle", "Exterior", "Landscape", "Bullet"]
      )
    );
    assert.equal(parsed.classificationConflicts.length, 1);
    assert.equal(parsed.classificationConflicts[0].sku, "MSK-1");
    assert.deepEqual(parsed.classificationConflicts[0].options.map((o) => o.familia), ["Transductor", "Actuator"]);
    assert.equal(parsed.warnings.length, 0, "mismo costo y MUP: no es aviso de precio");
  });

  it("descarta filas sin costo o con MUP inválido", () => {
    const parsed = parsePriceListGrid(
      grid(["A-1", "x", "", "", "", "", 3.05], ["A-2", "x", "", "", "", 10, 0], ["", "", "", "", "", 5, 2])
    );
    assert.equal(parsed.rows.length, 0);
    assert.deepEqual(parsed.invalid.map((i) => i.sku), ["A-1", "A-2"]);
  });

  it("acepta números con coma decimal", () => {
    const parsed = parsePriceListGrid(grid(["A-1", "x", "", "", "", "1.234,5", "3,05"]));
    assert.equal(parsed.rows[0].costUsd, 1234.5);
    assert.equal(parsed.rows[0].mup, 3.05);
  });

  it("falla con mensaje claro si faltan columnas", () => {
    assert.throws(() => parsePriceListGrid([["SKU", "Precio"]]), /Item Number\/SKU/);
  });
});

describe("skuKey", () => {
  it("compara sin importar mayúsculas ni espacios repetidos", () => {
    assert.equal(skuKey(" OmniPlanter  8.0-GG/T "), "OMNIPLANTER 8.0-GG/T");
  });
});
