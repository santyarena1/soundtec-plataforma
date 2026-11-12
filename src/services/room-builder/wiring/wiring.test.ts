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

test("recorrido: subida y bajada por el cielorraso y tramos por los quiebres (sin reservas)", () => {
  // Equipo de pared a 1,5 m y otro a 2 m, 4 m en planta, techo de 2,7 m.
  // 4 + (2,65-1,5) + (2,65-2) = 5,8
  assert.equal(wireRunM({ x: 0, y: 1.5, z: 0 }, { x: 4, y: 2, z: 0 }, [], 2.7), 5.8);
  // Rack y mesa (bajos): corre por el piso. 3 + 0,5 + 0,75 = 4,25
  assert.equal(wireRunM({ x: 0, y: 0.5, z: 0 }, { x: 0, y: 0.75, z: 3 }, [], 2.7), 4.25);
});

test("largo final: misma fórmula en el plano técnico y en el motor automático", async () => {
  const { cableMeters } = await import("../cabling");
  const { wireLengthM } = await import("./validate");
  // Rollo: (5,8 + 1,2) × 1,1 = 7,7 → 8 m; armado: 5,8 + 1,2 = 7 → 7,5 m comercial.
  assert.equal(wireLengthM(5.8, "lan"), 8);
  assert.equal(wireLengthM(5.8, "hdmi"), 7.5);
  for (const run of [0.4, 3.2, 5.8, 8.6, 12.3, 47]) {
    assert.equal(wireLengthM(run, "lan"), cableMeters(run, "lan"), `UTP ${run} m`);
    assert.equal(wireLengthM(run, "speaker"), cableMeters(run, "speaker"), `parlante ${run} m`);
    assert.equal(wireLengthM(run, "hdmi"), cableMeters(run, "hdmi"), `HDMI ${run} m`);
    assert.equal(wireLengthM(run, "usb-a"), cableMeters(run, "usb"), `USB ${run} m`);
    assert.equal(wireLengthM(run, "analog-audio"), cableMeters(run, "line"), `audio ${run} m`);
  }
});

