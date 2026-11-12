import { test } from "node:test";
import assert from "node:assert/strict";
import { audioFits, audioKindOf } from "./audio-level";
import { planCabling, type CableNode } from "./cabling";
import { deviceClass, devicePorts } from "./device-ports";
import { validateExtraction } from "./io-profile/extract";
import { lengthCited, type IoCapabilities, type IoPort, type IoProfileData, type IoSignal } from "./io-profile/types";
import { linkVideoClass, reachFor, videoClassOf } from "./signal-reach";
import { expandIoPorts, portsMismatch } from "./wiring/ports";
import { validateWires, wireRunM } from "./wiring/validate";
import type { Wire, WirePort } from "./wiring/types";

const dims = { widthM: 8, depthM: 6, heightM: 2.8 };

function io(ports: Array<[IoSignal, IoPort["direction"], number, Partial<IoPort>?]>, caps: Record<string, unknown> = {}): IoProfileData {
  return {
    ports: ports.map(([signal, direction, count, extra]) => ({ signal, direction, count, connector: null, channels: null, poe: null, label: `${signal} ${direction}`, evidence: "cita", ...extra })),
    capabilities: Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, { value: v, evidence: "cita" }])) as IoCapabilities,
  };
}

function node(id: string, role: string, name: string, pos: [number, number, number], mount: string, profile: IoProfileData, kind?: "amplifier" | "streamer"): CableNode {
  const spec = kind ? { kind, channels: null, wattsPerChannel: null, minOhms: null, nominalOhms: null, highImpedance: false, streaming: false, networked: false, source: "auto" as const } : null;
  return { id, label: name, cls: deviceClass({ role, slotKey: role, name, spec }), ports: devicePorts(profile), pos: { x: pos[0], y: pos[1], z: pos[2] }, mount, productId: `p-${id}` };
}

/* ───────── Alcance por señal ───────── */

test("alcance HDMI según la resolución: 4K60 5 m (aviso desde 4), 8K 3 m, 1080p 15 m; sin dato se toma 4K60", () => {
  assert.equal(videoClassOf("4K60 4:4:4"), "4k60");
  assert.equal(videoClassOf("8K60 / 48 Gbps"), "8k");
  assert.equal(videoClassOf("1080p @ 60Hz and 4K UHD @ 30Hz"), "4k30");
  assert.equal(videoClassOf("1920x1200 (WUXGA)"), "1080p");
  const k4 = reachFor("hdmi", { maxVideo: "4K60" }, { maxVideo: "4K UHD (3840x2160)" })!;
  assert.deepEqual([k4.maxM, k4.warnFromM, k4.hard], [5, 4, false]);
  assert.equal(reachFor("hdmi", { maxVideo: "8K" }, { maxVideo: "8K60" })!.maxM, 3);
  // Manda la punta más baja: una pantalla 1080p no recibe 4K.
  assert.equal(reachFor("hdmi", { maxVideo: "4K60" }, { maxVideo: "1080p" })!.maxM, 15);
  assert.deepEqual(linkVideoClass({}, {}), { cls: "4k60", assumed: true });
});

test("alcance USB 2.0 5 m / 3.x 3 m; HDBaseT 4K 70 m, 100 m en 1080p o si la ficha lo declara; UTP 100 m", () => {
  assert.equal(reachFor("usb-a", { usbVersion: "USB 3.0" }, { usbVersion: "USB 3.2 Gen 1" })!.maxM, 3);
  assert.equal(reachFor("usb-b", { usbVersion: "USB 3.0" }, { usbVersion: "USB 2.0" })!.maxM, 5);
  assert.equal(reachFor("usb", {}, {})!.maxM, 5);
  assert.equal(reachFor("hdbaset", { maxVideo: "4K60" }, {})!.maxM, 70);
  assert.equal(reachFor("hdbaset", { maxVideo: "1080p" }, {})!.maxM, 100);
  assert.equal(reachFor("hdbaset", { maxVideo: "4K60", portText: "HDBaseT 3.0 up to 100 m on Cat6A" }, {})!.maxM, 100);
  assert.equal(reachFor("hdbaset", { portMaxM: 40 }, {})!.maxM, 40);
  const utp = reachFor("dante")!;
  assert.deepEqual([utp.maxM, utp.hard], [100, true]);
});

const CODEC_4K = io([["hdmi", "out", 1], ["usb-a", "bidir", 2], ["lan", "bidir", 1]], { maxVideo: "4K60" });
const DISPLAY_4K = io([["hdmi", "in", 2]], { maxVideo: "4K60 HDR" });

