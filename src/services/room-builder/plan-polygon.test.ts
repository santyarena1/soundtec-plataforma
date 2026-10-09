import { test } from "node:test";
import assert from "node:assert/strict";
import {
  boxToPolygon,
  cleanPolygon,
  insertVertex,
  isAxisRect,
  moveVertex,
  normalizePolygon,
  pointInPolygon,
  polygonAreaPx,
  polygonBox,
  polygonLabelPoint,
  removeVertex,
  snapOrtho,
  snapToVertices,
  polygonToRoomMeters,
  translatePolygon,
} from "./plan-polygon";

const L_SHAPE = [
  { x: 0.1, y: 0.1 },
  { x: 0.5, y: 0.1 },
  { x: 0.5, y: 0.3 },
  { x: 0.3, y: 0.3 },
  { x: 0.3, y: 0.5 },
  { x: 0.1, y: 0.5 },
];

test("recuadro ↔ polígono y caja contenedora", () => {
  const box = { x0: 0.1, y0: 0.2, x1: 0.4, y1: 0.6 };
  const poly = boxToPolygon(box);
  assert.equal(poly.length, 4);
  assert.deepEqual(polygonBox(poly), box);
  assert.ok(isAxisRect(poly));
  assert.ok(!isAxisRect(L_SHAPE));
});

test("área en píxeles: una L descuenta el hueco", () => {
  const rect = polygonAreaPx(boxToPolygon({ x0: 0, y0: 0, x1: 0.5, y1: 0.5 }), 1000, 1000);
  assert.equal(Math.round(rect), 250000);
  // L = 0.4x0.2 + 0.2x0.2 = 0.12 → 120000 px²
  assert.equal(Math.round(polygonAreaPx(L_SHAPE, 1000, 1000)), 120000);
});

test("punto adentro y etiqueta dentro de la L", () => {
  assert.ok(pointInPolygon({ x: 0.2, y: 0.2 }, L_SHAPE));
  assert.ok(!pointInPolygon({ x: 0.45, y: 0.45 }, L_SHAPE));
  assert.ok(pointInPolygon(polygonLabelPoint(L_SHAPE), L_SHAPE));
});

test("mover el polígono no lo saca de la imagen", () => {
  const moved = translatePolygon(L_SHAPE, 0.9, -0.5);
  const b = polygonBox(moved);
  assert.equal(b.x1, 1);
  assert.equal(b.y0, 0);
  assert.equal(Math.round((b.x1 - b.x0) * 100), 40);
});

test("agregar, mover y quitar vértices", () => {
  const sq = boxToPolygon({ x0: 0, y0: 0, x1: 1, y1: 1 });
  const withMid = insertVertex(sq, 0);
  assert.equal(withMid.length, 5);
  assert.deepEqual(withMid[1], { x: 0.5, y: 0 });
  const moved = moveVertex(withMid, 1, { x: 0.5, y: -3 });
  assert.deepEqual(moved[1], { x: 0.5, y: 0 });
  assert.equal(removeVertex(withMid, 1).length, 4);
  const tri = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
  assert.equal(removeVertex(tri, 0).length, 3, "un triángulo no pierde vértices");
});

test("las líneas casi rectas se enderezan (en píxeles reales)", () => {
  const from = { x: 0.1, y: 0.1 };
  assert.deepEqual(snapOrtho(from, { x: 0.5, y: 0.12 }, 1000, 1000), { x: 0.5, y: 0.1 });
  assert.deepEqual(snapOrtho(from, { x: 0.11, y: 0.6 }, 1000, 1000), { x: 0.1, y: 0.6 });
  const diag = { x: 0.4, y: 0.4 };
  assert.deepEqual(snapOrtho(from, diag, 1000, 1000), diag);
});

test("imán a vértices cercanos", () => {
  const verts = [{ x: 0.5, y: 0.5 }];
  assert.deepEqual(snapToVertices({ x: 0.505, y: 0.503 }, verts, 1000, 1000, 10), { x: 0.5, y: 0.5 });
  assert.deepEqual(snapToVertices({ x: 0.6, y: 0.6 }, verts, 1000, 1000, 10), { x: 0.6, y: 0.6 });
});

test("limpieza: repetidos y puntos alineados", () => {
  const messy = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0.5, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  assert.equal(cleanPolygon(messy).length, 4);
});

test("polígono de la API: valida, limita y descarta basura", () => {
  assert.equal(normalizePolygon([{ x: 0, y: 0 }, { x: 1.5, y: 0 }, { x: 1, y: 1 }])?.[1]?.x, 1);
  assert.equal(normalizePolygon([{ x: 0, y: 0 }, { x: 1, y: 0 }]), null);
  assert.equal(normalizePolygon([{ x: "a", y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]), null);
  assert.equal(normalizePolygon("nope"), null);
});

test("polígono a metros: centrado y a la medida de la sala", () => {
  const m = polygonToRoomMeters(L_SHAPE, 8, 4);
  assert.deepEqual(m[0], { x: -4, y: -2 });
  assert.deepEqual(m[2], { x: 4, y: 0 });
  assert.deepEqual(m[4], { x: 0, y: 2 });
});