test("UTP: el mismo límite (100 m sobre el largo total) y el mismo nivel en los dos lados", async () => {
  const { planCabling } = await import("../cabling");
  const ports: Record<string, WirePort[]> = {
    a: expandIoPorts([io("lan", "bidir", 1, "LAN")]),
    b: expandIoPorts([io("lan", "bidir", 1, "LAN")]),
  };
  const w: Wire = { id: "n", from: { deviceId: "a", unit: 0, portId: "bidir:lan:1" }, to: { deviceId: "b", unit: 0, portId: "bidir:lan:1" }, signal: "lan", cableProductId: null, label: null, points: [], lengthOverrideM: null, origin: "manual" };
  assert.equal(validateWires([w], (id) => ports[id] ?? null, () => 99).length, 0, "99 m entra");
  const over = validateWires([w], (id) => ports[id] ?? null, () => 101);
  assert.equal(over[0]?.level, "error", "101 m es error en el plano técnico");
  // Motor: un tramo cuyo cable final pasa de 100 m también es error.
  const dev = (id: string, x: number) => ({ id, label: id, cls: "control" as const, ports: { inputs: [], outputs: [], network: 1 }, pos: { x, y: 2.5, z: 0 }, mount: "ceiling" });
  const sw = { id: "sw", label: "Switch", cls: "switch" as const, ports: { inputs: [], outputs: [], network: 24 }, pos: { x: -60, y: 2.5, z: 0 }, mount: "ceiling" };
  const plan = planCabling({ nodes: [sw, dev("far", 60)], dims: { widthM: 130, depthM: 10, heightM: 3 } });
  const link = plan.links.find((l) => l.signal === "lan")!;
  assert.ok(link.cableM > 100);
  assert.ok(plan.findings.some((f) => f.level === "error" && f.linkId === link.id));
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

test("rótulos de rango: CH1-CH4, OUT 1-OUT 8, ZONE 1-4", () => {
  const labels = (l: string, n: number) => expandIoPorts([io("speaker", "out", n, l)]).map((p) => p.label);
  assert.deepEqual(labels("CH1-CH4", 4), ["CH1", "CH2", "CH3", "CH4"]);
  assert.deepEqual(labels("OUT 1-OUT 8", 3), ["OUT 1", "OUT 2", "OUT 3"]);
  assert.deepEqual(labels("ZONE 1-4", 2), ["ZONE 1", "ZONE 2"]);
});

test("equipo sin ficha: puertos genéricos por enlace para cablear todos los parlantes", async () => {
  const { autoWires } = await import("./model");
  const model = { devices: [], ports: { amp: [] as never[], s1: [], s2: [], s3: [] }, wires: [], issues: [] };
  const link = (n: number) => ({ id: `l${n}`, from: "amp#0", to: `s${n}#0`, signal: "speaker", fromPort: "", toPort: "", route: [], runM: 0, cableM: 0 });
  const plan = { nodes: [], links: [link(1), link(2), link(3)], findings: [], totals: [], missing: [] } as never;
  const out = autoWires(plan, model as never, { version: 1, wires: [], ports: {} });
  assert.equal(out.wires.length, 3, "los tres parlantes quedan cableados");
  assert.equal(out.ports.amp!.length, 3);
  assert.equal(out.ports.amp![0]!.source, "generic");
  assert.equal(new Set(out.wires.map((w) => w.from.portId)).size, 3, "una salida por parlante");
});

test("salida de parlante cableada a mano: carga mínima, 80 % en 70 V, mezcla de modos y datos estimados", async () => {
  const { devicePorts } = await import("../device-ports");
  const caps = (c: Record<string, unknown>) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { value: v, evidence: "x" }])) as never;
  const sheet = (ports: unknown[], c: Record<string, unknown>) => devicePorts({ ports: ports as never, capabilities: caps(c) });
  const ampIo = [io("speaker", "out", 2, "CH1-CH2")];
  const spkIo = [io("speaker", "in", 1, "Entrada")];
  const electrical: Record<string, { label: string; ports: ReturnType<typeof devicePorts> }> = {
    amp: { label: "Amplificador 4 Ω", ports: sheet(ampIo, { lineVoltage: "both", ampWattsPerChannel: { "4Ω": 150, "70V": 60 }, minLoadOhms: 4 }) },
    s4a: { label: "Parlante 4 Ω A", ports: sheet(spkIo, { lineVoltage: "low-z", impedanceOhms: 4 }) },
    s4b: { label: "Parlante 4 Ω B", ports: sheet(spkIo, { lineVoltage: "low-z", impedanceOhms: 4 }) },
    sx: { label: "Parlante sin dato", ports: sheet(spkIo, { lineVoltage: "low-z" }) },
    ...Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`l${k}`, { label: `Parlante 70V ${k + 1}`, ports: sheet(spkIo, { lineVoltage: "70v", transformerTaps: { "70V": [7.5] } }) }])),
  };
  const ports: Record<string, WirePort[]> = Object.fromEntries(Object.keys(electrical).map((id) => [id, expandIoPorts(id === "amp" ? ampIo : spkIo)]));
  const ch1 = ports.amp![0]!.id;
  const ch2 = ports.amp![1]!.id;
  const w = (id: string, spk: string, ch: string): Wire => ({ id, from: { deviceId: "amp", unit: 0, portId: ch }, to: { deviceId: spk, unit: 0, portId: ports[spk]![0]!.id }, signal: "speaker", cableProductId: null, label: null, points: [], lengthOverrideM: null, origin: "manual" });
  const check = (wires: Wire[]) => validateWires(wires, (id) => ports[id] ?? null, () => 5, (id) => electrical[id] ?? null, { tapW: 7.5 });

  // Dos de 4 Ω en una salida de 4 Ω: 2 Ω, error en los dos cables.
  const low = check([w("a", "s4a", ch1), w("b", "s4b", ch1)]);
  assert.equal(low.filter((i) => i.level === "error" && /2 Ω y Amplificador 4 Ω admite 4 Ω/.test(i.text)).length, 2);
  // Uno por salida: sin error.
  assert.ok(!check([w("a", "s4a", ch1), w("b", "s4b", ch2)]).some((i) => i.level === "error"));
  // 8 × 7,5 W = 60 W en una salida de 60 W en 70 V: pasa del 80 % (48 W).
  const line = check(Array.from({ length: 8 }, (_, k) => w(`l${k}`, `l${k}`, ch1)));
  assert.ok(line.some((i) => i.level === "error" && /60 W en 70V/.test(i.text)));
  assert.ok(!check(Array.from({ length: 6 }, (_, k) => w(`l${k}`, `l${k}`, ch1))).some((i) => i.level === "error"), "6 × 7,5 = 45 W entra");
  // Baja impedancia y 70 V en la misma salida.
  assert.ok(check([w("a", "s4a", ch2), w("l", "l0", ch2)]).some((i) => /mezcla parlantes/.test(i.text)));
  // Dato faltante: aviso visible, no error.
  const est = check([w("x", "sx", ch1)]);
  assert.ok(est.some((i) => i.level === "warn" && /Dato estimado .*impedancia de Parlante sin dato: 8 Ω típico/.test(i.text)));
  // Sin datos eléctricos (llamada vieja) no cambia nada.
  assert.equal(validateWires([w("a", "s4a", ch1), w("b", "s4b", ch1)], (id) => ports[id] ?? null, () => 5).length, 0);
});
