import { test } from "node:test";
import assert from "node:assert/strict";
import { cableMeters, planCabling, routeCable, routeLength, type CableNode } from "./cabling";
import { deviceClass, devicePorts } from "./device-ports";
import type { IoCapabilities, IoPort, IoProfileData, IoSignal } from "./io-profile/types";

const dims = { widthM: 6, depthM: 4, heightM: 2.8 };

/** Perfil de puertos como queda cargado desde la ficha. */
function io(ports: Array<[IoSignal, IoPort["direction"], number, Partial<IoPort>?]>, caps: Record<string, unknown> = {}): IoProfileData {
  return {
    ports: ports.map(([signal, direction, count, extra]) => ({ signal, direction, count, connector: null, channels: null, poe: null, label: `${signal} ${direction}`, evidence: "cita", ...extra })),
    capabilities: Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, { value: v, evidence: "cita" }])) as IoCapabilities,
  };
}

function node(id: string, role: string, name: string, pos: [number, number, number], mount: string, profile: IoProfileData | null, kind?: "amplifier"): CableNode {
  const spec = kind ? { kind, channels: null, wattsPerChannel: null, minOhms: null, nominalOhms: null, highImpedance: false, streaming: false, networked: false, source: "auto" as const } : null;
  return { id, label: name, cls: deviceClass({ role, slotKey: role, name, spec }), ports: devicePorts(profile), pos: { x: pos[0], y: pos[1], z: pos[2] }, mount, productId: `p-${id}` };
}

const CODEC = io([["hdmi", "out", 2], ["hdmi", "in", 1], ["usb-a", "bidir", 3], ["lan", "bidir", 1]]);
const DISPLAY = io([["hdmi", "in", 3], ["rs232", "in", 1], ["lan", "bidir", 1]]);
const CAMERA = io([["usb-c", "bidir", 1]]);
const MXA = io([["dante", "bidir", 1, { poe: "pd" }]], { danteTx: 9, poeWatts: 12.95 });
const SPEAKER = io([["speaker", "in", 1]], { lineVoltage: "both" });
const AMP = io([["speaker", "out", 4], ["analog-audio", "in", 4], ["dante", "bidir", 1]], { danteRx: 4, lineVoltage: "low-z" });
const DSP = io([["analog-audio", "in", 4], ["analog-audio", "out", 4], ["usb-b", "bidir", 1], ["dante", "bidir", 1]], { danteRx: 8, danteTx: 8 });
const CP4N = io([["rs232", "bidir", 3], ["ir", "out", 8], ["lan", "bidir", 1]]);
const TOUCH = io([["lan", "bidir", 1, { poe: "pd" }]], { poeWatts: 6.5 });

function meetingRoom(opts: { extraDisplays?: number; missingTouch?: boolean } = {}) {
  const nodes: CableNode[] = [
    node("codec", "codec", "Lenovo ThinkSmart Core Teams Rooms PC", [-2.8, 0.45, 1.8], "rack", CODEC),
    node("d1", "display", "Samsung QM65C", [-0.9, 1.4, -1.95], "wall", DISPLAY),
    node("d2", "display", "Samsung QM65C", [0.9, 1.4, -1.95], "wall", DISPLAY),
    ...Array.from({ length: opts.extraDisplays ?? 0 }, (_, k) => node(`dx${k}`, "display", "LG 55UH5J", [2.9, 1.4, -1 + k], "wall", DISPLAY)),
    node("cam", "camera", "Logitech Brio 4K", [0, 1.1, -1.95], "wall", CAMERA),
    node("m1", "mic", "Shure MXA920", [0, 2.75, 0], "ceiling", MXA),
    ...[0, 1, 2, 3].map((k) => node(`s${k}`, "speaker", "JBL Control 24CT Micro", [-1.5 + k, 2.75, 1], "ceiling", SPEAKER)),
    node("amp", "other", "Crestron AMP-4150", [-2.8, 0.45, 1.6], "rack", AMP, "amplifier"),
    node("dsp", "processor", "Biamp TesiraFORTE AI", [-2.8, 0.45, 1.4], "rack", DSP),
    node("ctl", "processor", "Crestron CP4N", [-2.8, 0.45, 1.2], "rack", CP4N),
    node("tp", "touch", "Crestron TSW-770", [0, 0.76, 0], "table", opts.missingTouch ? null : TOUCH),
  ];
  return planCabling({ nodes, dims, tableInput: { x: 0, z: 0.3, topY: 0.75 } });
}

