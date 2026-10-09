import { test } from "node:test";
import assert from "node:assert/strict";
import { snapBoxToWalls, type GrayImage } from "./plan-snap";

/** Imagen blanca con rectángulos de muro (espesor 6 px). */
function plan(width: number, height: number, rooms: Array<[number, number, number, number]>, door?: [number, number, number]): GrayImage {
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
  if (door) {
    const [y, xa, xb] = door;
    for (let t = 0; t < 6; t++) for (let x = xa; x <= xb; x++) data[(y + t) * width + x] = 255;
  }
  return { data, width, height };
}

const px = (b: { x0: number; y0: number; x1: number; y1: number }, w: number, h: number) => [Math.round(b.x0 * w), Math.round(b.y0 * h), Math.round(b.x1 * w), Math.round(b.y1 * h)];

test("un recuadro corrido se pega a la cara interior de los muros", () => {
  const img = plan(400, 300, [[50, 40, 250, 200]]);
  // La IA lo puso corrido unos 15-20 px.
  const snapped = snapBoxToWalls({ x0: 30 / 400, y0: 25 / 300, x1: 270 / 400, y1: 215 / 300 }, img);
  assert.deepEqual(px(snapped, 400, 300), [56, 46, 245, 195]);
});

test("funciona con el hueco de una puerta en la pared de arriba", () => {
  const img = plan(400, 300, [[50, 40, 250, 200]], [40, 120, 170]);
  const snapped = snapBoxToWalls({ x0: 40 / 400, y0: 30 / 300, x1: 260 / 400, y1: 210 / 300 }, img);
  const [, y0] = px(snapped, 400, 300);
  assert.equal(y0, 46);
});

test("sin muros cerca, el recuadro queda como estaba", () => {
  const img = plan(400, 300, []);
  const box = { x0: 0.2, y0: 0.2, x1: 0.6, y1: 0.7 };
  const snapped = snapBoxToWalls(box, img);
  assert.ok(Math.abs(snapped.x0 - box.x0) < 0.01 && Math.abs(snapped.y1 - box.y1) < 0.01);
});

test("dos ambientes vecinos: cada uno toma su lado del muro compartido", () => {
  const img = plan(500, 300, [
    [40, 40, 250, 220],
    [245, 40, 460, 220],
  ]);
  const left = px(snapBoxToWalls({ x0: 0.05, y0: 0.1, x1: 0.55, y1: 0.75 }, img), 500, 300);
  const right = px(snapBoxToWalls({ x0: 0.45, y0: 0.1, x1: 0.95, y1: 0.75 }, img), 500, 300);
  assert.equal(left[2], 245);
  assert.equal(right[0], 251);
});
