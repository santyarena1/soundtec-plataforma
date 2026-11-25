import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRuleTimestamp, formatStableDateTime } from "./pricing-scope";

/*
 * «Creada …» de la tabla de reglas: el servidor (Node) y el navegador tienen que
 * escribir exactamente lo mismo o React tira error de hidratación. Con
 * `dateStyle` Node ponía «p. m.» con un espacio distinto al de Chrome.
 */

test("fecha y hora solo con números, en hora de Buenos Aires y formato de 24 h", () => {
  assert.equal(formatStableDateTime("2026-10-23T21:23:00.000Z"), "23/10/2026 18:23");
  assert.equal(formatStableDateTime(new Date("2026-01-05T03:07:00.000Z")), "05/01/2026 00:07");
  assert.match(formatStableDateTime("2026-10-23T21:23:00.000Z"), /^[0-9/: ]+$/);
});

test("fecha inválida no rompe la tabla", () => {
  assert.equal(formatStableDateTime("no es fecha"), "—");
});

test("«Editada» solo si pasaron más de 2 segundos desde el alta", () => {
  assert.equal(formatRuleTimestamp("2026-10-23T21:23:00.000Z", "2026-10-23T21:23:01.000Z"), "Creada 23/10/2026 18:23");
  assert.equal(
    formatRuleTimestamp("2026-10-23T21:23:00.000Z", "2026-10-24T13:00:00.000Z"),
    "Creada 23/10/2026 18:23 · Editada 24/10/2026 10:00"
  );
});