test("sala de reunión con puertos de ficha: video, cámara, red, parlantes y control", () => {
  const plan = meetingRoom();
  const has = (from: string, to: string, signal: string) => plan.links.some((l) => l.from === from && l.to === to && l.signal === signal);
  assert.ok(has("table", "codec", "hdmi") && has("table", "codec", "usb"));
  assert.ok(has("codec", "d1", "hdmi") && has("codec", "d2", "hdmi"));
  assert.ok(has("cam", "codec", "usb"));
  assert.ok(has("m1", "switch-new", "dante"));
  assert.equal(plan.links.filter((l) => l.from === "amp" && l.signal === "speaker").length, 4);
  // DSP y amplificador con Dante: el audio va por la red, sin cable de línea.
  assert.ok(!has("dsp", "amp", "line"));
  assert.ok(has("ctl", "d1", "rs232") && has("ctl", "d2", "rs232"));
  assert.ok(plan.findings.some((f) => f.id === "net-switch-new" && /PoE/.test(f.detail)));
  // El MXA920 transmite 9 canales y el DSP recibe 8.
  assert.ok(plan.findings.some((f) => f.id === "dante-rx"));
  assert.equal(plan.missing.length, 0);
});

test("equipo sin ficha: no se cablea con suposiciones y queda pendiente", () => {
  const plan = meetingRoom({ missingTouch: true });
  assert.equal(plan.missing.length, 1);
  assert.ok(!plan.links.some((l) => l.from === "tp" || l.to === "tp"));
  const f = plan.findings.find((x) => x.id === "missing-datasheet");
  assert.ok(f && f.productIds?.includes("p-tp"));
});

test("faltan salidas HDMI del codec: error con la solución", () => {
  assert.ok(meetingRoom({ extraDisplays: 1 }).findings.some((f) => f.id === "video-outs"));
});

test("recorrido: sube por la pared, cruza por el cielorraso y baja; desde la mesa va por el piso", () => {
  const nodes = meetingRoom().nodes;
  const tp = nodes.find((n) => n.id === "tp")!;
  const ctl = nodes.find((n) => n.id === "ctl")!;
  const route = routeCable(tp, ctl, dims);
  assert.deepEqual(route[0], [0, 0.76, 0]);
  assert.equal(route[1]![1], 0.02);
  assert.ok(route.some((p) => p[1] > 2.7));
  assert.deepEqual(route[route.length - 1], [-2.8, 0.45, 1.2]);
  assert.ok(routeLength(route) > 6);
});

test("largos: cable armado al largo estándar, rollo por metro; HDMI largo avisa", () => {
  assert.equal(cableMeters(3.2, "hdmi"), 5);
  assert.equal(cableMeters(3.2, "lan"), 5);
  assert.equal(cableMeters(8.6, "hdmi"), 15);
  const big = planCabling({
    nodes: [node("codec", "codec", "Teams Rooms PC", [-9, 0.45, 4], "rack", CODEC), node("d1", "display", "Samsung QM98C", [9, 1.6, -4.9], "wall", DISPLAY)],
    dims: { widthM: 20, depthM: 10, heightM: 3 },
  });
  assert.ok(big.findings.some((f) => f.title.startsWith("HDMI de")));
});

test("parlante de baja impedancia en un amplificador de 70 V: error", () => {
  const amp70 = io([["speaker", "out", 2]], { lineVoltage: "70v" });
  const lowz = io([["speaker", "in", 1]], { lineVoltage: "low-z" });
  const plan = planCabling({
    nodes: [node("amp", "other", "AMP 70V", [-2, 0.45, 1], "rack", amp70, "amplifier"), node("s", "speaker", "Parlante 8 ohm", [0, 2.7, 0], "ceiling", lowz)],
    dims,
  });
  assert.ok(plan.findings.some((f) => f.title.includes("70/100 V")));
});

test("inalámbrico: teclado infiNET sin gateway es error; con gateway se enlaza y se controla la capacidad", () => {
  const keypad = io([], { wireless: [{ protocol: "infinet", role: "client", capacity: null }] });
  const gateway = io([["lan", "bidir", 1]], { wireless: [{ protocol: "infinet", role: "gateway", capacity: 1 }] });
  const k1 = node("k1", "touch", "Crestron HZ-KPCN", [0, 1.2, -1.9], "wall", keypad);
  const k2 = node("k2", "touch", "Crestron HZ-KPCN", [1, 1.2, -1.9], "wall", keypad);
  const alone = planCabling({ nodes: [k1], dims });
  assert.ok(alone.findings.some((f) => f.title === "Falta gateway infiNET EX"));
  const gw = node("gw", "other", "Crestron CEN-GWEXER", [-2, 2.5, 0], "ceiling", gateway);
  const plan = planCabling({ nodes: [k1, k2, gw], dims });
  assert.equal(plan.links.filter((l) => l.signal === "wireless" && l.to === "gw").length, 2);
  assert.ok(plan.findings.some((f) => f.title === "gateway infiNET EX sin capacidad"));
  // Lo inalámbrico no suma metros de cable.
  assert.ok(!plan.totals.some((t) => t.signal === "wireless"));
});
