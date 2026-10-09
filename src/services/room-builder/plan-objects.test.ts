import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRoomObjects, facingAwayFromWall, guessKind, mergeSeating, objectsToFurniture, snapBoxToInk } from "./plan-objects";

/** Grilla 100×100 (1 celda = 0,1 m): ambiente de 0.1 a 0.9; sillón contra la pared de abajo; mesa al medio. */
function grid() {
  const width = 100;
  const height = 100;
  const ink = new Uint8Array(width * height);
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let x = x0; x <= x1; x++) {
      ink[y0 * width + x] = 1;
      ink[y1 * width + x] = 1;
    }
    for (let y = y0; y <= y1; y++) {
      ink[y * width + x0] = 1;
      ink[y * width + x1] = 1;
    }
  };
  rect(30, 80, 60, 88); // sillón 3,1 × 0,9 m contra la pared de abajo (y = 90)
  rect(40, 40, 52, 50); // mesa 1,3 × 1,1 m al medio
  ink[20 * width + 20] = 1; // una mancha suelta (no es objeto)
  return { ink, width, height };
}
const room = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
];

test("encuentra los objetos del ambiente y descarta lo muy chico", () => {
  const { ink, width, height } = grid();
  const objs = extractRoomObjects(ink, width, height, room, 0.1);
  assert.equal(objs.length, 2);
  const sofa = objs.find((o) => o.box.y1 > 0.85)!;
  assert.ok(sofa.againstWall.includes("down"));
  assert.equal(facingAwayFromWall(sofa.againstWall), "up");
});

test("clasificación sin IA por medidas y tipo de ambiente", () => {
  assert.equal(guessKind(3.1, 0.9, "residential", "residential-living-m"), "sofa");
  assert.equal(guessKind(1.6, 2.0, "residential", "residential-bedroom-m"), "bed");
  assert.equal(guessKind(0.4, 0.7, "common", "restroom-s"), "toilet");
  assert.equal(guessKind(1.7, 0.75, "common", "restroom-s"), "bathtub");
  assert.equal(guessKind(3, 0.6, "residential", "residential-dining-m"), "kitchen-counter");
  assert.equal(guessKind(0.4, 0.4, "lobby", "lobby-m"), "planter");
});

test("objeto → mueble 3D en su lugar y tamaño (el sillón mira al ambiente)", () => {
  const map = { centerPx: { x: 500, y: 500 }, mppX: 0.01, mppZ: 0.01, widthPx: 1000, heightPx: 1000 };
  const items = objectsToFurniture(
    [{ box: { x0: 0.3, y0: 0.8, x1: 0.61, y1: 0.89 }, againstWall: ["down"], density: 0.2, kind: "sofa", facing: "up" }],
    map,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0]!.kind, "sofa");
  assert.equal(items[0]!.x, -0.45);
  assert.equal(items[0]!.z, 3.45);
  assert.equal(items[0]!.w, 3.1);
  // Se arma sobre su contorno (sin girar): el respaldo es el lado de la pared (abajo, y máxima).
  assert.equal(items[0]!.rotY, 0);
  const shape = items[0]!.shape!;
  assert.equal(shape.length, 4);
  assert.equal(items[0]!.backEdges!.length, 1);
  const i = items[0]!.backEdges![0]!;
  const maxY = Math.max(...shape.map((p) => p.y));
  assert.ok(Math.abs(shape[i]!.y - maxY) < 1e-6 && Math.abs(shape[(i + 1) % 4]!.y - maxY) < 1e-6);
});

test("juego de comedor: mesa más chica que el recuadro y sillas alrededor; puertas y textos no se arman", () => {
  const map = { centerPx: { x: 0, y: 0 }, mppX: 0.01, mppZ: 0.01, widthPx: 1000, heightPx: 1000 };
  const items = objectsToFurniture(
    [
      { box: { x0: 0.1, y0: 0.1, x1: 0.32, y1: 0.28 }, againstWall: [], density: 0.2, kind: "dining-set", facing: "down" },
      { box: { x0: 0.5, y0: 0.5, x1: 0.6, y1: 0.6 }, againstWall: [], density: 0.1, kind: "door", facing: "down" },
    ],
    map,
  );
  const table = items.find((i) => i.kind === "conference-table")!;
  assert.ok(table.w! < 2.2 && table.w! >= 1.2);
  assert.ok(items.filter((i) => i.kind === "side-chair").length >= 4);
  assert.ok(!items.some((i) => i.id.includes("plan-obj-1")));
});

test("piezas de asiento pegadas se unen en un solo sillón en L; las sueltas no", () => {
  const piece = (x0: number, y0: number, x1: number, y1: number, kind: "sofa" | "armchair" | "table") => ({
    box: { x0, y0, x1, y1 },
    againstWall: [],
    density: 0.3,
    kind,
    facing: "up" as const,
    shape: null,
  });
  const out = mergeSeating(
    [
      piece(0.1, 0.1, 0.2, 0.4, "armchair"),
      piece(0.2, 0.3, 0.5, 0.4, "sofa"),
      // Sillón suelto frente a la mesa, separado.
      piece(0.7, 0.1, 0.8, 0.2, "armchair"),
      // Pegado sólo por la esquina: no es parte de la L.
      piece(0.5, 0.4, 0.6, 0.5, "armchair"),
      piece(0.3, 0.15, 0.45, 0.25, "table"),
    ],
    0.01,
    0.01,
  );
  const sofas = out.filter((o) => o.kind === "sofa");
  assert.equal(sofas.length, 1);
  assert.deepEqual(sofas[0]!.box, { x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.4 });
  assert.equal(sofas[0]!.shape?.length, 6);
  assert.equal(out.filter((o) => o.kind === "armchair").length, 2);
  assert.equal(out.length, 4);
});

test("recuadro de la IA con las esquinas al revés: se ordena", () => {
  const ink = new Uint8Array(100 * 100);
  for (let x = 20; x <= 40; x++) for (let y = 20; y <= 30; y++) ink[y * 100 + x] = 1;
  const box = snapBoxToInk({ x0: 0.41, y0: 0.31, x1: 0.2, y1: 0.2 }, { x0: 0, y0: 0, x1: 1, y1: 1 }, ink, 100, 100);
  assert.ok(box.x1 > box.x0 && box.y1 > box.y0, JSON.stringify(box));
  assert.ok(Math.abs(box.x0 - 0.2) < 0.011 && Math.abs(box.x1 - 0.41) < 0.011);
});

test("ajuste a las líneas: una alfombra que cruza por debajo no estira el sillón", () => {
  const W = 100;
  const ink = new Uint8Array(W * W);
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let x = x0; x <= x1; x++) ink[y0 * W + x] = ink[y1 * W + x] = 1;
    for (let y = y0; y <= y1; y++) ink[y * W + x0] = ink[y * W + x1] = 1;
  };
  rect(20, 20, 50, 35); // sillón
  rect(10, 30, 70, 60); // alfombra
  const box = snapBoxToInk({ x0: 0.18, y0: 0.22, x1: 0.53, y1: 0.37 }, { x0: 0.1, y0: 0.2, x1: 0.71, y1: 0.61 }, ink, W, W);
  const r = (v: number) => Math.round(v * 100);
  assert.deepEqual([r(box.x0), r(box.y0), r(box.x1), r(box.y1)], [20, 20, 51, 36]);
});
