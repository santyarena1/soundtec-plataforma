import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toWhatsAppNumber } from "./whatsapp";

describe("toWhatsAppNumber", () => {
  it("deja igual un número internacional móvil argentino", () => assert.equal(toWhatsAppNumber("+54 9 11 1234-5678"), "5491112345678"));
  it("agrega el 9 si viene 54 sin 9", () => assert.equal(toWhatsAppNumber("+54 11 1234 5678"), "5491112345678"));
  it("saca el 00 internacional", () => assert.equal(toWhatsAppNumber("0054 9 11 12345678"), "5491112345678"));
  it("número local de 10 dígitos → 549", () => assert.equal(toWhatsAppNumber("11 1234-5678"), "5491112345678"));
  it("saca el 0 de larga distancia", () => assert.equal(toWhatsAppNumber("0351 412-3456"), "5493514123456"));
  it("0 + 10 dígitos", () => assert.equal(toWhatsAppNumber("011 1234 5678"), "5491112345678"));
  it("otros países quedan en dígitos", () => assert.equal(toWhatsAppNumber("+1 (305) 555-1234"), "13055551234"));
  it("vacío queda vacío", () => assert.equal(toWhatsAppNumber("  "), ""));
});