test("HDMI 4K60 de 6 m: aviso con la alternativa (AOC o HDBaseT) y el producto del catálogo", () => {
  // Dos equipos de pared a 2 m: sube, cruza y baja ≈ 4,7 m + reservas ≈ 6 m → cable de 7,5 m.
  const plan = planCabling({
    nodes: [node("codec", "codec", "PC de sala", [0, 1.4, 2.9], "wall", CODEC_4K), node("tv", "display", "Pantalla 75", [2, 1.4, 2.9], "wall", DISPLAY_4K)],
    dims,
    remedies: { hdmiAoc: { name: "Cable HDMI óptico 10 m", lengthM: 10 } },
  });
  const link = plan.links.find((l) => l.signal === "hdmi")!;
  assert.equal(link.cableM, 7.5);
  const f = plan.findings.find((x) => x.id === `len-${link.id}`)!;
  assert.equal(f.level, "warn");
  assert.match(f.detail, /4K60/);
  assert.match(f.detail, /AOC/);
  assert.match(f.detail, /Cable HDMI óptico 10 m/);
  assert.ok(link.note, "el cable lleva la nota para que la cotización elija un óptico/activo");
  // La misma distancia en 1080p entra en un HDMI pasivo.
  const fhd = planCabling({ nodes: [node("codec", "codec", "PC de sala", [0, 1.4, 2.9], "wall", io([["hdmi", "out", 1]], { maxVideo: "1080p" })), node("tv", "display", "Pantalla 75", [2, 1.4, 2.9], "wall", io([["hdmi", "in", 1]], { maxVideo: "1920x1080" }))], dims });
  assert.ok(!fhd.findings.some((x) => x.id.startsWith("len-")));
});

/* ───────── Salidas HDBaseT ───────── */

const MATRIX = io([["hdmi", "in", 4], ["hdmi", "out", 1], ["hdbaset", "out", 2], ["lan", "bidir", 1]], { maxVideo: "4K60" });

test("matriz con 1 salida HDMI y 2 HDBaseT para 3 pantallas: UTP hasta un receptor junto a cada pantalla y HDMI corto", () => {
  const nodes = [
    node("mx", "processor", "Matriz 4x3 HDBaseT", [3.5, 0.45, -2.5], "rack", MATRIX),
    node("d1", "display", "Pantalla 1", [3.5, 1.4, -2.9], "wall", DISPLAY_4K),
    node("d2", "display", "Pantalla 2", [-3.5, 1.4, 0], "wall", DISPLAY_4K),
    node("d3", "display", "Pantalla 3", [0, 1.4, 2.9], "wall", DISPLAY_4K),
  ];
  nodes[0]!.cls = "video-switch";
  const plan = planCabling({ nodes, dims, remedies: { hdbasetRx: { name: "Crestron HD-RX-4K-210-C-E" } } });
  const fromMx = plan.links.filter((l) => l.from === "mx");
  assert.equal(fromMx.filter((l) => l.signal === "hdmi").length, 1, "una sola salida HDMI, a la pantalla más cercana");
  assert.equal(fromMx.find((l) => l.signal === "hdmi")!.to, "d1");
  const utp = fromMx.filter((l) => l.signal === "hdbaset");
  assert.equal(utp.length, 2);
  for (const l of utp) {
    const rx = plan.nodes.find((n) => n.id === l.to)!;
    assert.ok(rx.virtual && /Receptor HDBaseT/.test(rx.label) && /HD-RX/.test(rx.label));
    const short = plan.links.find((x) => x.from === rx.id && x.signal === "hdmi")!;
    assert.ok(["d2", "d3"].includes(short.to));
    assert.ok(short.cableM <= 2, `HDMI corto desde el receptor (${short.cableM} m)`);
  }
  assert.ok(!plan.findings.some((f) => /Faltan puertos HDMI/.test(f.title)));
  const missingRx = plan.findings.filter((f) => f.fix?.generic === "hdbaset-rx");
  assert.equal(missingRx.length, 2);
  assert.ok(missingRx.every((f) => f.fix!.near && /HD-RX/.test(f.detail)));
});

