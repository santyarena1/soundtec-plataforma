import { test } from "node:test";
import assert from "node:assert/strict";
import { armEdges, footprintPolygon, insetPolygon, inwardNormal, isRectangle, isRoundish, isCurved, seatCushions, sofaBackEdges, tidyFootprint, unionRects } from "./plan-shape";
import { polygonAreaPx } from "./plan-polygon";

function canvas(w: number, h: number) {
  const ink = new Uint8Array(w * h);
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) ink[y * w + x] = 1;
  };
  return { ink, line };
}

test("contorno relleno de un sillón en L dibujado como contorno", () => {
  const { ink, line } = canvas(100, 100);
  // L: brazo horizontal 20..80 × 70..80, brazo vertical 70..80 × 20..80
  line(20, 70, 80, 70);
  line(20, 80, 80, 80);
  line(20, 70, 20, 80);
  line(80, 20, 80, 80);
  line(70, 20, 80, 20);
  line(70, 20, 70, 70);
  const poly = footprintPolygon({ x0: 0.2, y0: 0.2, x1: 0.81, y1: 0.81 }, ink, 100, 100);
  assert.ok(poly);
  assert.equal(poly.length, 6, JSON.stringify(poly));
  // Área ≈ 61×11 + 11×50
  const area = polygonAreaPx(poly, 100, 100);
  assert.ok(Math.abs(area - (61 * 11 + 11 * 50)) < 80, String(area));
});

test("respaldo de una L: los dos lados de la esquina de afuera", () => {
  const L = [
    { x: 0, y: 2 },
    { x: 0, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 2 },
  ];
  const back = sofaBackEdges(L, { x: -1, y: -1 }).sort();
  // Lado inferior (1→2) y lado derecho (2→3).
  assert.deepEqual(back, [1, 2]);
});

test("respaldo de un sillón recto: el lado largo opuesto al frente", () => {
  const rect = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 0.9 },
    { x: 0, y: 0.9 },
  ];
  assert.deepEqual(sofaBackEdges(rect, { x: 0, y: -1 }), [2]);
  assert.deepEqual(sofaBackEdges(rect, { x: 0, y: 1 }), [0]);
  assert.ok(isRectangle(rect));
});

test("achicar lado por lado (asiento sin respaldo ni brazos) y agrandar (tapa con vuelo)", () => {
  const rect = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 1 },
    { x: 0, y: 1 },
  ];
  const seat = insetPolygon(rect, [0.2, 0.1, 0, 0.1]);
  assert.deepEqual(
    seat.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]),
    [
      [0.1, 0.2],
      [1.9, 0.2],
      [1.9, 1],
      [0.1, 1],
    ],
  );
  const top = insetPolygon(rect, [-0.03, -0.03, -0.03, -0.03]);
  assert.ok(Math.abs(top[0]!.x + 0.03) < 1e-9 && Math.abs(top[0]!.y + 0.03) < 1e-9);
});

test("redondo vs. recuadro", () => {
  const circle = Array.from({ length: 12 }, (_, i) => ({ x: Math.cos((i / 12) * Math.PI * 2), y: Math.sin((i / 12) * Math.PI * 2) }));
  assert.ok(isRoundish(circle));
  assert.ok(!isRoundish([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]));
});

test("apoyabrazos en los extremos de una L y almohadones con la esquina propia", () => {
  // L en metros: ala inferior 0..3 × 2.1..3, ala derecha 2.1..3 × 0..3.
  const L = [
    { x: 0, y: 2.1 },
    { x: 0, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: 0 },
    { x: 2.1, y: 0 },
    { x: 2.1, y: 2.1 },
  ];
  const back = sofaBackEdges(L, { x: -1, y: -1 });
  assert.deepEqual(armEdges(L, back), [0, 3]);
  const cushions = seatCushions(L, 0.75);
  assert.ok(cushions);
  // Esquina 0.9×0.9 + ala 2.1 (3 piezas) + ala 2.1 (3 piezas).
  assert.equal(cushions.length, 7);
  const area = cushions.reduce((s, c) => s + (c.x1 - c.x0) * (c.y1 - c.y0), 0);
  assert.ok(Math.abs(area - (3 * 0.9 + 0.9 * 2.1)) < 1e-6);
  assert.equal(seatCushions([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1.5, y: 1 }, { x: 0.5, y: 1 }]), null);
});

test("la normal de cada lado apunta hacia adentro", () => {
  const rect = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 1 },
    { x: 0, y: 1 },
  ];
  assert.deepEqual(inwardNormal(rect, 0), { x: -0, y: 1 });
  assert.equal(inwardNormal(rect, 1).x, -1);
});

