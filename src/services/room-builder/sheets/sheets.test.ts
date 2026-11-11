import assert from "node:assert/strict";
import { test } from "node:test";
import { pickScale, scaleBarMeters } from "./scale";
import { autoNotInManual, cableLabels, cableTag, cableTotals, physicalFamily, totalLength, type SheetCable } from "./sheet-model";
import { drawableArea, scaledPlanSvg } from "./plan-sheet-svg";
import { diagramCuts, diagramSlices, sliceSvg, wiringDiagramSvg } from "./wiring-diagram-svg";
import { layoutDiagram } from "../wiring/diagram-layout";
import { expandIoPorts } from "../wiring/ports";

const cable = (tag: string, lengthM: number, over: Partial<SheetCable> = {}): SheetCable => ({
  tag,
  fromDevice: "1 · Codec",
  fromPort: "HDMI OUT 1",
  toDevice: "2 · Pantalla",
  toPort: "HDMI 1",
  signal: "HDMI",
  color: "#e11d48",
  cable: null,
  lengthM,
  lengthKind: "plan",
  points: [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
  ],
  ...over,
});

test("escala: elige la normalizada más grande que entra en el área", () => {
  const area = { widthMm: 240, heightMm: 220 };
  assert.deepEqual(pickScale({ widthM: 4, depthM: 3 }, area), { denominator: 20, normalized: true });
  assert.deepEqual(pickScale({ widthM: 5.5, depthM: 4 }, area), { denominator: 25, normalized: true });
  assert.deepEqual(pickScale({ widthM: 9, depthM: 9 }, area), { denominator: 50, normalized: true });
  assert.deepEqual(pickScale({ widthM: 16, depthM: 12 }, area), { denominator: 75, normalized: true });
  assert.deepEqual(pickScale({ widthM: 22, depthM: 20 }, area), { denominator: 100, normalized: true });
  // Planta de un edificio entero: escala real, pero fuera de la serie pedida.
  assert.deepEqual(pickScale({ widthM: 35, depthM: 20 }, area), { denominator: 150, normalized: false });
});

test("escala gráfica: tramo redondo entre 30 y 80 mm de papel", () => {
  assert.equal(scaleBarMeters(20), 1);
  assert.equal(scaleBarMeters(50), 2);
  assert.equal(scaleBarMeters(100), 5);
});

test("etiquetas: dos por cable, cada una dice dónde está y a dónde va", () => {
  const labels = cableLabels([cable("C-01", 3), cable("C-02", 4.5)]);
  assert.equal(labels.length, 4);
  assert.deepEqual(
    labels.filter((l) => l.tag === "C-01").map((l) => [l.end, l.here, l.there]),
    [
      ["A", "1 · Codec", "2 · Pantalla"],
      ["B", "2 · Pantalla", "1 · Codec"],
    ],
  );
});

test("largo total y totales por tipo de cable, marcando lo estimado", () => {
  const cables = [cable("C-01", 3.2), cable("C-02", 4.5, { lengthKind: "estimated" }), cable("C-03", 12.3, { cable: "UTP Cat6", signal: "Red / LAN", color: "#2563eb" })];
  assert.equal(totalLength(cables), 20);
  const totals = cableTotals(cables);
  assert.equal(totals.length, 2);
  assert.deepEqual(totals[0], { cable: "UTP Cat6", signal: "Red / LAN", color: "#2563eb", count: 1, meters: 12.3, estimated: false });
  assert.equal(totals[1]!.cable, "HDMI (cable a definir)");
  assert.equal(totals[1]!.count, 2);
  assert.equal(totals[1]!.meters, 7.7);
  assert.equal(totals[1]!.estimated, true);
});

test("etiqueta correlativa con prefijo del ambiente", () => {
  assert.equal(cableTag(0), "C-01");
  assert.equal(cableTag(11, "LIV"), "LIV-C-12");
});

