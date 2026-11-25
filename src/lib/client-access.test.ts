import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isClientAccessPaused } from "./client-access";

test("usuario del portal con la empresa pausada no entra", () => {
  assert.equal(isClientAccessPaused({ role: "CLIENT", client: { isActive: false } }), true);
});

test("empresa activa, sin empresa o usuario del equipo: sigue entrando", () => {
  assert.equal(isClientAccessPaused({ role: "CLIENT", client: { isActive: true } }), false);
  assert.equal(isClientAccessPaused({ role: "CLIENT", client: null }), false);
  assert.equal(isClientAccessPaused({ role: "SUPER_ADMIN", client: { isActive: false } }), false);
  assert.equal(isClientAccessPaused({ role: "STAFF", client: { isActive: false } }), false);
});

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

test("el login, la sesión y la activación consultan la empresa pausada", () => {
  assert.match(read("src/lib/auth.ts"), /isClientAccessPaused\(/);
  assert.match(read("src/lib/auth-helpers.ts"), /isClientAccessPaused\(/);
  assert.match(read("src/server/actions/activate-account.ts"), /isClientAccessPaused\(/);
  assert.match(read("src/app/salir/route.ts"), /CLIENT_PAUSED_REASON/);
});
