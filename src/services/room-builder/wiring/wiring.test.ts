import { test } from "node:test";
import assert from "node:assert/strict";
import { expandIoPorts, portsFromSignals, signalsCompatible } from "./ports";
import { validateWires, wireRunM } from "./validate";
import type { Wire, WirePort } from "./types";

const io = (signal: string, direction: string, count: number, label: string) => ({ signal, direction, count, label, connector: null, channels: null, poe: null, evidence: "" }) as never;

test("puertos: los grupos de la ficha se separan en puertos con nombre propio", () => {
  const ports = expandIoPorts([io("hdmi", "in", 4, "HDMI IN 1-4"), io("hdmi", "out", 1, "HDMI OUT"), io("rs232", "bidir", 2, "COM")]);
  assert.deepEqual(
    ports.map((p) => p.label),
    ["HDMI IN 1", "HDMI IN 2", "HDMI IN 3", "HDMI IN 4", "HDMI OUT", "COM 1", "COM 2"],
  );
  assert.equal(new Set(ports.map((p) => p.id)).size, ports.length, "ids únicos");
});

test("puertos de un genérico a partir de sus señales", () => {
  const ports = portsFromSignals([{ signal: "hdmi", direction: "in", count: 2 }, { signal: "rs232", direction: "bidir" }]);
  assert.deepEqual(ports.map((p) => p.label), ["HDMI IN 1", "HDMI IN 2", "Control RS-232"]);
});

test("señales compatibles: USB entre sí, red con Dante, micrófono con audio analógico; HDMI no con USB", () => {
  assert.ok(signalsCompatible("usb-a", "usb-c"));
  assert.ok(signalsCompatible("lan", "dante"));
  assert.ok(signalsCompatible("mic", "analog-audio"));
  assert.ok(!signalsCompatible("hdmi", "usb-a"));
});

test("largo: subida y bajada por el cielorraso, tramos por los quiebres, terminación y reserva", () => {
  // Equipo de pared a 1,5 m y otro a 2 m, 4 m en planta, techo de 2,7 m.
  const len = wireRunM({ x: 0, y: 1.5, z: 0 }, { x: 4, y: 2, z: 0 }, [], 2.7);
  // (4 + (2,65-1,5) + (2,65-2) + 0,6) × 1,1 = 7,04
  assert.equal(len, 7);
  // Rack y mesa (bajos): corre por el piso.
  // (3 + 0,5 + 0,75 + 0,6) × 1,1 = 5,34
  assert.equal(wireRunM({ x: 0, y: 0.5, z: 0 }, { x: 0, y: 0.75, z: 3 }, [], 2.7), 5.3);
});

test("validación: señales distintas, dos entradas, puerto repetido y largo excedido", () => {
  const ports: Record<string, WirePort[]> = {
    sw: expandIoPorts([io("hdmi", "out", 1, "HDMI OUT"), io("hdmi", "in", 2, "HDMI IN 1-2"), io("usb-b", "out", 1, "USB")]),
    tv: expandIoPorts([io("hdmi", "in", 2, "HDMI 1-2")]),
  };
  const w = (id: string, from: string, to: string): Wire => ({ id, from: { deviceId: from.split("/")[0]!, unit: 0, portId: from.split("/")[1]! }, to: { deviceId: to.split("/")[0]!, unit: 0, portId: to.split("/")[1]! }, signal: "hdmi", cableProductId: null, label: null, points: [], lengthOverrideM: null, origin: "manual" });
  const wires = [
    w("ok", "sw/out:hdmi:1", "tv/in:hdmi:1"),
    w("mix", "sw/out:usb-b:1", "tv/in:hdmi:2"),
    w("ins", "sw/in:hdmi:1", "tv/in:hdmi:2"),
    w("dup", "sw/out:hdmi:1", "tv/in:hdmi:1"),
  ];
  const issues = validateWires(wires, (id) => ports[id] ?? null, (x) => (x.id === "ok" ? 12 : 3));
  const by = (id: string) => issues.filter((i) => i.wireId === id).map((i) => i.text);
  assert.ok(by("ok").some((t) => /supera/.test(t)), "12 m de HDMI");
  assert.ok(by("mix").some((t) => /Señales distintas/.test(t)));
  assert.ok(by("ins").some((t) => /Dos entradas/.test(t)));
  assert.ok(by("dup").some((t) => /ya está usado/.test(t)));
});

test("propuesta automática → cables editables: puertos libres de la señal, conserva lo manual y numera etiquetas", async () => {
  const { autoWires } = await import("./model");
  const model = {
    devices: [],
    ports: {
      codec: expandIoPorts([io("hdmi", "out", 2, "HDMI OUT 1-2")]),
      tv: expandIoPorts([io("hdmi", "in", 3, "HDMI 1-3")]),
    },
    wires: [],
    issues: [],
  };
  const manual: Wire = { id: "m1", from: { deviceId: "codec", unit: 0, portId: "out:hdmi:1" }, to: { deviceId: "tv", unit: 0, portId: "in:hdmi:3" }, signal: "hdmi", cableProductId: null, label: "TV-PRINCIPAL", points: [], lengthOverrideM: null, origin: "manual" };
  const plan = {
    nodes: [],
    links: [
      { id: "l1", from: "codec#0", to: "tv#0", signal: "hdmi", fromPort: "HDMI", toPort: "HDMI", route: [[0, 1, 0], [0, 2.6, 0], [3, 2.6, 0], [3, 2.6, 2], [3, 1.4, 2]], runM: 0, cableM: 0 },
    ],
    findings: [],
    totals: [],
    missing: [],
  } as never;
  const out = autoWires(plan, model as never, { version: 1, wires: [manual], ports: {} });
  assert.equal(out.wires.length, 2);
  assert.equal(out.wires[0]!.id, "m1", "el manual queda");
  const auto = out.wires[1]!;
  assert.equal(auto.from.portId, "out:hdmi:2", "usa la salida libre");
  assert.equal(auto.to.portId, "in:hdmi:1");
  assert.deepEqual(auto.points, [{ x: 3, z: 0 }], "quiebre en planta");
  assert.equal(auto.label, "HDMI-001");
});