test("unión de rectángulos pegados: dos piezas forman una L", () => {
  const poly = unionRects(
    [
      { x0: 0, y0: 0, x1: 1, y1: 3 },
      { x0: 1.05, y0: 2, x1: 3, y1: 3 },
    ],
    0.1,
  );
  assert.equal(poly.length, 6, JSON.stringify(poly));
  const xs = poly.map((p) => p.x);
  assert.ok(Math.abs(Math.min(...xs)) < 1e-6 && Math.abs(Math.max(...xs) - 3) < 1e-6);
});

test("contorno de un sillón con el frente abierto (dato real): queda el rectángulo lleno", () => {
  const raw = [[-0.639, -1.098], [0.663, -1.098], [0.663, -1.048], [0.205, -1.048], [0.205, 1.011], [0.663, 1.011], [0.663, 1.073], [-0.133, 1.073], [-0.133, 1.098], [-0.639, 1.098]].map(([x, y]) => ({ x: x!, y: y! }));
  const tidy = tidyFootprint(raw, true);
  assert.equal(tidy.length, 4, JSON.stringify(tidy));
  const xs = tidy.map((p) => p.x);
  assert.ok(Math.min(...xs) < -0.6 && Math.max(...xs) > 0.6);
  // Sin rellenar huecos (mostrador en U con pasillo), el pasillo se respeta.
  const bar = [[0, 0], [3, 0], [3, 1.2], [2.4, 1.2], [2.4, 0.6], [0.6, 0.6], [0.6, 1.2], [0, 1.2]].map(([x, y]) => ({ x: x!, y: y! }));
  assert.equal(tidyFootprint(bar, false).length, 8);
});

test("contorno con escalones de ruido se limpia; la L se mantiene", () => {
  const noisy = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 2 },
    { x: 1.04, y: 2 },
    { x: 1.04, y: 2.03 },
    { x: 3, y: 2.03 },
    { x: 3, y: 3 },
    { x: 0, y: 3 },
  ];
  const tidy = tidyFootprint(noisy, true);
  assert.equal(tidy.length, 6, JSON.stringify(tidy));
});

test("achicar no dispara vértices en esquinas agudas (púas del contorno)", () => {
  // Rectángulo con una púa finita hacia abajo.
  const poly = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 1 },
    { x: 2.01, y: 1 },
    { x: 2.005, y: 3 },
    { x: 2, y: 1 },
    { x: 0, y: 1 },
  ];
  const out = insetPolygon(poly, poly.map(() => 0.06));
  for (const p of out) assert.ok(p.y <= 3.1 && p.y >= -0.1 && p.x >= -0.1 && p.x <= 4.1, JSON.stringify(p));
  // Y el contorno prolijo saca la púa.
  const tidy = tidyFootprint(poly, false);
  assert.ok(Math.max(...tidy.map((p) => p.y)) <= 1.0001, JSON.stringify(tidy));
});

test("mesa redonda u ovalada dibujada: contorno curvo, no escalonado", () => {
  const W = 120;
  const ink = new Uint8Array(W * W);
  // Óvalo de 60×40 celdas centrado en (60,60), solo el contorno.
  for (let a = 0; a < 2 * Math.PI; a += 0.005) {
    const x = Math.round(60 + 30 * Math.cos(a));
    const y = Math.round(60 + 20 * Math.sin(a));
    ink[y * W + x] = 1;
  }
  const poly = footprintPolygon({ x0: 0.24, y0: 0.32, x1: 0.77, y1: 0.69 }, ink, W, W);
  assert.ok(poly && poly.length >= 24, String(poly?.length));
  const xs = poly!.map((p) => p.x * W);
  const ys = poly!.map((p) => p.y * W);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 61) < 3);
  assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - 41) < 3);
  assert.ok(isCurved(poly!));
});

test("contorno que se escapa (recuadro cortando el trazo): sin forma, se usa el recuadro", () => {
  const W = 100;
  const ink = new Uint8Array(W * W);
  // Rectángulo abierto arriba (el recuadro lo corta justo en su borde superior).
  for (let y = 20; y <= 80; y++) ink[y * W + 40] = ink[y * W + 55] = 1;
  for (let x = 40; x <= 55; x++) ink[80 * W + x] = 1;
  assert.equal(footprintPolygon({ x0: 0.4, y0: 0.2, x1: 0.56, y1: 0.81 }, ink, W, W), null);
});
