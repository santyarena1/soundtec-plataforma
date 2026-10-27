import { test } from "node:test";
import assert from "node:assert/strict";
import { baseSectionKeys, isBaseDocumentKey, toDocumentType } from "./quote-document-types";
import { quoteStatusLabel } from "./quote-status";

const row = (over: Partial<Parameters<typeof toDocumentType>[0]> = {}) => ({
  id: "p1",
  key: "tecnico",
  name: "Técnico",
  baseKey: null,
  audience: null,
  sectionKeys: null,
  isCustom: false,
  description: null,
  ...over,
});

test("los tipos base se muestran como Corto, Estándar y Completo aunque la fila diga otra cosa", () => {
  assert.equal(toDocumentType(row({ key: "resumido", name: "Resumido" })).name, "Corto");
  assert.equal(toDocumentType(row({ key: "tecnico" })).name, "Estándar");
  assert.equal(toDocumentType(row({ key: "premium", name: "Premium" })).name, "Completo");
});

test("un tipo propio conserva su nombre, su base y su rubro", () => {
  const t = toDocumentType(row({ key: "propio-ab12", name: "Compacto escolar", baseKey: "resumido", audience: "educacion_gobierno", isCustom: true, sectionKeys: ["opening"] }));
  assert.equal(t.name, "Compacto escolar");
  assert.equal(t.baseKey, "resumido");
  assert.equal(t.audience, "educacion_gobierno");
  assert.deepEqual(t.sectionKeys, ["opening"]);
});

test("sin secciones guardadas toma las de su base; una base desconocida cae en Estándar", () => {
  assert.deepEqual(toDocumentType(row({ key: "premium" })).sectionKeys, baseSectionKeys("premium"));
  assert.equal(toDocumentType(row({ key: "propio-x", baseKey: "raro", isCustom: true })).baseKey, "tecnico");
});

test("solo resumido, tecnico y premium son tipos base", () => {
  assert.ok(isBaseDocumentKey("resumido"));
  assert.ok(!isBaseDocumentKey("propio-ab12"));
  assert.ok(!isBaseDocumentKey(null));
});

test("estado: «PDF generado» y «PDF desactualizado» si se editó después", () => {
  assert.equal(quoteStatusLabel("ISSUED", false), "PDF generado");
  assert.equal(quoteStatusLabel("ISSUED", true), "PDF desactualizado");
  // Un borrador nunca está «desactualizado»: todavía no tiene PDF.
  assert.equal(quoteStatusLabel("DRAFT", true), "Borrador");
  assert.equal(quoteStatusLabel("RARO"), "RARO");
});