test("receptor HDBaseT real en la sala: se usa ese (no se pide otro) y una pantalla con entrada HDBaseT va directo", () => {
  const RX = io([["hdbaset", "in", 1], ["hdmi", "out", 1]]);
  const nodes = [
    node("mx", "processor", "Matriz", [3.5, 0.45, -2.5], "rack", io([["hdmi", "in", 2], ["hdbaset", "out", 2]])),
    node("rx", "other", "Receptor HDBaseT", [-3.5, 1.0, 0], "wall", RX),
    node("d2", "display", "Pantalla 2", [-3.5, 1.4, 0], "wall", DISPLAY_4K),
    node("pj", "display", "Proyector", [0, 2.6, 0], "ceiling", io([["hdmi", "in", 1], ["hdbaset", "in", 1]])),
  ];
  nodes[0]!.cls = "video-switch";
  const plan = planCabling({ nodes, dims });
  assert.ok(plan.links.some((l) => l.from === "mx" && l.to === "rx" && l.signal === "hdbaset"));
  assert.ok(plan.links.some((l) => l.from === "rx" && l.to === "d2" && l.signal === "hdmi"));
  assert.ok(plan.links.some((l) => l.from === "mx" && l.to === "pj" && l.signal === "hdbaset"));
  assert.ok(!plan.findings.some((f) => f.fix?.generic === "hdbaset-rx"));
});

/* ───────── Audio: nivel y formato ───────── */

test("nivel y formato de audio: mic → mic o mic/línea; línea → línea o mic/línea; óptico solo con óptico", () => {
  const mic = audioKindOf({ signal: "mic", direction: "out", label: "XLR out" })!;
  const lineIn = audioKindOf({ signal: "analog-audio", direction: "in", label: "LINE IN 1-4" })!;
  const micLine = audioKindOf({ signal: "mic", direction: "in", label: "Mic/Line IN 1-8" })!;
  const optical = audioKindOf({ signal: "digital-audio", direction: "out", label: "Optical OUT", connector: "TOSLINK" })!;
  const coax = audioKindOf({ signal: "digital-audio", direction: "in", label: "Coaxial IN", connector: "RCA" })!;
  assert.deepEqual([mic, lineIn, micLine, optical, coax], ["mic", "line", "mic-line", "optical", "coaxial"]);
  assert.ok(!audioFits("mic", "line") && audioFits("mic", "mic-line") && audioFits("line", "mic-line"));
  assert.ok(!audioFits("line", "mic") && !audioFits("optical", "line") && !audioFits("optical", "coaxial") && audioFits("optical", "optical"));
});

const STREAMER_OPTICAL = io([["digital-audio", "out", 1, { label: "Optical OUT", connector: "TOSLINK" }], ["lan", "bidir", 1]]);
const AMP_ANALOG = io([["analog-audio", "in", 2, { label: "LINE IN 1-2" }], ["speaker", "out", 2]], { lineVoltage: "low-z" });
const SPEAKER = io([["speaker", "in", 1]], { lineVoltage: "low-z", impedanceOhms: 8 });

test("streamer solo óptico → amplificador analógico: no se conecta directo, pide un DAC; con DAC en la sala va por él", () => {
  const base = [
    node("st", "processor", "Streamer óptico", [3.5, 0.45, -2.5], "rack", STREAMER_OPTICAL, "streamer"),
    node("amp", "processor", "Amplificador 2 canales", [3.5, 0.45, -2.3], "rack", AMP_ANALOG, "amplifier"),
    node("s1", "speaker", "Parlante techo", [0, 2.75, 0], "ceiling", SPEAKER),
  ];
  const plan = planCabling({ nodes: base, dims, networkOptional: true });
  assert.ok(!plan.links.some((l) => l.from === "st" && l.to === "amp"), "óptico no entra en una entrada analógica");
  const f = plan.findings.find((x) => x.fix?.generic === "audio-dac")!;
  assert.ok(f && f.level === "error" && /DAC/.test(f.detail));
  const DAC = io([["digital-audio", "in", 1, { label: "Optical IN", connector: "TOSLINK" }], ["analog-audio", "out", 2, { label: "LINE OUT" }]]);
  const withDac = planCabling({ nodes: [...base, node("dac", "other", "Conversor DAC", [3.5, 0.45, -2.1], "rack", DAC)], dims, networkOptional: true });
  assert.ok(withDac.links.some((l) => l.from === "st" && l.to === "dac" && l.signal === "digital"));
  assert.ok(withDac.links.some((l) => l.from === "dac" && l.to === "amp" && l.signal === "line"));
  assert.ok(!withDac.findings.some((x) => x.fix?.generic === "audio-dac"));
});

