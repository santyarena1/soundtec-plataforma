import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRecipients, readAudience } from "./audience";

test("deduplica entre listas sin importar mayúsculas ni espacios, y completa datos faltantes", () => {
  const { recipients, stats } = buildRecipients([
    [
      { email: "Ana@Estudio.com ", name: null, company: "Estudio AV" },
      { email: "beto@integra.com.ar", name: "Beto", company: null },
    ],
    [
      { email: "ana@estudio.com", name: "Ana Gómez", company: "Otra", fields: { ciudad: "Rosario" } },
      { email: "beto@integra.com.ar", name: "Roberto", company: "Integra" },
    ],
  ]);
  assert.equal(stats.total, 2);
  assert.equal(stats.duplicates, 2);
  assert.equal(stats.raw, 4);
  const ana = recipients.find((r) => r.email === "ana@estudio.com")!;
  assert.equal(ana.name, "Ana Gómez", "el nombre vacío se completa con otra lista");
  assert.equal(ana.company, "Estudio AV", "lo que ya había no se pisa");
  assert.deepEqual(ana.fields, { ciudad: "Rosario" });
  assert.equal(recipients.find((r) => r.email === "beto@integra.com.ar")!.company, "Integra");
});

test("saca supresión (bajas, rebotes, quejas), excluidas e inválidos, y lo cuenta", () => {
  const { recipients, stats } = buildRecipients(
    [
      [
        { email: "ok@a.com" },
        { email: "baja@a.com" },
        { email: "BAJA@a.com" },
        { email: "competencia@b.com" },
        { email: "sin-arroba" },
        { email: "" },
      ],
    ],
    { suppressed: ["baja@a.com"], exclude: ["Competencia@b.com"] }
  );
  assert.deepEqual(
    recipients.map((r) => r.email),
    ["ok@a.com"]
  );
  assert.deepEqual(stats, { raw: 6, duplicates: 1, invalid: 2, suppressed: 1, excluded: 1, total: 1 });
});

test("la supresión gana aunque la persona esté en varias listas sumadas", () => {
  const { recipients } = buildRecipients([[{ email: "x@y.com" }], [{ email: "x@y.com" }]], { suppressed: new Set(["x@y.com"]) });
  assert.equal(recipients.length, 0);
});

test("readAudience tolera basura y devuelve listas vacías", () => {
  assert.deepEqual(readAudience(null), { include: [], exclude: [] });
  assert.deepEqual(readAudience({ include: ["a"], exclude: "b" }), { include: [], exclude: [] });
  assert.deepEqual(readAudience({ include: ["a", "b"] }), { include: ["a", "b"], exclude: [] });
});
