import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, generateTotpSecret, totpCode, verifyTotp } from "./totp";

// RFC 6238, apéndice B (SHA-1, secreto "12345678901234567890").
const RFC_SECRET = base32Encode(new TextEncoder().encode("12345678901234567890"));

test("coincide con los valores de prueba del estándar", async () => {
  assert.equal(await totpCode(RFC_SECRET, 59_000, 8), "94287082");
  assert.equal(await totpCode(RFC_SECRET, 1_111_111_109_000, 8), "07081804");
  assert.equal(await totpCode(RFC_SECRET, 2_000_000_000_000, 8), "69279037");
});

test("base32 ida y vuelta", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255, 7, 128]);
  assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
});

test("acepta el código actual y uno de 30 s de diferencia, no más", async () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;
  assert.ok(await verifyTotp(secret, await totpCode(secret, now), now));
  assert.ok(await verifyTotp(secret, await totpCode(secret, now - 30_000), now));
  assert.equal(await verifyTotp(secret, await totpCode(secret, now - 120_000), now), false);
  assert.equal(await verifyTotp(secret, "12345", now), false);
  assert.equal(await verifyTotp(secret, "abcdef", now), false);
});
