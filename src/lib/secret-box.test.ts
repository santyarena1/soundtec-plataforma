import { test } from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret, isEncrypted, maskForDisplay } from "./secret-box";

const KEY = "clave-de-prueba-larga-para-los-tests-123";

test("cifra y descifra ida y vuelta, con un resultado distinto cada vez", () => {
  const a = encryptSecret("sk-proj-abc123", KEY);
  const b = encryptSecret("sk-proj-abc123", KEY);
  assert.ok(isEncrypted(a));
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a, KEY), "sk-proj-abc123");
});

test("sin clave no cifra, y lo cifrado no se devuelve en crudo", () => {
  assert.equal(encryptSecret("sk-1", ""), "sk-1");
  const enc = encryptSecret("sk-1", KEY);
  assert.equal(decryptSecret(enc, ""), "");
  assert.equal(decryptSecret(enc, "otra-clave-distinta-que-no-es"), "");
});

test("texto plano viejo se lee igual (migración gradual)", () => {
  assert.equal(decryptSecret("sk-viejo", KEY), "sk-viejo");
});

test("no cifra dos veces ni muestra la clave al enmascarar", () => {
  const enc = encryptSecret("sk-proj-abc123", KEY);
  assert.equal(encryptSecret(enc, KEY), enc);
  assert.equal(maskForDisplay("sk-proj-abcdef1234"), "sk-…1234");
  assert.equal(maskForDisplay("corta"), "••••");
});
