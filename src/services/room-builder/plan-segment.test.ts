import { test } from "node:test";
import assert from "node:assert/strict";
import type { GrayImage } from "./plan-snap";
import { placeRooms } from "./plan-segment";

function plan(width: number, height: number, rooms: Array<[number, number, number, number]>): GrayImage {
  const data = new Uint8Array(width * height).fill(255);
  const wall = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < width && y < height) data[y * width + x] = 20;
  };
  for (const [x0, y0, x1, y1] of rooms) {
    for (let t = 0; t < 6; t++) {
      for (let x = x0; x <= x1; x++) {
        wall(x, y0 + t);
        wall(x, y1 - t);
      }
      for (let y = y0; y <= y1; y++) {
        wall(x0 + t, y);
        wall(x1 - t, y);
      }
    }
  }
  return { data, width, height };
}

const near = (a: number, b: number, tol = 4) => Math.abs(a - b) <= tol;

test("cada ambiente cae en su espacio real aunque la IA erre la ubicación", () => {
  // tres ambientes en fila: 40-200, 200-300 (pasillo), 300-460
  const img = plan(500, 300, [
    [40, 40, 200, 240],
    [200, 40, 300, 240],
    [300, 40, 460, 240],
  ]);
  const ai = [
    { name: "A", box: { x0: 0, y0: 0, x1: 0.4, y1: 0.85 } },
    { name: "Pasillo", box: { x0: 0.4, y0: 0.1, x1: 0.5, y1: 0.85 } },
    { name: "B", box: { x0: 0.5, y0: 0.1, x1: 1, y1: 0.9 } },
  ];
  const { rooms, extras } = placeRooms(ai, img);
  const xs = rooms.map((r) => [r.box.x0 * 500, r.box.x1 * 500]);
  assert.ok(near(xs[0][0], 46) && near(xs[0][1], 195), String(xs[0]));
  assert.ok(near(xs[1][0], 206) && near(xs[1][1], 295), String(xs[1]));
  assert.ok(near(xs[2][0], 306) && near(xs[2][1], 455), String(xs[2]));
  assert.equal(extras.length, 0);
});

test("un espacio que la IA no vio aparece como extra; el exterior no", () => {
  const img = plan(500, 300, [
    [40, 40, 240, 240],
    [240, 40, 460, 240],
  ]);
  const { extras } = placeRooms([{ box: { x0: 0.08, y0: 0.13, x1: 0.48, y1: 0.8 } }], img);
  assert.equal(extras.length, 1);
  assert.ok(near(extras[0].x0 * 500, 246));
});
