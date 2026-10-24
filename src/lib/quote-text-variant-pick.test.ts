import { test } from "node:test";
import assert from "node:assert/strict";
import { pickTextVariant, variantApplies } from "./quote-text-variant-pick";
import { audienceFromSegment } from "./quote-audiences";

const v = (id: string, profiles: string[], audiences: string[], updatedAt = "2026-01-01") => ({ id, profiles, audiences, updatedAt });

test("sin versiones que apliquen sale el texto general", () => {
  assert.equal(pickTextVariant([v("a", ["premium"], [])], { profileKey: "resumido", audience: null }), null);
  assert.equal(pickTextVariant([], { profileKey: "tecnico", audience: "hoteleria" }), null);
});

test("una versión sin condiciones no reemplaza sola al general", () => {
  assert.equal(variantApplies(v("a", [], []), { profileKey: "tecnico", audience: "hoteleria" }), false);
});

test("el rubro pesa más que el tipo de presupuesto", () => {
  const picked = pickTextVariant([v("tipo", ["tecnico"], []), v("rubro", [], ["hoteleria"])], { profileKey: "tecnico", audience: "hoteleria" });
  assert.equal(picked?.id, "rubro");
});

test("rubro + tipo gana sobre solo rubro", () => {
  const picked = pickTextVariant([v("rubro", [], ["hoteleria"]), v("ambos", ["premium"], ["hoteleria"])], { profileKey: "premium", audience: "hoteleria" });
  assert.equal(picked?.id, "ambos");
});

test("la condición de rubro exige que la cotización tenga ese rubro", () => {
  assert.equal(pickTextVariant([v("rubro", [], ["salud"])], { profileKey: "tecnico", audience: null }), null);
});

test("empate: la más acotada y luego la más reciente", () => {
  const picked = pickTextVariant([v("amplia", [], ["hoteleria", "retail"]), v("acotada", [], ["hoteleria"])], { profileKey: null, audience: "hoteleria" });
  assert.equal(picked?.id, "acotada");
  const recent = pickTextVariant([v("vieja", [], ["retail"], "2026-01-01"), v("nueva", [], ["retail"], "2026-05-01")], { profileKey: null, audience: "retail" });
  assert.equal(recent?.id, "nueva");
});

test("el segmento libre del cliente se traduce a un rubro", () => {
  assert.equal(audienceFromSegment("Corporativo"), "corporativo");
  assert.equal(audienceFromSegment("Integrador"), "integrador");
  assert.equal(audienceFromSegment("Hotel boutique"), "hoteleria");
  assert.equal(audienceFromSegment("Educación"), "educacion_gobierno");
  assert.equal(audienceFromSegment(""), null);
  assert.equal(audienceFromSegment("Otro"), null);
});