test("diferencias: cables del armado automático que el manual no tiene", () => {
  const auto = [
    { a: "codec", b: "tv", family: "hdmi" },
    { a: "codec", b: "table", family: "hdmi" },
    { a: "codec", b: "switch-new", family: physicalFamily("lan") },
    { a: "tv", b: "codec", family: "hdmi" },
  ];
  // El manual tiene un solo HDMI codec↔tv (en el sentido contrario) y la red como Dante.
  const manual = [
    { a: "tv", b: "codec", family: "hdmi" },
    { a: "switch-new", b: "codec", family: physicalFamily("dante") },
  ];
  assert.deepEqual(autoNotInManual(auto, manual), [1, 3]);
});

test("planta a escala: SVG en mm del área y escala impresa", () => {
  const area = { w: 268, h: 260 };
  const floor = [
    { x: -2, y: -1.5 },
    { x: 2, y: -1.5 },
    { x: 2, y: 1.5 },
    { x: -2, y: 1.5 },
  ];
  const scale = pickScale({ widthM: 4, depthM: 3 }, drawableArea(area));
  const svg = scaledPlanSvg({
    floor,
    walls: floor.map((a, i) => ({ a, b: floor[(i + 1) % 4]!, lengthM: 0, openings: i === 0 ? [{ kind: "door" as const, from: 1, to: 1.9 }] : [] })),
    furniture: [],
    devices: [{ n: 1, role: "display", units: [{ x: 0, z: -1.4 }], remote: false }],
    cables: [{ tag: "C-01", color: "#e11d48", lengthKind: "estimated", points: [{ x: 0, z: -1.4 }, { x: 0, z: 1 }] }],
    areaMm: area,
    scale: scale.denominator,
  });
  assert.equal(scale.denominator, 20);
  assert.match(svg, /width="268mm" height="260mm"/);
  assert.match(svg, /ESCALA 1:20/);
  assert.match(svg, /4,00/);
  assert.match(svg, /stroke-dasharray="1.6 0.9"/);
  assert.match(svg, />C-01</);
});

test("diagrama manual: bloques numerados con los puertos de la ficha y etiqueta del cable", () => {
  const dev = (deviceId: string, role: string, cls: string) => ({ deviceId, unit: 0, label: deviceId, short: deviceId.toUpperCase(), x: 0, y: 0, z: 0, rotY: 0, mount: "wall", remote: false, role, cls });
  const layout = layoutDiagram({
    devices: [dev("pc", "other", "source"), dev("tv", "display", "display")],
    ports: {
      pc: expandIoPorts([{ signal: "hdmi", direction: "out", count: 1, connector: null, channels: null, poe: null, label: "HDMI OUT", evidence: "" }]),
      tv: expandIoPorts([{ signal: "hdmi", direction: "in", count: 2, connector: null, channels: null, poe: null, label: "HDMI 1-2", evidence: "" }]),
    },
    wires: [{ id: "w1", from: { deviceId: "pc", unit: 0, portId: "out:hdmi:1" }, to: { deviceId: "tv", unit: 0, portId: "in:hdmi:1" }, signal: "hdmi", cableProductId: null, label: "HDMI-001", points: [], lengthOverrideM: null, origin: "manual", lengthM: 2 }],
    issues: [],
  } as never);
  const svg = wiringDiagramSvg(layout, { numbers: { "pc#0": 1, "tv#0": 2 }, tags: { w1: "C-01" } });
  assert.match(svg, />1 · PC</);
  assert.match(svg, />HDMI 2</);
  assert.match(svg, />C-01</);
});

test("diagrama largo: se parte solo en los huecos entre columnas", () => {
  const blocks = [0, 1, 2, 3].map((c) => ({ x: 40 + c * 400, w: 240 }));
  const cuts = diagramCuts(blocks);
  assert.deepEqual(cuts, [360, 760, 1160]);
  assert.deepEqual(diagramSlices(1640, cuts, 2), [
    [0, 760],
    [760, 1640],
  ]);
  assert.deepEqual(diagramSlices(1640, cuts, 1), [[0, 1640]]);
  assert.match(sliceSvg(`<svg viewBox="0 0 1640 500" width="1640"><rect/></svg>`, 760, 1640, 500), /viewBox="760 0 880 500".*clip-path.*<rect\/><\/g><\/svg>$/);
});
