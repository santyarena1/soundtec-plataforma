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
    node("codec", "codec", "Crestron UC-C160-T", [-2.8, 0.45, 1.8], "rack", CODEC),
    node("d1", "display", "Pantalla 65 pulgadas", [-0.9, 1.4, -1.95], "wall", DISPLAY),
    node("d2", "display", "Pantalla 65 pulgadas", [0.9, 1.4, -1.95], "wall", DISPLAY),
    ...Array.from({ length: opts.extraDisplays ?? 0 }, (_, k) => node(`dx${k}`, "display", "Pantalla 55 pulgadas", [2.9, 1.4, -1 + k], "wall", DISPLAY)),
    node("cam", "camera", "Crestron IV-CAM-I20-W", [0, 1.1, -1.95], "wall", CAMERA),
    node("m1", "mic", "Micrófono de techo Dante", [0, 2.75, 0], "ceiling", MXA),
    ...[0, 1, 2, 3].map((k) => node(`s${k}`, "speaker", "Sonance VP62R", [-1.5 + k, 2.75, 1], "ceiling", SPEAKER)),
    node("amp", "other", "Blaze PowerZone Connect 504", [-2.8, 0.45, 1.6], "rack", AMP, "amplifier"),
    node("dsp", "processor", "DSP de sala Dante", [-2.8, 0.45, 1.4], "rack", DSP),
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
  // El micrófono transmite 9 canales Dante y el DSP recibe 8.
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
  // Fórmula única (cable-length.ts): armado = recorrido + 0,6 m por punta → largo comercial (8,6 + 1,2 = 9,8 → 10 m).
  assert.equal(cableMeters(8.6, "hdmi"), 10);
  assert.equal(cableMeters(9, "hdmi"), 15);
  const big = planCabling({
    nodes: [node("codec", "codec", "Crestron UC-C160-T", [-9, 0.45, 4], "rack", CODEC), node("d1", "display", "Pantalla 98 pulgadas", [9, 1.6, -4.9], "wall", DISPLAY)],
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
  const f = plan.findings.find((x) => x.title === "Parlante y amplificador incompatibles");
  assert.ok(f, "error de compatibilidad");
  assert.equal(f!.fix?.generic, "amp-4ch", "propone un amplificador de baja impedancia");
});

