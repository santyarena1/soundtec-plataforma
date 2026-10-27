import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTangoTree, tangoDisplayName, tangoPathLabel, TANGO_EXTRA_PATHS } from "./tango-tree";
import { categoryWithDescendants } from "./category-tree";

const CSV = [
  "﻿Rubro;Subrubro;Nivel 3;Nivel 4;Nivel 5",
  '"SONIDO";;;;',
  '"SONIDO";"BAFLES PASIVOS";;;',
  '"SONIDO";"BAFLES PASIVOS";"BAFLES DE EMBUTIR";;',
  '"HERRAMIENTAS";"HERRAMIENTAS DE MANO";"DESTORNILLADORES";"PHILIPS";"ACODADO"',
].join("\r\n");

test("lee el CSV de Tango hasta el nivel 4, sin duplicar y con padres antes que hijos", () => {
  const nodes = parseTangoTree(CSV);
  const paths = nodes.map((n) => n.path);
  assert.ok(paths.includes("SONIDO > BAFLES PASIVOS > BAFLES DE EMBUTIR"));
  assert.ok(paths.includes("HERRAMIENTAS > HERRAMIENTAS DE MANO > DESTORNILLADORES > PHILIPS"));
  assert.ok(!paths.some((p) => p.includes("ACODADO")), "el nivel 5 se ignora");
  assert.equal(new Set(paths).size, paths.length);
  for (const n of nodes) if (n.parentPath) assert.ok(paths.indexOf(n.parentPath) < paths.indexOf(n.path));
});

test("suma las ramas agregadas por Soundtec (Bafles exterior)", () => {
  const paths = parseTangoTree(CSV).map((n) => n.path);
  for (const extra of TANGO_EXTRA_PATHS) assert.ok(paths.includes(extra));
});

test("nombres legibles: mayúscula inicial, siglas y P/ como en Tango", () => {
  assert.equal(tangoDisplayName("BAFLES PASIVOS"), "Bafles pasivos");
  assert.equal(tangoDisplayName("DIFUSORES PA"), "Difusores PA");
  assert.equal(tangoDisplayName("SOPORTES P/BAFLE"), "Soportes p/bafle");
  assert.equal(tangoDisplayName("CONECTORES HDMI"), "Conectores HDMI");
  assert.equal(tangoPathLabel("SONIDO > BAFLES PASIVOS"), "Sonido › Bafles pasivos");
});

test("un rubro incluye todo lo que cuelga de él", () => {
  const nodes = [
    { id: "s", parentId: null },
    { id: "b", parentId: "s" },
    { id: "e", parentId: "b" },
    { id: "v", parentId: null },
  ];
  assert.deepEqual(categoryWithDescendants("s", nodes).sort(), ["b", "e", "s"]);
  assert.deepEqual(categoryWithDescendants("v", nodes), ["v"]);
});
