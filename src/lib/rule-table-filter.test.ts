import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesSearch, normalizeSearch, pageEntries } from "./rule-table-filter";

/* Tabla de reglas de a tandas y con búsqueda: lo pendiente o recién guardado nunca queda escondido. */

test("busca sin acentos ni mayúsculas y con todas las palabras en cualquier orden", () => {
  assert.equal(normalizeSearch("  Márgen ÁUDIO "), "margen audio");
  assert.equal(matchesSearch("Todos los clientes · Marca: Sonance · × 2,75", "sonance 2,75"), true);
  assert.equal(matchesSearch("Todos los clientes · Marca: Sonance", "sonance crestron"), false);
  assert.equal(matchesSearch("cualquier cosa", "   "), true);
});

test("corta en el límite y avisa si quedan más", () => {
  const entries = Array.from({ length: 120 }, (_, i) => `regla ${i}`);
  const page = pageEntries(entries, (e) => e, "", 50);
  assert.equal(page.shown.length, 50);
  assert.equal(page.matched, 120);
  assert.equal(page.hasMore, true);
  assert.equal(pageEntries(entries, (e) => e, "", 200).hasMore, false);
});

test("lo fijado (pendiente, en edición, recién guardado) se ve aunque esté después del corte", () => {
  const entries = Array.from({ length: 120 }, (_, i) => `regla ${i}`);
  const page = pageEntries(entries, (e) => e, "", 50, (e) => e === "regla 99");
  assert.equal(page.shown.length, 51);
  assert.equal(page.shown.at(-1), "regla 99");
  assert.equal(page.hasMore, true);
});

test("la búsqueda filtra antes de cortar", () => {
  const entries = ["Marca: Sonance", "Marca: Crestron", "Rubro: Sonido › Bafles"];
  const page = pageEntries(entries, (e) => e, "marca", 1);
  assert.deepEqual(page.shown, ["Marca: Sonance"]);
  assert.equal(page.matched, 2);
});
