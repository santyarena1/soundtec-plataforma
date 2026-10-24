import { test } from "node:test";
import assert from "node:assert/strict";
import { brandMentioned, compactCode, modelTokens, pickCatalogMatch, scoreCandidate, type MatchCandidate } from "./quote-ai-match";

const grille: MatchCandidate = {
  id: "grl",
  normalizedName: "GRL-HP129-BK",
  modelNumber: "GRL-HP129-BK",
  brandName: "SoundTube",
};
const lock: MatchCandidate = {
  id: "clk",
  normalizedName: "CLK-YL-YRD256-CR2-0BP",
  modelNumber: "CLK-YL-YRD256-CR2-0BP",
  brandName: "Crestron",
};
const tsw: MatchCandidate = {
  id: "tsw",
  normalizedName: "TSW-770-B-S",
  modelNumber: "TSW-770-B-S",
  brandName: "Crestron",
};
const tswWhite: MatchCandidate = { ...tsw, id: "tsw-w", normalizedName: "TSW-770-W-S", modelNumber: "TSW-770-W-S" };
const uc: MatchCandidate = { id: "uc", normalizedName: "UC-BX30-T", modelNumber: "UC-BX30-T", brandName: "Crestron" };
const pml1Other: MatchCandidate = { id: "pm", normalizedName: "PM-L1 Pole mount", modelNumber: "PM-L1", brandName: "OtraMarca" };

test("compactCode quita mayúsculas, espacios, guiones y acentos", () => {
  assert.equal(compactCode("TSW 770-B/S"), "tsw770bs");
  assert.equal(compactCode("Cámara PTZ"), "camaraptz");
});

test("modelTokens toma solo códigos con dígitos", () => {
  assert.deepEqual(modelTokens("NDT PM-L1"), ["PM-L1"]);
  assert.deepEqual(modelTokens("Crestron panel táctil"), []);
  assert.deepEqual(modelTokens("Parlante 4 ohm 12"), []);
  assert.deepEqual(modelTokens("Optoma ZH403 1080p"), ["ZH403", "1080p"]);
});

test("brandMentioned exige la marca como palabra", () => {
  assert.equal(brandMentioned("Crestron TSW-770", "Crestron"), true);
  assert.equal(brandMentioned("TSW-770", "Crestron"), false);
  assert.equal(brandMentioned("Bose Professional DM8C", "Bose Professional"), true);
});

test("NDT PM-L1 no se asocia a una rejilla SoundTube", () => {
  assert.equal(scoreCandidate("NDT PM-L1", grille), null);
  assert.deepEqual(pickCatalogMatch("NDT PM-L1", [grille]), { kind: "none" });
});

test("NDT PM-L1 no se asocia a un PM-L1 de otra marca", () => {
  // Nombra una marca distinta: el código solo no alcanza.
  assert.equal(scoreCandidate("NDT PM-L1", pml1Other), null);
});

test("cualquier «Crestron …» no cae en la cerradura CLK-YL-YRD256", () => {
  assert.deepEqual(pickCatalogMatch("Crestron DM-NVX-360", [lock]), { kind: "none" });
  assert.deepEqual(pickCatalogMatch("Crestron procesador de control", [lock]), { kind: "none" });
});

test("modelo exacto con o sin marca", () => {
  const r = pickCatalogMatch("Crestron UC-BX30-T", [lock, uc, tsw]);
  assert.equal(r.kind, "match");
  assert.equal(r.kind === "match" && r.product.id, "uc");
  const r2 = pickCatalogMatch("uc bx30 t", [lock, uc]);
  assert.equal(r2.kind === "match" && r2.product.id, "uc");
});

test("solo el código, sin otras palabras, también matchea", () => {
  const r = pickCatalogMatch("UC-BX30-T", [uc]);
  assert.equal(r.kind === "match" && r.product.id, "uc");
});

test("modelo base con marca: variante única se asocia, varias quedan ambiguas", () => {
  const one = pickCatalogMatch("Crestron TSW-770", [tsw, lock]);
  assert.equal(one.kind === "match" && one.product.id, "tsw");
  const two = pickCatalogMatch("Crestron TSW-770", [tsw, tswWhite]);
  assert.equal(two.kind, "ambiguous");
});

test("modelo base sin marca no se asocia a una variante", () => {
  assert.deepEqual(pickCatalogMatch("TSW-770", [tsw]), { kind: "none" });
});

test("prefijo sin borde de token no cuenta (PS-C85 no es PS-C85RT)", () => {
  const c: MatchCandidate = { id: "ps", normalizedName: "PS-C85RT", modelNumber: "PS-C85RT", brandName: "Sonance" };
  assert.deepEqual(pickCatalogMatch("Sonance PS-C85", [c]), { kind: "none" });
});

test("prefiere exacto sobre variante", () => {
  const base: MatchCandidate = { id: "base", normalizedName: "TSW-770", modelNumber: "TSW-770", brandName: "Crestron" };
  const r = pickCatalogMatch("Crestron TSW-770", [tsw, tswWhite, base]);
  assert.equal(r.kind === "match" && r.product.id, "base");
});
