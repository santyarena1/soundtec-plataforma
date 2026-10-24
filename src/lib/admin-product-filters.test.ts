import { test } from "node:test";
import assert from "node:assert/strict";
import { adminProductFiltersSchema, hasAdminProductFilters, parseAdminProductFilters } from "./admin-product-filters";

test("lee los filtros de la URL igual que el listado", () => {
  const f = parseAdminProductFilters({
    q: "  cámara ",
    brand: ["b1", "b2"],
    category: "c1,c2",
    stock: ["IN_STOCK", "CUALQUIERA"],
    active: "no",
    noimg: "1",
    feedback: "errors",
  });
  assert.equal(f.q, "cámara");
  assert.deepEqual(f.brandIds, ["b1", "b2"]);
  assert.deepEqual(f.categoryIds, ["c1", "c2"]);
  assert.deepEqual(f.stockStatuses, ["IN_STOCK"]);
  assert.equal(f.active, "no");
  assert.equal(f.noimg, true);
  assert.equal(f.nocat, false);
  assert.equal(f.feedback, true);
});

test("sin parámetros no hay filtros (no se puede tocar todo el catálogo)", () => {
  assert.equal(hasAdminProductFilters(parseAdminProductFilters({})), false);
  assert.equal(hasAdminProductFilters(parseAdminProductFilters({ active: "cualquiera" })), false);
});

test("cualquier filtro cuenta, incluidos los de calidad de datos", () => {
  for (const params of [{ q: "x" }, { distributor: "d" }, { stock: "LOW_STOCK" }, { nodesc: "1" }, { crestronMissing: "1" }]) {
    assert.equal(hasAdminProductFilters(parseAdminProductFilters(params)), true, JSON.stringify(params));
  }
});

test("lo que viaja a la acción masiva valida con el mismo esquema", () => {
  const f = parseAdminProductFilters({ brand: "b1", nocat: "1" });
  const roundTrip = adminProductFiltersSchema.parse(JSON.parse(JSON.stringify(f)));
  assert.equal(JSON.stringify(roundTrip), JSON.stringify(f));
});
