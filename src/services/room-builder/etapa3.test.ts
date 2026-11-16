import { test } from "node:test";
import assert from "node:assert/strict";
import { planCabling, routeCable, routeLength, type CableNode } from "./cabling";
import type { CablingProfile } from "./cabling-db";
import { deviceClass, devicePorts } from "./device-ports";
import { ADM_ACUITY, discas, H_PER_DIAG, recommendSize } from "./discas";
import type { IoCapabilities, IoPort, IoProfileData, IoSignal } from "./io-profile/types";
import { manualIoPorts, normalizeManualPorts, withManualPorts } from "./manual-ports";
import { familyPrefix, sameKindFilter } from "./rank-from-db";
import { kitIncludesTouch, roleFitReason } from "./role-fit";
import { targetDisplayInches } from "./sizing";
import { expandIoPorts } from "./wiring/ports";
import type { Wire } from "./wiring/types";
import { validateWires, wireRunM } from "./wiring/validate";

const dims = { widthM: 6, depthM: 8, heightM: 2.7 };

function io(ports: Array<[IoSignal, IoPort["direction"], number, Partial<IoPort>?]>): IoProfileData {
  return {
    ports: ports.map(([signal, direction, count, extra]) => ({ signal, direction, count, connector: null, channels: null, poe: null, label: `${signal} ${direction}`, evidence: "cita", ...extra })),
    capabilities: {} as IoCapabilities,
  };
}

function node(id: string, role: string, name: string, pos: [number, number, number], mount: string, profile: IoProfileData | null): CableNode {
  return { id, label: name, cls: deviceClass({ role, slotKey: role, name, spec: null }), ports: profile ? devicePorts(profile) : null, pos: { x: pos[0], y: pos[1], z: pos[2] }, mount, productId: `p-${id}` };
}

/* ───────── Parte A: DISCAS (AVIXA V202.01) ───────── */

const front = { x: 0, y: 1.6, z: 4, rotY: 180 };

test("DISCAS ADM 1080p: último espectador a 8 m → altura 8 × 1080 / 3438 = 2,51 m → 202\" → proyector (supera 100\")", () => {
  const r = discas({ display: front, viewers: [{ x: 0, z: -4, label: "Silla fondo" }], content: "detail-1080", heightM: 4, fallbackDistanceM: 0 });
  assert.equal(r.farthestM, 8);
  assert.equal(r.method, "ADM");
  assert.equal(r.imageHeightM, Math.round(((8 * 1080) / ADM_ACUITY) * 100) / 100);
  assert.equal(r.imageHeightM, 2.51);
  assert.equal(Math.round(r.requiredIn), 202);
  assert.equal(r.flatPanelIn, null);
  assert.equal(r.recommendation.kind, "projector");
  assert.equal(r.recommendation.sizeIn, 250);
  assert.match(r.recommendation.text, /proyector/);
});

test("DISCAS BDM: 3 % → distancia / 6 (8 m → 1,33 m, 107\" → proyector 110\"); 4 % → distancia / 8 (85\" plana)", () => {
  const general = discas({ display: front, viewers: [{ x: 0, z: -4, label: "fondo" }], content: "general", heightM: 2.7, fallbackDistanceM: 0 });
  assert.equal(general.imageHeightM, 1.33);
  assert.equal(Math.round(general.requiredIn), 107);
  assert.deepEqual([general.recommendation.kind, general.recommendation.sizeIn], ["projector", 110]);
  const video = discas({ display: front, viewers: [{ x: 0, z: -4, label: "fondo" }], content: "video", heightM: 2.7, fallbackDistanceM: 0 });
  assert.equal(video.imageHeightM, 1);
  assert.deepEqual([video.recommendation.kind, video.flatPanelIn], ["flat", 85]);
  // Borde inferior ≥ 1,2 m sentados; borde superior = 1,2 + alto de 85" (1,06 m) bajo el techo de 2,7 m.
  assert.equal(video.bottomM, 1.2);
  assert.equal(video.topM, Math.round((1.2 + 85 * 0.0254 * H_PER_DIAG) * 100) / 100);
  assert.ok(video.fitsCeiling);
});

test("DISCAS: techo bajo, ángulo lateral, distancia estimada y pantalla elegida chica / baja", () => {
  const low = discas({ display: front, viewers: [{ x: 0, z: -4, label: "fondo" }], content: "general", heightM: 2.4, fallbackDistanceM: 0 });
  assert.equal(low.fitsCeiling, false);
  assert.ok(low.warnings.some((w) => /no entra/.test(w)));
  const side = discas({ display: front, viewers: [{ x: 2.9, z: 3.2, label: "Silla lateral" }, { x: 0, z: -2, label: "fondo" }], content: "video", heightM: 2.7, fallbackDistanceM: 0 });
  assert.ok(side.maxAngleDeg! > 45);
  assert.equal(side.lateralLabel, "Silla lateral");
  const est = discas({ display: front, viewers: [], content: "general", heightM: 2.7, fallbackDistanceM: 4.25 });
  assert.equal(est.distanceEstimated, true);
  // Pantalla elegida de 55" con el centro a 1,4 m: chica para 8 m y con el borde inferior a 1,07 m (bajo 1,2 m).
  const cur = discas({ display: { ...front, y: 1.4 }, viewers: [{ x: 0, z: -4, label: "fondo" }], content: "video", heightM: 2.7, fallbackDistanceM: 0, currentInches: 55 });
  assert.equal(cur.current!.enough, false);
  assert.ok(cur.warnings.some((w) => /tapado por las cabezas/.test(w)));
  // Los que están detrás de la pantalla no cuentan.
  const behind = discas({ display: front, viewers: [{ x: 0, z: 5, label: "atrás" }], content: "video", heightM: 2.7, fallbackDistanceM: 3 });
  assert.equal(behind.distanceEstimated, true);
});

