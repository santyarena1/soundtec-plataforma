import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateMetersPerPixel, normalizePlanAnalysis, roomSizeMeters, templateFromName } from "./plan-analysis";

const KEYS = ["residential-living-m", "residential-bedroom-m", "residential-dining-m", "vc-meeting-m"];

test("normaliza recuadros, tipos y descarta lo inválido", () => {
  const a = normalizePlanAnalysis(
    {
      kind: "residencial",
      summary: "Casa de 3 ambientes",
      rooms: [
        { name: "Living", templateKey: "residential-living-m", box: { x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.4 }, widthM: "6,2", depthM: 4.5 },
        { name: "Dormitorio 1", templateKey: "inventado", box: { x0: 60, y0: 10, x1: 90, y1: 40 } },
        { name: "Baño", box: { x0: 0.6, y0: 0.5, x1: 0.7, y1: 0.6 } },
        { name: "Mancha", box: { x0: 0.1, y0: 0.1, x1: 0.105, y1: 0.5 } },
        { name: "Sin caja" },
      ],
    },
    KEYS,
  );
  assert.equal(a.kind, "residencial");
  assert.equal(a.rooms.length, 3);
  assert.deepEqual(a.rooms.map((r) => r.templateKey), ["residential-living-m", "residential-bedroom-m", null]);
  assert.deepEqual(a.rooms.map((r) => r.include), [true, true, false]);
  assert.equal(a.rooms[0].widthM, 6.2);
  assert.deepEqual(a.rooms[1].box, { x0: 0.6, y0: 0.1, x1: 0.9, y1: 0.4 });
});

test("tipo desconocido cae en 'otro'", () => {
  assert.equal(normalizePlanAnalysis({ kind: "nave espacial", rooms: [] }, KEYS).kind, "otro");
});

test("nombres comunes se mapean a ambientes; servicios no llevan equipos", () => {
  assert.equal(templateFromName("Cocina comedor"), "residential-dining-m");
  assert.equal(templateFromName("Baño principal"), "restroom-s");
  assert.equal(templateFromName("Depósito"), null);
  assert.equal(templateFromName("Sala de directorio"), "vc-boardroom-m");
  assert.equal(templateFromName("Oficina gerencia"), "office-private-m");
  assert.equal(templateFromName("Open space"), "office-open-l");
  assert.equal(templateFromName("Sala de descanso"), "breakroom-m");
  assert.equal(templateFromName("Pasillo"), "circulation-m");
  assert.equal(templateFromName("Consumo"), undefined);
  assert.equal(templateFromName("Algo raro"), undefined);
});

test("escala por mediana de medidas leídas y medidas por ambiente", () => {
  const rooms = normalizePlanAnalysis(
    {
      rooms: [
        { name: "Living", box: { x0: 0, y0: 0, x1: 0.5, y1: 0.25 }, widthM: 6, depthM: 3 },
        { name: "Dormitorio", box: { x0: 0.5, y0: 0, x1: 0.75, y1: 0.25 }, widthM: 3, depthM: 3 },
        { name: "Comedor", box: { x0: 0, y0: 0.5, x1: 0.5, y1: 1 } },
      ],
    },
    KEYS,
  ).rooms;
  // imagen 1200 x 1200: 600 px = 6 m → 0.01 m/px
  const mpp = estimateMetersPerPixel(rooms, 1200, 1200);
  assert.ok(mpp && Math.abs(mpp - 0.01) < 1e-9);
  assert.deepEqual(roomSizeMeters(rooms[2], mpp, 1200, 1200), { widthM: 6, depthM: 6 });
  assert.equal(estimateMetersPerPixel([rooms[2]], 1200, 1200), null);
  assert.equal(roomSizeMeters(rooms[2], null, 1200, 1200), null);
  assert.deepEqual(roomSizeMeters(rooms[0], null, 1200, 1200), { widthM: 6, depthM: 3 });
});

