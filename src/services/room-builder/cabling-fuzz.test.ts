import { test } from "node:test";
import assert from "node:assert/strict";
import { planCabling, type CableNode } from "./cabling";
import { auditCabling } from "./cabling-invariants";
import { pickCables, type CableProduct } from "./cable-picks";
import { buildDiagram } from "./connection-diagram";
import { deviceClass, devicePorts } from "./device-ports";
import type { IoCapabilities, IoPort, IoProfileData, IoSignal } from "./io-profile/types";

/** Generador determinístico (misma semilla = mismas salas). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function io(ports: Array<[IoSignal, IoPort["direction"], number, Partial<IoPort>?]>, caps: Record<string, unknown> = {}): IoProfileData {
  return {
    ports: ports.map(([signal, direction, count, extra]) => ({ signal, direction, count, connector: null, channels: null, poe: null, label: signal, evidence: "x", ...extra })),
    capabilities: Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, { value: v, evidence: "x" }])) as IoCapabilities,
  };
}

type Kind = { role: string; name: string; mount: string; profile: IoProfileData; amp?: boolean };
/** Perfiles como los de las fichas de equipos típicos del catálogo. */
const LIB: Record<string, Kind[]> = {
  codec: [
    { role: "codec", name: "Crestron UC-C160-T", mount: "rack", profile: io([["hdmi", "out", 2], ["hdmi", "in", 1], ["usb-a", "bidir", 4], ["lan", "bidir", 1]]) },
    { role: "codec", name: "Codec BYOD 1 salida", mount: "rack", profile: io([["hdmi", "out", 1], ["usb-c", "bidir", 2], ["lan", "bidir", 1]]) },
  ],
  display: [
    { role: "display", name: "Hall Tech HT-HV24-HD", mount: "wall", profile: io([["hdmi", "in", 1]]) },
    { role: "display", name: "Pantalla profesional 65", mount: "wall", profile: io([["hdmi", "in", 3], ["rs232", "in", 1], ["ir", "in", 1], ["lan", "bidir", 1]]) },
  ],
  camera: [
    { role: "camera", name: "Crestron IV-CAM-I20-W", mount: "wall", profile: io([["hdmi", "out", 1], ["sdi", "out", 1], ["usb-b", "bidir", 1], ["lan", "bidir", 1, { poe: "pd" }], ["rs232", "bidir", 1]], { poeWatts: 25 }) },
    { role: "camera", name: "Cámara USB", mount: "wall", profile: io([["usb-c", "bidir", 1]]) },
    { role: "camera", name: "Cámara solo HDMI", mount: "wall", profile: io([["hdmi", "out", 1]]) },
  ],
  mic: [
    { role: "mic", name: "Micrófono de techo Dante", mount: "ceiling", profile: io([["dante", "bidir", 1, { poe: "pd" }]], { danteTx: 8, poeWatts: 12.95 }) },
    { role: "mic", name: "Micrófono de mesa analógico", mount: "table", profile: io([["mic", "out", 1]]) },
    { role: "mic", name: "Micrófono USB", mount: "table", profile: io([["usb-b", "bidir", 1]]) },
    { role: "mic", name: "Petaca inalámbrica", mount: "table", profile: io([], { wireless: [{ protocol: "rf-mic", role: "transmitter", capacity: null }] }) },
  ],
  speaker: [
    { role: "speaker", name: "Sonance VP62R", mount: "ceiling", profile: io([["speaker", "in", 1]], { lineVoltage: "low-z" }) },
    { role: "speaker", name: "Sonance VX60R", mount: "ceiling", profile: io([["speaker", "in", 1]], { lineVoltage: "both" }) },
    { role: "speaker", name: "Parlante activo", mount: "wall", profile: io([["analog-audio", "in", 1]]) },
  ],
  amp: [
    { role: "other", name: "Blaze PowerZone 504", mount: "rack", amp: true, profile: io([["speaker", "out", 4], ["analog-audio", "in", 4]], { lineVoltage: "low-z" }) },
    { role: "other", name: "Blaze PowerZone Connect 122", mount: "rack", amp: true, profile: io([["speaker", "out", 2], ["analog-audio", "in", 4], ["lan", "bidir", 1]], { lineVoltage: "both" }) },
    { role: "other", name: "Amplificador 70V 8 canales", mount: "rack", amp: true, profile: io([["speaker", "out", 8], ["analog-audio", "in", 8], ["dante", "bidir", 1]], { lineVoltage: "70v", danteRx: 8 }) },
  ],
  dsp: [{ role: "processor", name: "DSP de sala Dante", mount: "rack", profile: io([["mic", "in", 4], ["analog-audio", "out", 4], ["usb-b", "bidir", 1], ["dante", "bidir", 1]], { danteRx: 16, danteTx: 16 }) }],
  control: [{ role: "processor", name: "Crestron CP4N", mount: "rack", profile: io([["rs232", "bidir", 3], ["ir", "out", 8], ["lan", "bidir", 1]]) }],
  touch: [
    { role: "touch", name: "Crestron TSW-770", mount: "table", profile: io([["lan", "bidir", 1, { poe: "pd" }]], { poeWatts: 6.5 }) },
    { role: "touch", name: "Crestron HZ-KPCN", mount: "wall", profile: io([], { wireless: [{ protocol: "infinet", role: "client", capacity: null }] }) },
  ],
  switch: [
    { role: "other", name: "Switch PoE 8 puertos", mount: "rack", profile: io([["lan", "bidir", 8, { poe: "pse" }]], { poeBudgetWatts: 60 }) },
    { role: "other", name: "Switch 16 puertos sin PoE", mount: "rack", profile: io([["lan", "bidir", 16]]) },
  ],
  gateway: [{ role: "other", name: "Crestron CEN-GWEXER", mount: "ceiling", profile: io([["lan", "bidir", 1]], { wireless: [{ protocol: "infinet", role: "gateway", capacity: 3 }] }) }],
  receiver: [{ role: "other", name: "Receptor de micrófonos", mount: "rack", profile: io([["analog-audio", "out", 2], ["lan", "bidir", 1]], { wireless: [{ protocol: "rf-mic", role: "receiver", capacity: 2 }] }) }],
  streamer: [{ role: "other", name: "Streamer de audio", mount: "rack", profile: io([["analog-audio", "out", 2], ["lan", "bidir", 1]]) }],
};