test("tamaños comerciales: plana hasta 100\", proyección hasta 300\", más grande LED", () => {
  assert.equal(recommendSize(64).flatPanelIn, 65);
  assert.equal(recommendSize(99).flatPanelIn, 100);
  assert.equal(recommendSize(101).recommendation.kind, "projector");
  assert.equal(recommendSize(320).recommendation.kind, "led");
  // Sin escena: mismo criterio de antes (BDM 3 % al 85 % de la profundidad).
  assert.equal(targetDisplayInches({ depthM: 5 }, "videoconference"), 65);
});

/* ───────── Parte B: puertos cargados a mano ───────── */

test("puertos a mano: se suman al perfil, el motor los cablea y quedan marcados sin ficha", () => {
  const manual = normalizeManualPorts([{ label: "HDMI IN", signal: "hdmi", direction: "in", count: 1, connector: "HDMI tipo A" }, { label: "x", signal: "nada", direction: "in" }]);
  assert.equal(manual.length, 1, "señal fuera del vocabulario: se descarta");
  const profile: CablingProfile = { devices: { tv: { cls: "display", ports: null, productId: "p-tv", label: "TV sin ficha", datasheet: "missing", sourceKind: null, sources: [] } }, central: null };
  const merged = withManualPorts(profile, { devices: [{ id: "tv", manualPorts: manual } as never] });
  assert.equal(merged.devices.tv!.ports!.inputs[0]!.manual, true);
  // Idempotente: mezclar dos veces no duplica.
  assert.equal(withManualPorts(merged, { devices: [{ id: "tv", manualPorts: manual } as never] }).devices.tv!.ports!.inputs.length, 1);
  // Sin puertos a mano vuelve a lo de la ficha.
  assert.equal(withManualPorts(merged, { devices: [{ id: "tv" } as never] }).devices.tv!.ports, null);

  const tv: CableNode = { id: "tv", label: "TV sin ficha", cls: "display", ports: merged.devices.tv!.ports, pos: { x: 0, y: 1.6, z: 3.9 }, mount: "wall" };
  const plan = planCabling({ nodes: [tv], dims, tableInput: { x: 0, z: 0, topY: 0.75 } });
  assert.ok(plan.links.some((l) => l.from === "table" && l.to === "tv" && l.signal === "hdmi"), "la notebook va a la entrada cargada a mano");
  assert.ok(plan.findings.some((f) => f.id === "manual-ports-tv" && f.level === "warn"));

  const ports = expandIoPorts(manualIoPorts(manual));
  assert.equal(ports[0]!.source, "manual");
  const src = expandIoPorts(io([["hdmi", "out", 1]]).ports);
  const wire: Wire = { id: "w1", from: { deviceId: "pc", unit: 0, portId: src[0]!.id }, to: { deviceId: "tv", unit: 0, portId: ports[0]!.id }, signal: "hdmi", cableProductId: null, label: null, points: [], lengthOverrideM: null, origin: "manual" };
  const issues = validateWires([wire], (id) => (id === "pc" ? src : ports), () => 3);
  assert.ok(issues.some((i) => i.level === "warn" && /cargado a mano, sin ficha/.test(i.text)), "no verificado: aviso");
  assert.ok(!issues.some((i) => i.level === "error"));
});

/* ───────── Parte C ───────── */

test("Osiris: el DSP con entrada de enlace gain-osiris empareja con el micrófono de techo por su UTP", () => {
  const dsp = io([["cat-proprietary", "in", 1, { label: "CEILING MIC", family: "gain-osiris" }], ["analog-audio", "out", 1, { label: "LINE OUT" }]]);
  const mic = io([["cat-proprietary", "out", 1, { label: "CAT6 al DSP", family: "gain-osiris" }]]);
  const plan = planCabling({ nodes: [node("dsp", "processor", "HT-OSIRIS-DSP1", [2, 0.45, 3.8], "rack", dsp), node("mic", "mic", "GN-OSIR-M1501-CM", [0, 2.6, 0], "ceiling", mic)], dims });
  const link = plan.links.find((l) => l.signal === "cat");
  assert.ok(link && link.from === "mic" && link.to === "dsp");
  assert.ok(!plan.findings.some((f) => f.id.startsWith("cat-peer")));
});

