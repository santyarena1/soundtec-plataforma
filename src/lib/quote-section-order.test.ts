import { test } from "node:test";
import assert from "node:assert/strict";
import { orderQuoteSections } from "./quote-section-order";

const ORDER = ["letter_open", "corporate_intro", "brands", "products_table", "proposal", "warranty", "closing"];
const s = (type: string, sortOrder: number) => ({ type, sortOrder });

test("ordena por la plantilla aunque el orden guardado esté mezclado", () => {
  const mixed = [s("warranty", 0), s("closing", 1), s("letter_open", 2), s("products_table", 3), s("brands", 4), s("corporate_intro", 9)];
  assert.deepEqual(orderQuoteSections(mixed, ORDER).map((x) => x.type), ["letter_open", "corporate_intro", "brands", "products_table", "warranty", "closing"]);
});

test("la tabla de productos queda debajo de marcas", () => {
  const types = orderQuoteSections([s("proposal", 0), s("products_table", 1), s("brands", 2)], ORDER).map((x) => x.type);
  assert.deepEqual(types, ["brands", "products_table", "proposal"]);
});

test("los módulos agregados a mano van antes del cierre, en el orden en que se agregaron", () => {
  const types = orderQuoteSections([s("closing", 5), s("custom", 7), s("custom_b", 6), s("letter_open", 0)], ORDER).map((x) => x.type);
  assert.deepEqual(types, ["letter_open", "custom_b", "custom", "closing"]);
});
