/**
 * CUIT: 11 dígitos, prefijo válido y dígito verificador (módulo 11).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCuit, isValidCuit, normalizeCuit, cuitVariants } from "./cuit";

describe("normalizeCuit", () => {
  it("deja solo dígitos", () => {
    assert.equal(normalizeCuit("30-71234567-1"), "30712345671");
    assert.equal(normalizeCuit(" 20 12345678 6 "), "20123456786");
  });
});

describe("isValidCuit", () => {
  it("acepta CUITs con dígito verificador correcto", () => {
    assert.equal(isValidCuit("20-12345678-6"), true);
    assert.equal(isValidCuit("30-50001091-2"), true);
  });
  it("rechaza dígito verificador incorrecto", () => {
    assert.equal(isValidCuit("20-12345678-7"), false);
  });
  it("rechaza largo o prefijo inválido", () => {
    assert.equal(isValidCuit("2012345678"), false);
    assert.equal(isValidCuit("99-12345678-6"), false);
    assert.equal(isValidCuit(""), false);
  });
});

describe("formatCuit", () => {
  it("formatea como XX-XXXXXXXX-X", () => {
    assert.equal(formatCuit("20123456786"), "20-12345678-6");
  });
});

describe("cuitVariants", () => {
  it("devuelve la forma normalizada y la formateada", () => {
    assert.deepEqual(cuitVariants("20-12345678-6"), ["20123456786", "20-12345678-6"]);
  });
  it("si no tiene 11 dígitos solo devuelve los dígitos", () => assert.deepEqual(cuitVariants("123"), ["123"]));
});