test("micrófono (nivel mic) a un equipo con entradas solo de línea: rechazado con la solución; con entrada mic/línea, conecta", () => {
  const MIC = io([["mic", "out", 1, { label: "XLR OUT", connector: "XLR" }]]);
  const lineOnly = io([["analog-audio", "in", 4, { label: "LINE IN 1-4" }], ["analog-audio", "out", 4], ["lan", "bidir", 1]]);
  const nodes = (dsp: IoProfileData) => [node("m1", "mic", "Micrófono de mesa", [0, 0.76, 0], "table", MIC), node("dsp", "processor", "DSP Tesira", [3.5, 0.45, -2.5], "rack", dsp)];
  const bad = planCabling({ nodes: nodes(lineOnly), dims });
  assert.ok(!bad.links.some((l) => l.from === "m1"));
  const f = bad.findings.find((x) => x.id === "mic-m1")!;
  assert.match(f.detail, /nivel mic/);
  const ok = planCabling({ nodes: nodes(io([["mic", "in", 4, { label: "MIC/LINE IN 1-4" }], ["analog-audio", "out", 4]])), dims });
  assert.ok(ok.links.some((l) => l.from === "m1" && l.to === "dsp" && l.signal === "line"));
});

test("plano técnico: micrófono a entrada de línea y óptico a analógico son error; mic a mic/línea no", () => {
  const p = (signal: IoSignal, direction: WirePort["direction"], label: string, connector: string | null = null): WirePort => ({ id: `${direction}:${signal}:1`, signal, direction, label, connector, source: "datasheet" });
  assert.match(portsMismatch(p("mic", "out", "MIC OUT"), p("analog-audio", "in", "LINE IN"))!, /nivel mic/);
  assert.match(portsMismatch(p("digital-audio", "out", "Optical OUT", "TOSLINK"), p("analog-audio", "in", "LINE IN"))!, /DAC/);
  assert.equal(portsMismatch(p("mic", "out", "MIC OUT"), p("mic", "in", "Mic/Line IN")), null);
});

/* ───────── Enlace UTP propietario ───────── */

const ULTRA_S = io([["hdmi", "in", 2], ["cat-proprietary", "out", 1, { label: "RJ45 link output", family: "hall-ultra-4k", maxLengthM: 100 }]]);
const ULTRA_R = io([["hdmi", "out", 2], ["cat-proprietary", "in", 1, { label: "RJ45 link input", family: "hall-ultra-4k", maxLengthM: 100 }]]);

test("Hall ULTRA-4K-S ↔ ULTRA-4K-R emparejan por su UTP; no con un receptor HDBaseT ni con otra familia", () => {
  const plan = planCabling({ nodes: [node("s", "other", "Hall ULTRA-4K-S", [0, 0.76, 0], "table", ULTRA_S), node("r", "other", "Hall ULTRA-4K-R", [0, 1.0, 2.9], "wall", ULTRA_R)], dims });
  const link = plan.links.find((l) => l.signal === "cat")!;
  assert.ok(link && link.from === "s" && link.to === "r");
  assert.match(link.note ?? "", /no es HDBaseT/);
  // Con un receptor HDBaseT (u otra familia) no empareja: queda el aviso de que falta su par.
  const rxHdbt = io([["hdbaset", "in", 1], ["hdmi", "out", 1]]);
  const ultraV = io([["cat-proprietary", "in", 1, { label: "RJ45 Input", family: "hall-ultra-v" }], ["hdmi", "out", 1]]);
  const lone = planCabling({ nodes: [node("s", "other", "Hall ULTRA-4K-S", [0, 0.76, 0], "table", ULTRA_S), node("x", "other", "Receptor HDBaseT", [0, 1, 2.9], "wall", rxHdbt), node("v", "other", "Hall ULTRA-V-R", [1, 1, 2.9], "wall", ultraV)], dims });
  assert.ok(!lone.links.some((l) => l.signal === "cat" || l.signal === "hdbaset"));
  assert.ok(lone.findings.some((f) => f.id === "cat-peer-s-hall-ultra-4k" && f.level === "error"));
  // ULTRA-V-R acepta también el emisor ULTRA-4K (la ficha lo dice): familias "hall-ultra-v,hall-ultra-4k".
  const vr = io([["cat-proprietary", "in", 1, { label: "RJ45 Input", family: "hall-ultra-v,hall-ultra-4k" }], ["hdmi", "out", 1]]);
  const mixed = planCabling({ nodes: [node("s", "other", "Hall ULTRA-4K-S", [0, 0.76, 0], "table", ULTRA_S), node("v", "other", "Hall ULTRA-V-R", [1, 1, 2.9], "wall", vr)], dims });
  assert.ok(mixed.links.some((l) => l.from === "s" && l.to === "v" && l.signal === "cat"));
});

