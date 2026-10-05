import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateQrCode, isValidQrCode } from "./qr-code";
import { ACTIVATION_TTL_MS, createActivationToken, hashActivationToken } from "./activation-token";

describe("QR code", () => {
  it("genera 7 caracteres sin ambiguos (0/O/1/l/I)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateQrCode();
      assert.equal(code.length, 7);
      assert.equal(isValidQrCode(code), true);
      assert.doesNotMatch(code, /[0O1lI]/);
    }
  });
  it("rechaza códigos con caracteres inválidos o largo distinto", () => {
    assert.equal(isValidQrCode("abc"), false);
    assert.equal(isValidQrCode("abc/def"), false);
  });
});

describe("activation token", () => {
  it("el hash es determinístico y distinto del token", () => {
    const { token, tokenHash } = createActivationToken();
    assert.equal(hashActivationToken(token), tokenHash);
    assert.notEqual(token, tokenHash);
    assert.ok(token.length >= 40);
  });
  it("dura 72 horas", () => assert.equal(ACTIVATION_TTL_MS, 72 * 3600 * 1000));
});