function room(seed: number) {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const W = 3 + r() * 17;
  const D = 3 + r() * 12;
  const H = 2.4 + r() * 1.6;
  const pos = (mount: string): [number, number, number] => {
    const x = (r() - 0.5) * (W - 0.4);
    const z = (r() - 0.5) * (D - 0.4);
    if (mount === "ceiling") return [x, H - 0.05, z];
    if (mount === "wall") return [x, 1 + r(), -D / 2 + 0.05];
    if (mount === "table") return [x * 0.4, 0.76, z * 0.4];
    return [-W / 2 + 0.3, 0.45 + r() * 1.2, -D / 2 + 0.3];
  };
  const nodes: CableNode[] = [];
  let id = 0;
  const add = (group: string, count: number) => {
    const k = pick(LIB[group]!);
    for (let i = 0; i < count; i++) {
      const spec = k.amp ? { kind: "amplifier" as const, channels: null, wattsPerChannel: null, minOhms: null, nominalOhms: null, highImpedance: false, streaming: false, networked: false, source: "auto" as const } : null;
      const label = `${k.name} #${++id}`;
      nodes.push({ id: `n${id}`, label, cls: deviceClass({ role: k.role, slotKey: group, name: k.name, spec }), ports: r() < 0.06 ? null : devicePorts(k.profile), pos: Object.fromEntries(["x", "y", "z"].map((a, j) => [a, pos(k.mount)[j]])) as { x: number; y: number; z: number }, mount: k.mount, productId: `p-${group}` });
    }
  };
  const maybe = (p: number, group: string, max: number) => {
    if (r() < p) add(group, 1 + Math.floor(r() * max));
  };
  maybe(0.6, "codec", 1);
  maybe(0.8, "display", 4);
  maybe(0.5, "camera", 2);
  maybe(0.6, "mic", 6);
  maybe(0.8, "speaker", 16);
  maybe(0.6, "amp", 3);
  maybe(0.3, "dsp", 1);
  maybe(0.5, "control", 1);
  maybe(0.6, "touch", 4);
  maybe(0.5, "switch", 1);
  maybe(0.3, "gateway", 1);
  maybe(0.3, "receiver", 1);
  maybe(0.3, "streamer", 1);
  const plan = planCabling({
    nodes,
    dims: { widthM: W, depthM: D, heightM: H },
    tableInput: r() < 0.5 ? { x: 0, z: 0, topY: 0.75 } : null,
    central: r() < 0.25 ? { label: "Rack central", exit: { x: -W / 2 + 0.2, z: -D / 2 + 0.2 } } : null,
  });
  return { plan, dims: { widthM: W, depthM: D, heightM: H } };
}