test("plano técnico: enlace propietario contra HDBaseT o contra otra familia es error; el largo de la ficha manda", () => {
  const s = expandIoPorts(ULTRA_S.ports).find((p) => p.signal === "cat-proprietary")!;
  const r = expandIoPorts(ULTRA_R.ports).find((p) => p.signal === "cat-proprietary")!;
  const hdbt: WirePort = { id: "in:hdbaset:1", signal: "hdbaset", direction: "in", label: "HDBaseT IN", connector: "RJ-45", source: "datasheet" };
  assert.equal(portsMismatch(s, r), null);
  assert.match(portsMismatch(s, hdbt)!, /misma familia/);
  assert.match(portsMismatch(s, { ...r, family: "hall-ultra-v" })!, /familias distintas/);
  const wire: Wire = { id: "w", from: { deviceId: "s", unit: 0, portId: s.id }, to: { deviceId: "r", unit: 0, portId: r.id }, signal: "cat-proprietary", cableProductId: null, label: null, points: [], lengthOverrideM: null, origin: "manual" };
  const ports: Record<string, WirePort[]> = { s: [s], r: [r] };
  assert.deepEqual(validateWires([wire], (id) => ports[id] ?? null, () => 80), []);
  assert.ok(validateWires([wire], (id) => ports[id] ?? null, () => 120).some((i) => i.level === "error" && /100 m/.test(i.text)));
});

/* ───────── Plano técnico: largos con las fichas ───────── */

test("plano técnico: HDMI de 7,5 m avisa a 4K60 con la solución y no avisa en 1080p", () => {
  const out: WirePort = { id: "out:hdmi:1", signal: "hdmi", direction: "out", label: "HDMI OUT", connector: null, source: "datasheet" };
  const inp: WirePort = { ...out, id: "in:hdmi:1", direction: "in", label: "HDMI IN" };
  const wire: Wire = { id: "w", from: { deviceId: "a", unit: 0, portId: out.id }, to: { deviceId: "b", unit: 0, portId: inp.id }, signal: "hdmi", cableProductId: null, label: null, points: [], lengthOverrideM: null, origin: "manual" };
  const ports: Record<string, WirePort[]> = { a: [out], b: [inp] };
  const k4 = validateWires([wire], (id) => ports[id] ?? null, () => 7.5, undefined, undefined, { reachOf: () => ({ from: { maxVideo: "4K60" }, to: { maxVideo: "4K60" } }) });
  assert.ok(k4.some((i) => i.level === "warn" && /AOC/.test(i.text)));
  const fhd = validateWires([wire], (id) => ports[id] ?? null, () => 7.5, undefined, undefined, { reachOf: () => ({ from: { maxVideo: "1080p" }, to: { maxVideo: "1080p" } }) });
  assert.deepEqual(fhd, []);
});

test("recorrido corto detrás de los equipos (receptor o códec junto a la pantalla): directo, sin subir al cielorraso", () => {
  assert.equal(wireRunM({ x: 0, y: 1.05, z: 2.9 }, { x: 0, y: 1.4, z: 2.9 }, [], 2.8), 0.35);
  assert.ok(wireRunM({ x: -3, y: 1.4, z: 2.9 }, { x: 3, y: 1.4, z: 2.9 }, [], 2.8) > 6 + 2);
});

/* ───────── Lectura de fichas: vocabulario nuevo ───────── */

test("lectura de ficha: enlace propietario con familia y largo citado; sin familia se descarta; largo sin cita no queda", () => {
  const source = "ULTRA-4K-S 1x RJ45 link output. Extends HDMI and USB up to 100m (330ft) over a single CAT6 cable.";
  const res = validateExtraction(
    {
      ports: [
        { signal: "cat-proprietary", direction: "out", count: 1, label: "RJ45 link output", family: "hall-ultra-4k", evidence: "1x RJ45 link output", maxLengthM: 100, maxLengthEvidence: "up to 100m (330ft) over a single CAT6 cable" },
        { signal: "cat-proprietary", direction: "out", count: 1, label: "Otro enlace", evidence: "ULTRA-4K-S 1x RJ45 link output" },
      ],
    },
    source,
  );
  assert.equal(res.data.ports.length, 1);
  assert.deepEqual([res.data.ports[0]!.family, res.data.ports[0]!.maxLengthM], ["hall-ultra-4k", 100]);
  assert.ok(res.rejected.some((r) => /sin familia/.test(r.what)));
  const noCite = validateExtraction({ ports: [{ signal: "hdbaset", direction: "out", count: 1, label: "HDBT", evidence: "1x RJ45 link output", maxLengthM: 70, maxLengthEvidence: "up to 100m (330ft) over a single CAT6 cable" }] }, source);
  assert.equal(noCite.data.ports[0]!.maxLengthM, undefined);
  assert.ok(lengthCited("165 ft (50 m)", 50) && lengthCited("328ft", 100) && !lengthCited("up to 100m", 70));
});
