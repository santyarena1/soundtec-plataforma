/**
 * Modelo del plano técnico: equipos ubicados (cada unidad en su lugar real),
 * sus puertos individuales, los cables guardados con su largo y sus avisos, y
 * la propuesta automática convertida en cables editables.
 */

import type { CablingPlan } from "../cabling";
import type { CablingProfile } from "../cabling-db";
import { centralExit } from "../cabling-scene";
import type { Signal } from "../device-ports";
import type { IoSignal } from "../io-profile/types";
import type { RoomScene } from "../scene";
import { layoutSceneDevices, sceneDims } from "../units";
import { expandIoPorts, signalFamily } from "./ports";
import { EMPTY_WIRING, type SceneWiring, type Wire, type WireEnd, type WirePoint, type WirePort } from "./types";
import { validateWires, wireRunM, type WireIssue } from "./validate";

/** Una unidad de equipo en la planta. */
export type PlacedDevice = {
  /** Id del equipo de la escena (o "central:<lugar>" para el rack del proyecto). */
  deviceId: string;
  unit: number;
  label: string;
  /** Rótulo corto en el plano (modelo). */
  short: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  mount: string;
  /** Fuera de la sala (rack central): se dibuja en la salida hacia la sala técnica. */
  remote: boolean;
  role: string;
};

export type WiringModel = {
  devices: PlacedDevice[];
  ports: Record<string, WirePort[]>;
  wires: Array<Wire & { lengthM: number }>;
  issues: WireIssue[];
};

const CENTRAL_PREFIX = "central:";
/** Separación entre equipos del rack central dibujados en la salida (m). */
const CENTRAL_STEP_M = 0.45;

export function wiringOf(scene: RoomScene): SceneWiring {
  return scene.wiring && Array.isArray(scene.wiring.wires) ? { ...EMPTY_WIRING, ...scene.wiring } : EMPTY_WIRING;
}

/** Equipos de la sala (y del rack central) en sus lugares, con sus puertos. */
export function buildWiringModel(scene: RoomScene, profile: CablingProfile | null): WiringModel {
  const dims = sceneDims(scene);
  const slots = new Map(scene.slots.map((s) => [s.key, s]));
  const wiring = wiringOf(scene);
  const devices: PlacedDevice[] = [];
  const ports: Record<string, WirePort[]> = {};

  for (const { device } of layoutSceneDevices(scene.devices, slots, dims)) {
    const info = profile?.devices[device.id];
    const short = info?.label ? info.label.replace(/^\S+\s/, "") : (device.productName ?? device.label);
    for (const [k, u] of (device.units ?? []).entries()) {
      devices.push({ deviceId: device.id, unit: k, label: info?.label ?? device.label, short, x: u.pose.x, y: u.pose.y, z: u.pose.z, rotY: u.pose.rotY, mount: slots.get(device.slotKey)?.mount ?? "wall", remote: false, role: device.designRole });
    }
    ports[device.id] = wiring.ports[device.id] ?? (info?.ioPorts?.length ? expandIoPorts(info.ioPorts) : []);
  }
  if (profile?.central && profile.centralDevices?.length) {
    const exit = centralExit(scene);
    profile.centralDevices.forEach((c, i) => {
      const id = `${CENTRAL_PREFIX}${c.key}`;
      for (let k = 0; k < c.quantity; k++) {
        devices.push({ deviceId: id, unit: k, label: `${c.label} · rack central`, short: c.label.replace(/^\S+\s/, ""), x: exit.x, y: 0.45, z: exit.z + (i * c.quantity + k) * CENTRAL_STEP_M, rotY: 0, mount: "rack", remote: true, role: "processor" });
      }
      ports[id] = wiring.ports[id] ?? (c.ioPorts?.length ? expandIoPorts(c.ioPorts) : []);
    });
  }

  const at = (end: WireEnd) => devices.find((d) => d.deviceId === end.deviceId && d.unit === end.unit) ?? null;
  const lengthOf = (w: Wire) => {
    if (w.lengthOverrideM != null) return w.lengthOverrideM;
    const a = at(w.from);
    const b = at(w.to);
    return a && b ? wireRunM(a, b, w.points, scene.heightM) : 0;
  };
  const wires = wiring.wires.map((w) => ({ ...w, lengthM: lengthOf(w) }));
  const issues = validateWires(wiring.wires, (id) => ports[id] ?? null, lengthOf);
  for (const w of wiring.wires) {
    if (!at(w.from) || !at(w.to)) issues.push({ wireId: w.id, level: "error", text: "Uno de los equipos del cable ya no está en la sala." });
  }
  return { devices, ports, wires, issues };
}