test("marcas numeradas: cada espacio toma su nombre; se descartan los que no son ambientes", async () => {
  const { normalizeMarkedAnalysis } = await import("./plan-analysis");
  const boxes = [
    { x0: 0.05, y0: 0.05, x1: 0.4, y1: 0.4 },
    { x0: 0.4, y0: 0.05, x1: 0.8, y1: 0.4 },
    { x0: 0.8, y0: 0.05, x1: 0.95, y1: 0.2 },
  ];
  const a = normalizeMarkedAnalysis(
    {
      kind: "residencial",
      summary: "Casa",
      marks: [
        { n: 1, name: "Living", templateKey: "residential-living-m", widthM: 6, depthM: 5 },
        { n: 2, name: "Dormitorio 3", templateKey: "nada" },
        { n: 3, notARoom: true },
      ],
      missing: [{ name: "Galería", box: { x0: 0.1, y0: 0.6, x1: 0.5, y1: 0.9 } }],
    },
    boxes,
    KEYS,
  );
  assert.deepEqual(a.rooms.map((r) => r.name), ["Living", "Dormitorio 3", "Galería"]);
  assert.deepEqual(a.rooms[1].box, boxes[1]);
  assert.equal(a.rooms[1].templateKey, "residential-bedroom-m");
  assert.equal(a.rooms[0].widthM, 6);
  assert.equal(a.rooms[2].id, "m1");
});

test("un dormitorio secundario es dormitorio aunque la IA diga que no lleva equipos", async () => {
  const { normalizeMarkedAnalysis } = await import("./plan-analysis");
  const a = normalizeMarkedAnalysis(
    { marks: [{ n: 1, name: "Dormitorio 3", templateKey: null }, { n: 2, name: "Estudio", templateKey: null }] },
    [
      { x0: 0.1, y0: 0.1, x1: 0.4, y1: 0.4 },
      { x0: 0.5, y0: 0.1, x1: 0.8, y1: 0.4 },
    ],
    KEYS,
  );
  assert.equal(a.rooms[0].templateKey, "residential-bedroom-m");
  assert.equal(a.rooms[0].include, true);
  assert.equal(a.rooms[1].templateKey, null);
});

test("dos espacios vecinos con el mismo nombre se unen; distintos o lejanos no", async () => {
  const { mergeSameNamedNeighbors } = await import("./plan-analysis");
  const room = (id: string, name: string, x0: number, x1: number, y0 = 0.1, y1 = 0.4) => ({
    id,
    name,
    templateKey: null,
    box: { x0, y0, x1, y1 },
    widthM: null,
    depthM: null,
    include: false,
  });
  const out = mergeSameNamedNeighbors([
    room("a", "Baño", 0.1, 0.2),
    room("b", "baño", 0.2, 0.3),
    room("c", "Baño 2", 0.3, 0.4),
    room("d", "Baño", 0.7, 0.8),
  ]);
  assert.deepEqual(out.map((r) => r.name), ["Baño", "Baño 2", "Baño"]);
  assert.deepEqual(out[0].box, { x0: 0.1, y0: 0.1, x1: 0.3, y1: 0.4 });
});

test("todo ambiente se puede generar: sin tipo claro queda como ambiente libre (destildado)", async () => {
  const { normalizeMarkedAnalysis } = await import("./plan-analysis");
  const keys = [...KEYS, "generic-room", "restroom-s"];
  const a = normalizeMarkedAnalysis(
    { marks: [{ n: 1, name: "Espacio raro", templateKey: null }, { n: 2, name: "Baño" }, { n: 3, name: "Placard" }] },
    [
      { x0: 0.1, y0: 0.1, x1: 0.4, y1: 0.4 },
      { x0: 0.5, y0: 0.1, x1: 0.8, y1: 0.4 },
      { x0: 0.1, y0: 0.5, x1: 0.3, y1: 0.7 },
    ],
    keys,
  );
  assert.deepEqual(a.rooms.map((r) => [r.templateKey, r.include]), [["generic-room", false], ["restroom-s", false], [null, false]]);
});
