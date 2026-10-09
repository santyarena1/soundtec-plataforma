import { test } from "node:test";
import assert from "node:assert/strict";
import { openingsForRoom } from "./plan-openings";

// Sala normalizada 0.2..0.6 × 0.2..0.5 = 8 × 6 m (escala 20 m por unidad).
const poly = [
  { x: 0.2, y: 0.2 },
  { x: 0.6, y: 0.2 },
  { x: 0.6, y: 0.5 },
  { x: 0.2, y: 0.5 },
];
const floor = [
  { x: -4, y: -3 },
  { x: 4, y: -3 },
  { x: 4, y: 3 },
  { x: -4, y: 3 },
];

test("una ventana en el muro de arriba queda en esa pared, en metros", () => {
  const ops = openingsForRoom([{ kind: "window", horizontal: true, at: 0.19, from: 0.3, to: 0.4 }], poly, floor);
  assert.deepEqual(ops, [{ wall: "w0", kind: "window", from: 2, to: 4 }]);
});

test("una puerta en el muro derecho", () => {
  const ops = openingsForRoom([{ kind: "door", horizontal: false, at: 0.61, from: 0.3, to: 0.345 }], poly, floor);
  assert.equal(ops.length, 1);
  assert.equal(ops[0]!.wall, "w1");
  assert.equal(ops[0]!.kind, "door");
  assert.ok(Math.abs(ops[0]!.to - ops[0]!.from - 0.9) < 0.01);
});

test("lo que cae adentro de la sala (líneas de un sillón) no es abertura", () => {
  const ops = openingsForRoom([{ kind: "window", horizontal: false, at: 0.55, from: 0.3, to: 0.4 }], poly, floor);
  assert.equal(ops.length, 0);
});