test("amplificador de doble modo: los parlantes de baja impedancia van en modo baja impedancia, 2 por canal", () => {
  const ampBoth = io([["speaker", "out", 2]], { lineVoltage: "both" });
  const lowz = io([["speaker", "in", 1]], { lineVoltage: "low-z" });
  const plan = planCabling({
    nodes: [node("amp", "other", "AMP", [-2, 0.45, 1], "rack", ampBoth, "amplifier"), ...[0, 1, 2, 3, 4].map((i) => node(`s${i}`, "speaker", `Parlante ${i}`, [i, 2.7, 0], "ceiling", lowz))],
    dims,
  });
  assert.equal(plan.links.filter((l) => l.signal === "speaker").length, 4, "2 canales × 2 parlantes");
  assert.ok(!plan.findings.some((x) => x.title === "Parlante y amplificador incompatibles"));
  const short = plan.findings.find((x) => x.id === "amp-load");
  assert.ok(short && short.fix?.generic === "amp-4ch", "el quinto parlante pide otro amplificador");
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

/** Sala de amplificación: un amplificador y n parlantes pasivos en el techo. */
function ampRoom(amp: IoProfileData, speakers: IoProfileData[], audio?: { category?: string; tapW?: number }) {
  return planCabling({
    nodes: [node("amp", "other", "AMP prueba", [-2, 0.45, 1], "rack", amp, "amplifier"), ...speakers.map((s, i) => node(`s${i}`, "speaker", `Parlante ${i + 1}`, [-2 + (i % 5), 2.7, -1 + Math.floor(i / 5) * 0.5], "ceiling", s))],
    dims,
    audio,
  });
}

test("4 parlantes de 4 Ω en un amplificador de 2 canales que banca 4 Ω: uno por canal y avisa los que no entran", () => {
  const amp = io([["speaker", "out", 2]], { lineVoltage: "low-z", ampWattsPerChannel: { "8Ω": 100, "4Ω": 150 }, minLoadOhms: 4 });
  const spk4 = io([["speaker", "in", 1]], { lineVoltage: "low-z", impedanceOhms: 4 });
  const plan = ampRoom(amp, [spk4, spk4, spk4, spk4]);
  assert.equal(plan.links.filter((l) => l.signal === "speaker").length, 2, "nunca 2 Ω por canal");
  assert.ok(plan.amplification!.every((c) => c.loadOhms === 4 && c.minLoadOhms === 4));
  const f = plan.findings.find((x) => x.id === "amp-load");
  assert.ok(f && f.level === "error" && /4 Ω/.test(f.detail), "avisa que faltan canales");
  // Con un amplificador estable a 2 Ω entran los cuatro, de a dos por canal.
  const amp2 = io([["speaker", "out", 2]], { lineVoltage: "low-z", ampWattsPerChannel: { "4Ω": 150, "2Ω": 250 }, minLoadOhms: 2 });
  const ok = ampRoom(amp2, [spk4, spk4, spk4, spk4]);
  assert.equal(ok.links.filter((l) => l.signal === "speaker").length, 4);
  assert.deepEqual(ok.amplification!.map((c) => c.loadOhms), [2, 2]);
  assert.ok(!ok.findings.some((x) => x.id === "amp-load"));
});

test("parlantes de 16 Ω: entran 4 por canal en un amplificador de 4 Ω", () => {
  const amp = io([["speaker", "out", 1]], { lineVoltage: "low-z", minLoadOhms: 4 });
  const spk16 = io([["speaker", "in", 1]], { lineVoltage: "low-z", impedanceOhms: 16 });
  const plan = ampRoom(amp, Array.from({ length: 5 }, () => spk16));
  assert.equal(plan.links.filter((l) => l.signal === "speaker").length, 4);
  assert.equal(plan.amplification![0]!.loadOhms, 4);
  assert.ok(plan.findings.some((x) => x.id === "amp-load"));
});

test("20 parlantes de 70 V a 7,5 W en un canal de 60 W: no pasa del 80 % y avisa; con más canales parte la línea", () => {
  const spk = io([["speaker", "in", 1]], { lineVoltage: "70v", transformerTaps: { "70V": [15, 7.5, 3.75] } });
  const one = io([["speaker", "out", 1]], { lineVoltage: "70v", ampWattsPerChannel: { "70V": 60 } });
  const plan = ampRoom(one, Array.from({ length: 20 }, () => spk), { tapW: 7.5 });
  const ch = plan.amplification![0]!;
  assert.equal(ch.speakerIds.length, 6, "6 × 7,5 W = 45 W ≤ 48 W (80 % de 60 W)");
  assert.equal(ch.tapW, 45);
  assert.equal(ch.capacityW, 60);
  const f = plan.findings.find((x) => x.id === "amp-line-power");
  assert.ok(f && f.level === "error" && /14 parlante/.test(f.detail));
  assert.ok(!plan.findings.some((x) => x.id === "amp-taps-default"), "el tap lo fijó el usuario");
  const four = ampRoom(io([["speaker", "out", 4]], { lineVoltage: "70v", ampWattsPerChannel: { "70V": 120 } }), Array.from({ length: 20 }, () => spk), { tapW: 7.5 });
  assert.ok(four.amplification!.every((c) => c.tapW <= 96));
  assert.equal(four.links.filter((l) => l.signal === "speaker").length, 20);
  assert.ok(four.links.filter((l) => l.signal === "speaker").every((l) => /tap 7,5 W/.test(l.note ?? "")));
});

test("tap por defecto según el tipo de sala, marcado como estimado", () => {
  const spk = io([["speaker", "in", 1]], { lineVoltage: "70v", transformerTaps: { "70V": [30, 15, 7.5, 3.75] } });
  const amp = io([["speaker", "out", 1]], { lineVoltage: "70v", ampWattsPerChannel: { "70V": 250 } });
  const lobby = ampRoom(amp, [spk, spk], { category: "lobby" });
  assert.deepEqual(lobby.amplification![0]!.taps, [7.5, 7.5]);
  const event = ampRoom(amp, [spk, spk], { category: "event" });
  assert.deepEqual(event.amplification![0]!.taps, [15, 15]);
  const office = ampRoom(amp, [spk, spk], { category: "office" });
  assert.deepEqual(office.amplification![0]!.taps, [7.5, 7.5], "5 W no está: el menor tap que alcanza");
  const f = lobby.findings.find((x) => x.id === "amp-taps-default");
  assert.ok(f && /dato estimado: tap de Parlante 1: 7,5 W en 70V/.test(f.detail));
});

test("línea de 70 V que la ficha da solo puenteada: ocupa un par de canales", () => {
  const amp = io([["speaker", "out", 2]], { lineVoltage: "both", ampWattsPerChannel: { "8Ω": 100, "4Ω": 150 }, ampBridgedWatts: { "70V": 250 }, minLoadOhms: 4 });
  const line = io([["speaker", "in", 1]], { lineVoltage: "70v", transformerTaps: { "70V": [15, 7.5] } });
  const lowz = io([["speaker", "in", 1]], { lineVoltage: "low-z", impedanceOhms: 8 });
  const plan = ampRoom(amp, [line, line, lowz], { tapW: 15 });
  const ch = plan.amplification!.find((c) => c.mode === "high")!;
  assert.equal(ch.partner, 2);
  assert.equal(ch.capacityW, 250);
  assert.ok(plan.links.some((l) => l.fromPort === "Canal 1 (puenteado 1+2)"));
  // El de baja impedancia no puede ir en la misma salida ni en el canal tomado por el puente.
  assert.ok(!plan.links.some((l) => l.to === "s2"));
  assert.ok(plan.findings.some((x) => x.id === "amp-load"));
});

test("no se mezclan baja impedancia y 70 V en una misma salida", () => {
  const amp = io([["speaker", "out", 2]], { lineVoltage: "both", ampWattsPerChannel: { "8Ω": 100, "4Ω": 150, "70V": 100 }, minLoadOhms: 4 });
  const line = io([["speaker", "in", 1]], { lineVoltage: "70v", transformerTaps: { "70V": [7.5] } });
  const lowz = io([["speaker", "in", 1]], { lineVoltage: "low-z", impedanceOhms: 8 });
  const plan = ampRoom(amp, [line, lowz, line, lowz]);
  assert.deepEqual(plan.amplification!.map((c) => c.mode).sort(), ["high", "low"]);
  for (const c of plan.amplification!) assert.equal(c.speakerIds.length, 2);
});

test("calibre por pérdida: 4 Ω a 15 m sube a 2,5 mm²; 70 V liviano admite cable fino", async () => {
  const { speakerGauge } = await import("./amp-load");
  assert.equal(speakerGauge(15, { mode: "low", ohms: 4 }).mm2, 2.5);
  assert.match(speakerGauge(15, { mode: "low", ohms: 4 }).label, /2×2,5 mm² \(14 AWG\)/);
  assert.equal(speakerGauge(10, { mode: "low", ohms: 8 }).mm2, 1.5);
  assert.equal(speakerGauge(40, { mode: "low", ohms: 4 }).mm2, 6);
  assert.equal(speakerGauge(80, { mode: "low", ohms: 4 }).enough, false, "ni 6 mm² alcanza: avisa");
  // 70 V, 45 W de línea: Z = 4900/45 ≈ 109 Ω → a 30 m alcanza 0,75 mm².
  assert.equal(speakerGauge(30, { mode: "high", volts: "70V", watts: 45 }).mm2, 0.75);
  assert.equal(speakerGauge(60, { mode: "high", volts: "70V", watts: 240 }).mm2, 2.5);
});

test("dato faltante: se sigue con un valor típico y queda el aviso de dato estimado", () => {
  const amp = io([["speaker", "out", 2]], { lineVoltage: "low-z" });
  const spk = io([["speaker", "in", 1]], { lineVoltage: "low-z" });
  const plan = ampRoom(amp, [spk, spk, spk, spk]);
  assert.equal(plan.links.filter((l) => l.signal === "speaker").length, 4, "8 Ω típico en 4 Ω típico: 2 por canal");
  const f = plan.findings.find((x) => x.id === "amp-estimated");
  assert.equal(f?.level, "warn");
  assert.match(f!.detail, /dato estimado: carga mínima de AMP prueba: 4 Ω típico/);
  assert.match(f!.detail, /dato estimado: impedancia de Parlante 1: 8 Ω típico/);
  // 70 V sin potencia de línea ni taps: no se limita en silencio.
  const amp70 = io([["speaker", "out", 1]], { lineVoltage: "70v" });
  const s70 = io([["speaker", "in", 1]], { lineVoltage: "70v" });
  const e = ampRoom(amp70, [s70, s70]).findings.find((x) => x.id === "amp-estimated")!;
  assert.match(e.detail, /potencia en 70V de AMP prueba: la ficha no la declara/);
  assert.match(e.detail, /taps de Parlante 1 en 70V/);
});

test("perfil de la ficha: los datos eléctricos llegan al motor", () => {
  const p = devicePorts(io([["speaker", "out", 4]], { ampWattsPerChannel: { "8Ω": 150, "4Ω": 300, "70V": 250 }, minLoadOhms: 2, impedanceOhms: 0 }))!;
  assert.deepEqual(p.ampWattsPerChannel, { "8Ω": 150, "4Ω": 300, "70V": 250 });
  assert.equal(p.minLoadOhms, 2);
  assert.equal(p.impedanceOhms, null, "un 0 no vale como dato");
});

test("canales que pide un ambiente al rack central, por carga real", async () => {
  const { channelsForSpeakers } = await import("./amp-load");
  const ports = (c: Record<string, unknown>) => devicePorts(io([["speaker", "in", 1]], c));
  const amp4 = devicePorts(io([["speaker", "out", 8]], { lineVoltage: "both", minLoadOhms: 4, ampWattsPerChannel: { "70V": 60 } }));
  assert.equal(channelsForSpeakers([{ ports: ports({ lineVoltage: "low-z", impedanceOhms: 8 }), quantity: 6 }], amp4), 3);
  assert.equal(channelsForSpeakers([{ ports: ports({ lineVoltage: "low-z", impedanceOhms: 4 }), quantity: 4 }], amp4), 4);
  assert.equal(channelsForSpeakers([{ ports: ports({ lineVoltage: "70v", transformerTaps: { "70V": [7.5] } }), quantity: 20 }], amp4, { tapW: 7.5 }), 4, "150 W / 48 W útiles");
  const bridged = devicePorts(io([["speaker", "out", 4]], { lineVoltage: "both", ampBridgedWatts: { "70V": 250 } }));
  assert.equal(channelsForSpeakers([{ ports: ports({ lineVoltage: "70v", transformerTaps: { "70V": [7.5] } }), quantity: 4 }], bridged, { tapW: 7.5 }), 2, "una línea puenteada ocupa dos canales");
});
