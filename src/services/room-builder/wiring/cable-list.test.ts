import { test } from "node:test";
import assert from "node:assert/strict";
import { planCabling } from "../cabling";
import type { CablingProfile, DeviceCablingProfile } from "../cabling-db";
import { buildCableNodes } from "../cabling-scene";
import { pickCablesFor, type CableProduct } from "../cable-picks";
import { devicePorts, type DeviceClass } from "../device-ports";
import type { IoPort, IoProfileData, IoSignal } from "../io-profile/types";
import type { RoomScene, SceneDevice } from "../scene";
import { cableNeeds, cableTotals, roomCableList } from "./cable-list";
import { autoWires, buildWiringModel } from "./model";
import { rackTrunk } from "./rack-trunk";
import { EMPTY_WIRING } from "./types";
import { wireLengthM } from "./validate";

function io(ports: Array<[IoSignal, IoPort["direction"], number]>): IoProfileData {
  return { ports: ports.map(([signal, direction, count]) => ({ signal, direction, count, connector: null, channels: null, poe: null, label: `${signal.toUpperCase()} ${direction.toUpperCase()}`, evidence: "cita" })), capabilities: {} };
}

const CODEC = io([["hdmi", "out", 2], ["hdmi", "in", 1], ["usb-a", "bidir", 3], ["lan", "bidir", 1]]);
const DISPLAY = io([["hdmi", "in", 3]]);
const CAMERA = io([["usb-c", "bidir", 1]]);

const dev = (id: string, role: string, pose: [number, number, number]): SceneDevice => ({
  id,
  slotKey: id,
  productId: `p-${id}`,
  designRole: role,
  label: id,
  quantity: 1,
  pose: { x: pose[0], y: pose[1], z: pose[2], rotY: 0 },
  coverage: null,
  productName: id,
  units: [{ id: `${id}#0`, pose: { x: pose[0], y: pose[1], z: pose[2], rotY: 0 }, placed: true }],
});

const info = (cls: DeviceClass, label: string, data: IoProfileData): DeviceCablingProfile => ({ cls, ports: devicePorts(data), productId: null, label, datasheet: "ok", sourceKind: "datasheet", sources: [], ioPorts: data.ports });

function meetingScene(): RoomScene {
  const slot = (key: string, mount: "rack" | "wall") => ({ key, role: "other", label: key, required: false, mount, pose: { x: 0, y: 1, z: 0, rotY: 0 }, defaultQty: 1 }) as RoomScene["slots"][number];
  return {
    version: 1,
    templateKey: "test",
    widthM: 6,
    depthM: 4,
    heightM: 2.8,
    areaM2: 24,
    cameraPreset: "general",
    coverageView: "off",
    selectedSlotKey: null,
    slots: [slot("codec", "rack"), slot("tv", "wall"), slot("cam", "wall")],
    devices: [dev("codec", "codec", [-2.8, 0.45, 1.8]), dev("tv", "display", [0, 1.4, -1.9]), dev("cam", "camera", [0, 1.1, -1.9])],
  } as RoomScene;
}

const PROFILE: CablingProfile = {
  devices: { codec: info("codec", "Codec", CODEC), tv: info("display", "Pantalla", DISPLAY), cam: info("camera", "Cámara", CAMERA) },
  central: null,
};

