import { test } from "node:test";
import assert from "node:assert/strict";
import { checkNewSubrubro, normalizeRubroName, rubroKey, similarSibling, tangoCsvRow } from "./rubros";
import { validateRubroIds } from "../server/categories/rubros";

const parent = { tangoPath: "SONIDO > BAFLES PASIVOS", level: 2, isActive: true };

test("normaliza el nombre como Tango: mayúsculas, sin espacios dobles ni separadores", () => {
  assert.equal(normalizeRubroName("  bafles   de  exterior "), "BAFLES DE EXTERIOR");
  assert.equal(normalizeRubroName("Cajas > empotrar"), "CAJAS EMPOTRAR");
  assert.equal(normalizeRubroName("plataforma de embutir."), "PLATAFORMA DE EMBUTIR");
  assert.equal(normalizeRubroName("rejilla p/ techo"), "REJILLA P/ TECHO");
});

test("compara hermanos sin tildes ni mayúsculas", () => {
  assert.equal(rubroKey("Baflés  Exterior"), rubroKey("BAFLES EXTERIOR"));
  assert.notEqual(rubroKey("BAFLES EXTERIOR"), rubroKey("BAFLES INTERIOR"));
});

test("crear subrubro: rechaza duplicados entre hermanos aunque cambien tildes o mayúsculas", () => {
  const r = checkNewSubrubro(parent, "bafles exterior", ["BAFLES EXTERIOR", "BAFLES DE EMBUTIR"]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /Ya existe/);
});

test("crear subrubro: arma la ruta y el nivel", () => {
  const r = checkNewSubrubro(parent, "colgantes", ["BAFLES EXTERIOR"]);
  assert.deepEqual(r, { ok: true, name: "COLGANTES", path: "SONIDO > BAFLES PASIVOS > COLGANTES", level: 3 });
});

test("crear subrubro: no pasa del nivel 4 ni se crea fuera del árbol o en un rubro desactivado", () => {
  assert.equal(checkNewSubrubro({ tangoPath: "A > B > C > D", level: 4, isActive: true }, "E", []).ok, false);
  assert.equal(checkNewSubrubro({ tangoPath: null, level: null, isActive: true }, "E", []).ok, false);
  assert.equal(checkNewSubrubro(null, "E", []).ok, false);
  assert.equal(checkNewSubrubro({ ...parent, isActive: false }, "E", []).ok, false);
  assert.equal(checkNewSubrubro(parent, " x ", []).ok, false, "nombre muy corto");
});

test("avisa un hermano parecido («¿Quisiste decir…?»)", () => {
  assert.equal(similarSibling("BAFLES EXTERIORES", ["BAFLES EXTERIOR", "SUBWOOFERS"]), "BAFLES EXTERIOR");
  assert.equal(similarSibling("SUBWOOFERS", ["BAFLES EXTERIOR"]), null);
});

test("fila del CSV de pendientes con las 4 columnas de Tango", () => {
  assert.equal(tangoCsvRow("SONIDO > BAFLES PASIVOS > COLGANTES"), '"SONIDO";"BAFLES PASIVOS";"COLGANTES";""');
});

function fakeDb(rows: Array<{ id: string; tangoPath: string | null; isActive: boolean; name: string }>) {
  return {
    category: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => rows.filter((r) => where.id.in.includes(r.id)),
    },
  } as unknown as Parameters<typeof validateRubroIds>[0];
}

test("el servidor solo acepta rubros activos del árbol de Tango", async () => {
  const db = fakeDb([
    { id: "tango", tangoPath: "SONIDO", isActive: true, name: "Sonido" },
    { id: "vieja", tangoPath: null, isActive: false, name: "Parlantes" },
    { id: "off", tangoPath: "VIEJO", isActive: false, name: "Viejo" },
  ]);
  assert.deepEqual(await validateRubroIds(db, ["tango"]), { ok: true });
  assert.equal((await validateRubroIds(db, ["vieja"])).ok, false);
  assert.equal((await validateRubroIds(db, ["off"])).ok, false);
  assert.equal((await validateRubroIds(db, ["no-existe"])).ok, false);
  assert.deepEqual(await validateRubroIds(db, []), { ok: true });
});