const ROOMS = 2000;

test(`${ROOMS} salas al azar: el cableado nunca rompe una regla de integrador`, () => {
  const failures: string[] = [];
  let links = 0;
  for (let seed = 1; seed <= ROOMS; seed++) {
    const { plan, dims } = room(seed);
    links += plan.links.length;
    for (const v of auditCabling(plan, dims)) failures.push(`sala ${seed}: [${v.rule}] ${v.detail}`);
  }
  const byRule = new Map<string, number>();
  for (const f of failures) {
    const rule = f.match(/\[(.+?)\]/)?.[1] ?? "?";
    byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
  }
  assert.equal(failures.length, 0, `${failures.length} violaciones en ${ROOMS} salas (${links} cables): ${JSON.stringify([...byRule])}\n${failures.slice(0, 25).join("\n")}`);
});

test(`${ROOMS} salas al azar: el diagrama dibuja cada conexión y los cables del catálogo cubren los metros`, () => {
  const catalog: CableProduct[] = [
    { id: "h2", name: "HDMI 2m", brand: "X", signal: "hdmi", kind: "patch", lengthM: 2, extended: false, priceUsd: 8 },
    { id: "h5", name: "HDMI 5m", brand: "X", signal: "hdmi", kind: "patch", lengthM: 5, extended: false, priceUsd: 12 },
    { id: "h10", name: "HDMI 10m", brand: "X", signal: "hdmi", kind: "patch", lengthM: 10, extended: false, priceUsd: 25 },
    { id: "h30o", name: "HDMI óptico 30m", brand: "X", signal: "hdmi", kind: "patch", lengthM: 30, extended: true, priceUsd: 120 },
    { id: "u5", name: "USB 5m", brand: "X", signal: "usb", kind: "patch", lengthM: 5, extended: false, priceUsd: 10 },
    { id: "u15", name: "USB activo 15m", brand: "X", signal: "usb", kind: "patch", lengthM: 15, extended: true, priceUsd: 40 },
    { id: "cat6", name: "Cat6 305m", brand: "X", signal: "utp", kind: "bulk", lengthM: 305, extended: false, priceUsd: 150 },
    { id: "spk", name: "Cable parlante por metro", brand: "X", signal: "speaker", kind: "bulk", lengthM: 1, extended: false, priceUsd: 1 },
  ];
  const problems: string[] = [];
  for (let seed = 1; seed <= ROOMS; seed++) {
    const { plan } = room(seed);
    const d = buildDiagram(plan);
    const drawn = new Set(d.wires.map((w) => w.id));
    for (const l of plan.links) if (!drawn.has(l.id)) problems.push(`sala ${seed}: diagrama sin ${l.id}`);
    for (const w of d.wires) if (w.points.length < 2 || w.points.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) problems.push(`sala ${seed}: cable mal dibujado ${w.id}`);
    const picks = pickCables(plan, catalog);
    for (const signal of ["lan", "dante", "hdbaset", "speaker"] as const) {
      const need = plan.links.filter((l) => l.signal === signal).reduce((s, l) => s + l.cableM, 0);
      if (!need) continue;
      const group = signal === "speaker" ? "speaker" : "utp";
      const bought = picks.lines.filter((l) => l.product.signal === group).reduce((s, l) => s + l.quantity * (l.product.lengthM ?? 1), 0);
      const totalNeed = plan.links.filter((l) => (group === "utp" ? ["lan", "dante", "hdbaset"].includes(l.signal) : l.signal === "speaker")).reduce((s, l) => s + l.cableM, 0);
      if (bought + 1e-6 < totalNeed) problems.push(`sala ${seed}: ${group} comprado ${bought} m < ${totalNeed} m`);
    }
    for (const l of plan.links.filter((x) => x.signal === "hdmi" || x.signal === "usb")) {
      const covered = picks.lines.some((p) => p.product.signal === l.signal) || picks.missing.some((m) => m.signal === l.signal);
      if (!covered) problems.push(`sala ${seed}: ${l.signal} sin cable ni faltante`);
    }
  }
  assert.equal(problems.length, 0, problems.slice(0, 20).join("\n"));
});