/** Señales del motor automático → señales de ficha que pueden ocupar ese cable. */
const ENGINE_TO_IO: Record<Signal, IoSignal[]> = {
  hdmi: ["hdmi"],
  usb: ["usb-a", "usb-b", "usb-c"],
  lan: ["lan", "dante"],
  dante: ["dante", "lan"],
  hdbaset: ["hdbaset"],
  speaker: ["speaker"],
  line: ["analog-audio", "mic", "digital-audio"],
  rs232: ["rs232"],
  ir: ["ir"],
  wireless: [],
};

/** "deviceId#2" → { deviceId, unit: 2 }; "central:central_amp#0" → central. */
function nodeEnd(nodeId: string): { deviceId: string; unit: number } | null {
  const m = /^(.*)#(\d+)$/.exec(nodeId);
  if (!m) return null;
  return { deviceId: m[1]!, unit: Number(m[2]) };
}

/** Recorrido del motor (x,y,z) → quiebres en planta, sin las puntas ni tramos verticales repetidos. */
function planPoints(route: Array<[number, number, number]>): WirePoint[] {
  const flat = route.map(([x, , z]) => ({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 }));
  const dedup = flat.filter((p, i) => i === 0 || p.x !== flat[i - 1]!.x || p.z !== flat[i - 1]!.z);
  return dedup.slice(1, -1);
}

/**
 * La propuesta del motor como cables editables: cada enlace va a un puerto
 * libre de la señal correcta en cada punta. Los cables manuales se conservan;
 * los automáticos anteriores se reemplazan.
 */
export function autoWires(plan: CablingPlan, model: WiringModel, current: SceneWiring): SceneWiring {
  const manual = current.wires.filter((w) => w.origin === "manual");
  const taken = new Set(manual.flatMap((w) => [`${w.from.deviceId}#${w.from.unit}#${w.from.portId}`, `${w.to.deviceId}#${w.to.unit}#${w.to.portId}`]));
  const wires: Wire[] = [...manual];
  const pick = (end: { deviceId: string; unit: number }, wanted: IoSignal[], side: "out" | "in", shared: boolean): string | null => {
    const list = model.ports[end.deviceId] ?? [];
    const ok = (p: WirePort) => wanted.some((s) => signalFamily(s) === signalFamily(p.signal)) && (p.direction === side || p.direction === "bidir");
    const free = list.find((p) => ok(p) && !taken.has(`${end.deviceId}#${end.unit}#${p.id}`));
    const port = free ?? (shared ? list.find(ok) : undefined);
    return port?.id ?? null;
  };
  let n = 0;
  for (const link of plan.links) {
    if (link.signal === "wireless") continue;
    const a = nodeEnd(link.from);
    const b = nodeEnd(link.to);
    if (!a || !b) continue;
    const wanted = ENGINE_TO_IO[link.signal];
    const fromPort = pick(a, wanted, "out", link.signal === "speaker");
    const toPort = pick(b, wanted, "in", false);
    if (!fromPort || !toPort) continue;
    // Ya hay un cable manual entre esos mismos puertos: manda el manual.
    if (manual.some((w) => w.from.deviceId === a.deviceId && w.to.deviceId === b.deviceId && w.from.portId === fromPort && w.to.portId === toPort)) continue;
    taken.add(`${a.deviceId}#${a.unit}#${fromPort}`);
    taken.add(`${b.deviceId}#${b.unit}#${toPort}`);
    const signal = (model.ports[a.deviceId] ?? []).find((p) => p.id === fromPort)?.signal ?? wanted[0]!;
    wires.push({ id: `auto-${++n}-${link.id}`, from: { ...a, portId: fromPort }, to: { ...b, portId: toPort }, signal, cableProductId: null, label: null, points: planPoints(link.route), lengthOverrideM: null, origin: "auto" });
  }
  return { ...current, wires: numberLabels(wires) };
}

/** Etiquetas de obra correlativas por señal para los cables que no tienen ("HDMI-001"). */
export function numberLabels(wires: Wire[]): Wire[] {
  const count = new Map<string, number>();
  return wires.map((w) => {
    if (w.label) return w;
    const code = signalFamily(w.signal).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const k = (count.get(code) ?? 0) + 1;
    count.set(code, k);
    return { ...w, label: `${code}-${String(k).padStart(3, "0")}` };
  });
}
