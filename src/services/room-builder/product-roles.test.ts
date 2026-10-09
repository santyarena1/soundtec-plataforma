import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultMountForRole, roleForProduct } from "./product-roles";

test("rol: el perfil de diseño manda; si no, el tipo según la IA", () => {
  assert.equal(roleForProduct("display", "speaker"), "display");
  assert.equal(roleForProduct(null, "subwoofer"), "speaker");
  assert.equal(roleForProduct(null, "amplifier"), "processor");
  assert.equal(roleForProduct("furniture", "touchpanel"), "touch");
  assert.equal(roleForProduct(null, "cable"), "other");
  assert.equal(roleForProduct(undefined, undefined), "other");
});

test("montaje probable por rol", () => {
  assert.equal(defaultMountForRole("speaker"), "ceiling");
  assert.equal(defaultMountForRole("display"), "wall");
  assert.equal(defaultMountForRole("processor"), "rack");
  assert.equal(defaultMountForRole("other"), "table");
});
