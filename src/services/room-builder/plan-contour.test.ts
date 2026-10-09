import { test } from "node:test";
import assert from "node:assert/strict";
import { orthogonalize, regionPolygon, traceOuterBoundary } from "./plan-contour";
import { polygonAreaPx } from "./plan-polygon";

/** Grilla 20x20 con una L (label 1) y un cuadrado vecino (label 2). */
function lGrid() {
  const width = 20;
  const height = 20;
  const labels = new Int32Array(width * height).fill(-1);
  for (let y = 2; y < 18; y++) {
    for (let x = 2; x < 18; x++) {
      const inL = x < 10 || y < 8;
      labels[y * width + x] = inL ? 1 : 2;
    }
  }
  return { labels, width, height };
}

test("contorno de una L: 6 esquinas y área exacta", () => {
  const grid = lGrid();
  const poly = regionPolygon(grid, [1]);
  assert.ok(poly);
  assert.equal(poly.length, 6);
  // L = 16x16 - 8x10 = 176 celdas
  assert.equal(Math.round(polygonAreaPx(poly, 20, 20)), 176);
});

test("unión de espacios: la L más el cuadrado forman el cuadrado completo", () => {
  const poly = regionPolygon(lGrid(), [1, 2]);
  assert.ok(poly);
  assert.equal(poly.length, 4);
  assert.equal(Math.round(polygonAreaPx(poly, 20, 20)), 256);
});

test("el borde ignora los huecos interiores (muebles) y se queda con el de afuera", () => {
  const grid = lGrid();
  grid.labels[4 * 20 + 4] = -1;
  const raw = traceOuterBoundary(grid.labels, grid.width, grid.height, new Set([1]));
  assert.ok(raw.length >= 6);
  assert.equal(regionPolygon(grid, [1])?.length, 6);
});

test("los lados casi rectos se enderezan", () => {
  const out = orthogonalize([
    { x: 0, y: 0 },
    { x: 10, y: 0.5 },
    { x: 10.4, y: 10 },
    { x: 0, y: 10 },
  ]);
  assert.equal(out[0]!.y, out[1]!.y);
  assert.equal(out[1]!.x, out[2]!.x);
});

test("sin celdas no hay polígono", () => {
  assert.equal(regionPolygon(lGrid(), [7]), null);
});

test("el cierre rellena entrantes chicos pero respeta la L y al vecino", () => {
  const grid = lGrid();
  // Muesca de 2x2 en el borde de arriba de la L (una hoja de puerta).
  for (const [x, y] of [[5, 2], [6, 2], [5, 3], [6, 3]]) grid.labels[y * 20 + x] = -1;
  const poly = regionPolygon(grid, [1], 2);
  assert.ok(poly);
  assert.equal(poly.length, 6);
  assert.equal(Math.round(polygonAreaPx(poly, 20, 20)), 176);
});