test("los 5 cables del motor (notebook en la mesa y switch a sumar) quedan los 5 en el plano técnico", () => {
  const scene = meetingScene();
  const plan = planCabling({ nodes: buildCableNodes(scene, PROFILE), dims: { widthM: 6, depthM: 4, heightM: 2.8 }, tableInput: { x: 0, z: 0.3, topY: 0.75 } });
  const cabled = plan.links.filter((l) => l.signal !== "wireless");
  assert.equal(cabled.length, 5, "HDMI y USB de la notebook, codec→pantalla, cámara→codec y red al switch nuevo");
  assert.ok(cabled.some((l) => l.from === "table") && cabled.some((l) => l.to === "switch-new"));

  const wiring = autoWires(plan, buildWiringModel(scene, PROFILE), EMPTY_WIRING);
  const model = buildWiringModel({ ...scene, wiring }, PROFILE);
  assert.equal(model.wires.length, 5, "ningún cable se pierde");
  // Las puntas virtuales existen como tales, con su posición.
  const table = model.devices.find((d) => d.deviceId === "table");
  const sw = model.devices.find((d) => d.deviceId === "switch-new");
  assert.ok(table?.virtual && Math.abs(table.x - 0) < 1e-6 && Math.abs(table.z - 0.3) < 1e-6, "conector de mesa en la mesa");
  assert.ok(sw?.virtual, "switch a sumar dibujado");
  assert.ok(!model.issues.some((i) => /ya no está|no existe/.test(i.text)), "sin avisos de puerto inexistente");
  for (const l of cabled) {
    const a = l.from.replace(/#\d+$/, "");
    const b = l.to.replace(/#\d+$/, "");
    assert.ok(model.wires.some((w) => w.from.deviceId === a && w.to.deviceId === b), `${l.from} → ${l.to}`);
  }
});

test("un equipo sin puerto libre en la ficha: el cable igual existe, con el puerto a confirmar", () => {
  const scene = meetingScene();
  const narrow: CablingProfile = { ...PROFILE, devices: { ...PROFILE.devices, tv: info("display", "Pantalla", io([["hdmi", "in", 1]])) } };
  const plan = planCabling({ nodes: buildCableNodes(scene, narrow), dims: { widthM: 6, depthM: 4, heightM: 2.8 } });
  // Se fuerza un segundo HDMI a la pantalla (la ficha tiene uno solo).
  const extra = { ...plan.links.find((l) => l.signal === "hdmi" && l.to === "tv#0")!, id: "extra" };
  const wiring = autoWires({ ...plan, links: [...plan.links, extra] }, buildWiringModel(scene, narrow), EMPTY_WIRING);
  const model = buildWiringModel({ ...scene, wiring }, narrow);
  assert.equal(model.wires.length, plan.links.filter((l) => l.signal !== "wireless").length + 1);
  const pending = model.wires.find((w) => w.to.portId.startsWith("pending:"));
  assert.ok(pending, "puerto a confirmar");
  assert.ok(model.issues.some((i) => i.wireId === pending!.id && i.level === "warn"));
});

test("propuesta automática y cableado guardado: la misma lista y los mismos metros", () => {
  const scene = meetingScene();
  const auto = roomCableList(scene, "other", PROFILE);
  assert.equal(auto.source, "auto");
  assert.ok(auto.cables.length > 0);
  // Se guarda lo que propone el sistema ("Resolver y trazar") y se vuelve a leer.
  const saved = roomCableList({ ...scene, wiring: autoWires(auto.plan!, buildWiringModel(scene, PROFILE), EMPTY_WIRING) }, "other", PROFILE);
  assert.equal(saved.source, "manual");
  assert.deepEqual(cableTotals(saved.cables), cableTotals(auto.cables));
});

test("cotización y planilla: los mismos metros por señal", () => {
  const scene = meetingScene();
  const list = roomCableList(scene, "other", PROFILE);
  const catalog: CableProduct[] = [
    ...[1, 2, 3, 5, 7.5, 10, 15].map((m) => ({ id: `h${m}`, name: `HDMI ${m} m`, brand: null, signal: "hdmi" as const, kind: "patch" as const, lengthM: m, extended: false, priceUsd: m })),
    ...[1, 2, 3, 5].map((m) => ({ id: `u${m}`, name: `USB ${m} m`, brand: null, signal: "usb" as const, kind: "patch" as const, lengthM: m, extended: false, priceUsd: m })),
    { id: "utp", name: "UTP Cat6 bobina 305 m", brand: null, signal: "utp", kind: "bulk", lengthM: 305, extended: false, priceUsd: 200 },
  ];
  const { lines, missing } = pickCablesFor(cableNeeds(list.cables).needs, catalog);
  const quoteMeters = new Map<string, number>();
  for (const l of lines) quoteMeters.set(l.signal, (quoteMeters.get(l.signal) ?? 0) + l.meters);
  for (const m of missing) quoteMeters.set(m.signal, (quoteMeters.get(m.signal) ?? 0) + m.meters);
  const sheet = cableTotals(list.cables);
  const sheetBy = (label: string) => sheet.find((t) => t.label === label)?.meters ?? 0;
  assert.equal(quoteMeters.get("hdmi") ?? 0, sheetBy("HDMI"));
  assert.equal(quoteMeters.get("usb") ?? 0, sheetBy("USB") + sheetBy("USB-C"));
  assert.equal(quoteMeters.get("lan") ?? 0, sheetBy("Red / LAN"));
  const total = [...quoteMeters.values()].reduce((a, n) => a + n, 0);
  assert.equal(Math.round(total * 10) / 10, Math.round(sheet.reduce((a, t) => a + t.meters, 0) * 10) / 10);
});

test("cables al rack central: se suma la troncal; sin dato, el cable queda con largo estimado (no se omite)", () => {
  const scene = meetingScene();
  const central: CablingProfile = { ...PROFILE, central: { label: "Rack central del proyecto" } };
  const without = roomCableList(scene, "other", central, null);
  const toRack = without.cables.filter((c) => c.remote);
  assert.ok(toRack.length > 0, "la red baja al rack central");
  assert.ok(toRack.every((c) => c.lengthKind === "estimated" && c.lengthM > 0));
  const withTrunk = roomCableList(scene, "other", central, { meters: 25, measured: true, note: "medido" });
  for (const c of withTrunk.cables.filter((x) => x.remote)) {
    const before = without.cables.find((x) => x.id === c.id)!;
    assert.equal(c.runM, Math.round((before.runM + 25) * 100) / 100);
    assert.equal(c.lengthM, wireLengthM(c.runM, c.signal));
    assert.equal(c.lengthKind, "plan");
  }
});

test("troncal medida sobre el plano del edificio (recorrido ortogonal hasta el rack)", () => {
  // Plano de 1000 × 500 px; ambiente de 10 × 5 m en la mitad derecha → 50 px/m.
  const ctx = {
    image: { widthPx: 1000, heightPx: 500 },
    rack: { u: 0.1, v: 0.5 },
    rooms: [{ id: "r1", widthM: 10, depthM: 5, box: { x0: 0.5, y0: 0, x1: 1, y1: 0.5 }, exit: { x: -5, z: 0 } }],
    roomPos: {},
  };
  // Salida: centro (750,125) + (-5 m × 50) = (500,125). Rack (100,250): 400 + 125 = 525 px = 10,5 m.
  assert.deepEqual(rackTrunk(ctx, "r1").meters, 10.5);
  assert.equal(rackTrunk(ctx, "r1").measured, true);
  assert.equal(rackTrunk({ ...ctx, rack: null }, "r1").measured, false, "rack sin ubicar: estimado");
  assert.equal(rackTrunk({ ...ctx, image: null }, "r1").meters, null, "planta esquemática sin ubicar: no se inventa");
});

test("cableado guardado al que le faltan cables del plan: se suman (con aviso); los borrados a mano no vuelven", async () => {
  const { linkKey } = await import("./model");
  const scene = meetingScene();
  const auto = roomCableList(scene, "other", PROFILE);
  const full = autoWires(auto.plan!, buildWiringModel(scene, PROFILE), EMPTY_WIRING);
  // Como quedaba con el conversor viejo: sin la red al switch nuevo.
  const lost = full.wires.filter((w) => w.to.deviceId === "switch-new");
  assert.ok(lost.length > 0);
  const old = { ...full, wires: full.wires.filter((w) => w.to.deviceId !== "switch-new") };
  const completed = roomCableList({ ...scene, wiring: old }, "other", PROFILE);
  assert.equal(completed.source, "manual");
  assert.equal(completed.cables.length, full.wires.length, "vuelven los que faltaban");
  assert.equal(completed.added, lost.length);
  assert.ok(completed.model.issues.some((i) => /falta en el plano técnico/.test(i.text)));
  assert.equal(new Set(completed.cables.map((c) => c.label)).size, completed.cables.length, "sin etiquetas repetidas");
  // El usuario lo borró a propósito: no se vuelve a sumar ni a proponer.
  const dismissed = { ...old, dismissed: lost.map((w) => linkKey(w.from.deviceId, w.to.deviceId, w.signal)) };
  const respected = roomCableList({ ...scene, wiring: dismissed }, "other", PROFILE);
  assert.equal(respected.cables.length, old.wires.length);
  const redone = autoWires(auto.plan!, buildWiringModel(scene, PROFILE), dismissed);
  assert.ok(!redone.wires.some((w) => w.to.deviceId === "switch-new"), "Resolver y trazar tampoco lo vuelve a poner");
});
