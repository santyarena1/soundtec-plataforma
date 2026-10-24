import { test } from "node:test";
import assert from "node:assert/strict";
import { applySyncFieldPolicy, isEmptyValue } from "./field-policy";

const decimal = (n: number) => ({ toNumber: () => n, toString: () => String(n) });

test("el precio y el stock se actualizan siempre", () => {
  const out = applySyncFieldPolicy(
    { baseCostUsd: decimal(100), discountPercent: decimal(5), stockStatus: "IN_STOCK", salePriceUsd: null },
    { baseCostUsd: 120, discountPercent: 0, stockStatus: "OUT_OF_STOCK", salePriceUsd: 99 }
  );
  assert.deepEqual(out, { baseCostUsd: 120, discountPercent: 0, stockStatus: "OUT_OF_STOCK", salePriceUsd: 99 });
});

test("lo cargado a mano no se pisa (descripción, rubro, familia)", () => {
  const out = applySyncFieldPolicy(
    { shortDescription: "Texto corregido a mano", categoryId: "rubro-manual", familia: "Planter", weight: decimal(2) },
    { shortDescription: "Texto del proveedor", categoryId: "rubro-proveedor", familia: "Bafle", weight: 3 }
  );
  assert.deepEqual(out, {});
});

test("lo vacío se completa con lo que trae el proveedor", () => {
  const out = applySyncFieldPolicy(
    { shortDescription: "  ", longDescription: null, specifications: [], familyId: undefined },
    { shortDescription: "Corta", longDescription: "Larga", specifications: [{ k: "v" }], familyId: "fam" }
  );
  assert.deepEqual(out, { shortDescription: "Corta", longDescription: "Larga", specifications: [{ k: "v" }], familyId: "fam" });
});

test("lo que el proveedor no manda (undefined) no se toca", () => {
  assert.deepEqual(applySyncFieldPolicy({ baseCostUsd: decimal(1) }, { baseCostUsd: undefined }), {});
});

test("vacío: null, texto en blanco, lista u objeto vacíos; un Decimal en 0 no es vacío", () => {
  for (const v of [null, undefined, "", "   ", [], {}]) assert.equal(isEmptyValue(v), true, JSON.stringify(v));
  for (const v of [0, false, "x", [1], { a: 1 }, decimal(0), new Date()]) assert.equal(isEmptyValue(v), false, String(v));
});
