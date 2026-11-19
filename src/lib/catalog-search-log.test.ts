import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SEARCH_QUERY_MAX, decideSearchLog, normalizeSearchQuery } from "./catalog-search-log";

describe("normalización de búsquedas", () => {
  it("minúsculas, sin acentos ni espacios de más", () => {
    assert.equal(normalizeSearchQuery("  Parlante   de TECHO  "), "parlante de techo");
    assert.equal(normalizeSearchQuery("Cámara PTZ"), "camara ptz");
  });

  it("conserva códigos de producto", () => {
    assert.equal(normalizeSearchQuery("DM-TX-4KZ-302-C"), "dm-tx-4kz-302-c");
    assert.equal(normalizeSearchQuery("HD-MD4X2-4KZ-E"), "hd-md4x2-4kz-e");
    assert.equal(normalizeSearchQuery("70V / 100V"), "70v / 100v");
  });

  it("saca signos sueltos en los bordes", () => {
    assert.equal(normalizeSearchQuery("¿sonance?"), "sonance");
    assert.equal(normalizeSearchQuery("-- crestron --"), "crestron");
  });

  it("no guarda mails, teléfonos ni CUIT", () => {
    assert.equal(normalizeSearchQuery("juan@estudio.com"), null);
    assert.equal(normalizeSearchQuery("11 4567 8901"), null);
    assert.equal(normalizeSearchQuery("20-12345678-9"), null);
  });

  it("muy corta o vacía no cuenta", () => {
    assert.equal(normalizeSearchQuery("a"), null);
    assert.equal(normalizeSearchQuery("   "), null);
    assert.equal(normalizeSearchQuery(undefined), null);
  });

  it("recorta lo muy largo", () => {
    const out = normalizeSearchQuery("x".repeat(300));
    assert.equal(out?.length, SEARCH_QUERY_MAX);
  });
});

describe("anti-ruido del registro", () => {
  const at = (s: number) => new Date(Date.UTC(2026, 10, 18, 12, 0, s));

  it("la primera se agrega", () => {
    assert.equal(decideSearchLog(null, { query: "dante", at: at(0) }), "insert");
  });

  it("la misma búsqueda al rato no se cuenta dos veces", () => {
    assert.equal(decideSearchLog({ query: "dante", at: at(0) }, { query: "dante", at: at(50) }), "skip");
  });

  it("mientras escribe, reemplaza la anterior", () => {
    assert.equal(decideSearchLog({ query: "parl", at: at(0) }, { query: "parlante", at: at(2) }), "replace");
    assert.equal(decideSearchLog({ query: "parlante", at: at(0) }, { query: "parl", at: at(3) }), "replace");
  });

  it("otra búsqueda distinta se agrega", () => {
    assert.equal(decideSearchLog({ query: "sonance", at: at(0) }, { query: "crestron", at: at(5) }), "insert");
  });

  it("pasado un rato, la misma vuelve a contar", () => {
    const later = new Date(at(0).getTime() + 11 * 60_000);
    assert.equal(decideSearchLog({ query: "dante", at: at(0) }, { query: "dante", at: later }), "insert");
  });
});
