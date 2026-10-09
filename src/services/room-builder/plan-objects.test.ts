import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRoomObjects, facingAwayFromWall, guessKind, objectsToFurniture } from "./plan-objects";

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
  assert.equal(items[0]!.rotY, Math.PI);
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