test("mesa → códec: el motor y el plano técnico miden el mismo recorrido (una sola geometría)", () => {
  const codec = node("codec", "codec", "UC-C100-T", [0.4, 1.0, 3.9], "wall", io([["hdmi", "in", 1], ["hdmi", "out", 1]]));
  const tv = node("tv", "display", "TV", [0, 1.6, 3.9], "wall", io([["hdmi", "in", 1]]));
  const plan = planCabling({ nodes: [codec, tv], dims, tableInput: { x: 0.3, z: 0.2, topY: 0.76 } });
  const link = plan.links.find((l) => l.from === "table" && l.to === "codec" && l.signal === "hdmi")!;
  assert.ok(link);
  // Quiebres en planta del recorrido del motor, como los guarda el plano técnico.
  const flat = link.route.map(([x, , z]) => ({ x, z })).filter((p, i, a) => i === 0 || p.x !== a[i - 1]!.x || p.z !== a[i - 1]!.z);
  const run = wireRunM({ x: 0.3, y: 0.76, z: 0.2, mount: "table" }, { x: 0.4, y: 1.0, z: 3.9, mount: "wall" }, flat.slice(1, -1), dims.heightM);
  assert.equal(run, link.runM);
  assert.equal(Math.round(routeLength(routeCable(plan.nodes.find((n) => n.id === "table")!, codec, dims)) * 100) / 100, link.runM);
});

test("cadena Hall: notebook → emisor (HDMI) → enlace propietario → receptor → pantalla (HDMI)", () => {
  const S = io([["hdmi", "in", 1], ["cat-proprietary", "out", 1, { label: "RJ45 link output", family: "hall-ultra-4k", maxLengthM: 100 }]]);
  const R = io([["hdmi", "out", 1], ["cat-proprietary", "in", 1, { label: "RJ45 link input", family: "hall-ultra-4k", maxLengthM: 100 }]]);
  const plan = planCabling({
    nodes: [node("s", "other", "Hall ULTRA-4K-S", [0.3, 0.76, 0.2], "table", S), node("r", "other", "Hall ULTRA-4K-R", [0, 1.2, 3.9], "wall", R), node("tv", "display", "TV", [0, 1.6, 3.9], "wall", io([["hdmi", "in", 1]]))],
    dims,
    tableInput: { x: 0.3, z: 0.2, topY: 0.76 },
  });
  const has = (from: string, to: string, signal: string) => plan.links.some((l) => l.from === from && l.to === to && l.signal === signal);
  assert.ok(has("table", "s", "hdmi"), "notebook al emisor");
  assert.ok(has("s", "r", "cat"), "enlace propietario");
  assert.ok(has("r", "tv", "hdmi"), "receptor a la pantalla");
  assert.ok(!has("table", "tv", "hdmi"), "no va directo a la pantalla");
  assert.ok(!plan.findings.some((f) => f.id.startsWith("display-src-")));
});

test("kit UC con su touch: no se duplica el touch de mesa", () => {
  assert.equal(kitIncludesTouch({ name: "UC-C100-T" }), true);
  assert.equal(kitIncludesTouch({ name: "UC-CX100-PRO-Z-WM" }), true);
  assert.equal(kitIncludesTouch({ name: "CCC-120-T", summary: "Soporta hasta dos pantallas y múltiples dispositivos USB." }), false);
  assert.equal(kitIncludesTouch({ name: "UC-ENGINE-BRKT-T-UPGRD", summary: "Incluye una pantalla táctil" }), false, "kit de actualización");
  assert.equal(kitIncludesTouch({ name: "Kit X", summary: "Incluye una pantalla táctil de 10.1 pulgadas" }), true);
  const tsw = { name: "TSW-1070-B-S", productType: "touchpanel", ports: [{ signal: "lan" as IoSignal, direction: "in" as const, count: 1, connector: "RJ-45", channels: null, poe: "pd" as const, label: "LAN", evidence: "x" }], caps: {} as IoCapabilities };
  const slot = { key: "touch", role: "touch", mount: "wall" };
  assert.equal(roleFitReason(slot, tsw), null);
  assert.match(roleFitReason(slot, tsw, { codecHasTouch: true })!, /ya trae su panel/);
});

test("Cambiar por otro: un equipo agregado sugiere solo su misma clase (switch → switch)", () => {
  assert.equal(familyPrefix("CEN-SWPOE-10"), "CEN-SWPOE-");
  assert.equal(familyPrefix("X1"), null);
  assert.deepEqual(sameKindFilter({ productType: "network", name: "CEN-SWPOE-10" }), {
    OR: [{ aiProfile: { productType: "network" } }, { normalizedName: { startsWith: "CEN-SWPOE-", mode: "insensitive" } }],
  });
  // Tipo vago ("other"): solo por familia del modelo, nunca todo el rol.
  assert.deepEqual(sameKindFilter({ productType: "other", name: "CEN-SWPOE-26" }), { OR: [{ normalizedName: { startsWith: "CEN-SWPOE-", mode: "insensitive" } }] });
});
