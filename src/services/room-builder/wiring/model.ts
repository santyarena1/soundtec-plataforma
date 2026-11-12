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
import { physicalFamily } from "../sheets/sheet-model";
import { expandIoPorts, portsFromSignals, signalFamily } from "./ports";
import { EMPTY_WIRING, VIRTUAL_END_IDS, WIRE_SIGNAL_STYLE, type SceneWiring, type VirtualEnd, type Wire, type WireEnd, type WirePoint, type WirePort } from "./types";
import type { ElectricalOf } from "./speaker-load";
import { validateWires, wireLengthM, wireRunM, type WireIssue } from "./validate";

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
  /** Clase del equipo para el cableado (amp, display, control…). */
  cls?: string;
  /** Punta que no es un producto (conexión de mesa, switch a sumar, rack central). */
  virtual?: boolean;
};

/** plan: medido en el plano; fixed: forzado a mano; estimated: falta un dato (ej. dónde está el rack). */
export type LengthKind = "plan" | "fixed" | "estimated";

/**
 * Tramo troncal desde la salida de la sala hasta el rack central del proyecto.
 * meters null: no se sabe (falta ubicar el ambiente o el rack); el cable no se
 * omite, su largo queda marcado como estimado.
 */
export type RackTrunk = { meters: number | null; measured: boolean; note: string };

export type ModelWire = Wire & {
  /** Recorrido medido (m), con el tramo al rack si corresponde. */
  runM: number;
  /** Largo final del cable (m): misma fórmula que el motor automático. */
  lengthM: number;
  lengthKind: LengthKind;
  /** Va al rack central (fuera de la sala). */
  remote: boolean;
  note: string | null;
};

export type WiringModel = {
  devices: PlacedDevice[];
  ports: Record<string, WirePort[]>;
  wires: ModelWire[];
  issues: WireIssue[];
};

export type WiringModelOptions = { trunk?: RackTrunk | null; /** Tipo de sala (para el control de carga de parlantes). */ category?: string | null };

const CENTRAL_PREFIX = "central:";
/** Separación entre equipos del rack central dibujados en la salida (m). */
const CENTRAL_STEP_M = 0.45;
/** Altura del rack central en la salida de la sala (igual que el motor). */
const CENTRAL_Y_M = 0.45;
/** Prefijo de los puertos que el motor necesita y la ficha no declara (se marcan para confirmar). */
const PENDING_PREFIX = "pending:";
const VIRTUAL_IDS = new Set<string>(VIRTUAL_END_IDS);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function wiringOf(scene: RoomScene): SceneWiring {
  return scene.wiring && Array.isArray(scene.wiring.wires) ? { ...EMPTY_WIRING, ...scene.wiring } : EMPTY_WIRING;
}

/** Punta virtual sin datos guardados (cableados viejos): rack en la salida, mesa al centro, switch en una esquina. */
function fallbackVirtual(id: string, scene: RoomScene, profile: CablingProfile | null): VirtualEnd | null {
  if (id === "central") return { id, label: profile?.central?.label ?? "Rack central", kind: "rack", x: 0, y: CENTRAL_Y_M, z: 0, mount: "rack" };
  if (id === "table") return { id, label: "Conexión de mesa (notebook)", kind: "table", x: 0, y: 0.75, z: 0, mount: "table" };
  if (id === "switch-new") return { id, label: "Switch de red (a sumar)", kind: "switch", x: -scene.widthM / 2 + 0.3, y: CENTRAL_Y_M, z: -scene.depthM / 2 + 0.3, mount: "rack" };
  return null;
}

const VIRTUAL_SHORT: Record<VirtualEnd["kind"], string> = { table: "Conexión de mesa", switch: "Switch (a sumar)", rack: "Rack central" };
const VIRTUAL_CLS: Record<VirtualEnd["kind"], string> = { table: "source", switch: "switch", rack: "other" };

/** "pending:out:lan:2" → puerto a confirmar (la ficha no lo declara). */
function pendingPort(portId: string): WirePort | null {
  if (!portId.startsWith(PENDING_PREFIX)) return null;
  const [, direction, signal] = portId.split(":") as [string, WirePort["direction"], WirePort["signal"]];
  if (!WIRE_SIGNAL_STYLE[signal]) return null;
  return { id: portId, signal, direction, label: `${WIRE_SIGNAL_STYLE[signal].label} (a confirmar)`, connector: null, source: "manual" };
}

/** Equipos de la sala (y del rack central) en sus lugares, con sus puertos. */
export function buildWiringModel(scene: RoomScene, profile: CablingProfile | null, opts: WiringModelOptions = {}): WiringModel {
  const dims = sceneDims(scene);
  const slots = new Map(scene.slots.map((s) => [s.key, s]));
  const wiring = wiringOf(scene);
  const devices: PlacedDevice[] = [];
  const ports: Record<string, WirePort[]> = {};

  for (const { device } of layoutSceneDevices(scene.devices, slots, dims)) {
    // Un lugar sin producto ni genérico todavía no es un equipo: no se dibuja ni se cablea.
    if (!device.productId && !device.generic) continue;
    const info = profile?.devices[device.id];
    // Rótulo corto: el modelo sin la marca (los genéricos van con su nombre completo).
    const brand = device.brandName?.trim();
    const short = device.generic ? device.generic.name : info?.label ? (brand && info.label.startsWith(`${brand} `) ? info.label.slice(brand.length + 1) : info.label) : (device.productName ?? device.label);
    for (const [k, u] of (device.units ?? []).entries()) {
      devices.push({ deviceId: device.id, unit: k, label: info?.label ?? device.label, short, x: u.pose.x, y: u.pose.y, z: u.pose.z, rotY: u.pose.rotY, mount: slots.get(device.slotKey)?.mount ?? "wall", remote: false, role: device.designRole, cls: info?.cls });
    }
    const fromSheet = info?.ioPorts?.length ? expandIoPorts(info.ioPorts) : [];
    ports[device.id] = wiring.ports[device.id] ?? (info?.sourceKind === "generic" ? fromSheet.map((q) => ({ ...q, source: "generic" as const })) : fromSheet);
  }
  if (profile?.central && profile.centralDevices?.length) {
    const exit = centralExit(scene);
    // Del rack central se muestran solo los equipos que tienen cables hacia esta sala.
    const wiredCentral = new Set(wiring.wires.flatMap((w) => [w.from.deviceId, w.to.deviceId]).filter((id) => id.startsWith(CENTRAL_PREFIX)));
    profile.centralDevices.forEach((c, i) => {
      const id = `${CENTRAL_PREFIX}${c.key}`;
      // Los puertos van siempre (el armado automático los necesita para elegir el puerto real).
      ports[id] = wiring.ports[id] ?? (c.ioPorts?.length ? expandIoPorts(c.ioPorts) : []);
      if (!wiredCentral.has(id)) return;
      for (let k = 0; k < c.quantity; k++) {
        devices.push({ deviceId: id, unit: k, label: `${c.label} · rack central`, short: c.label.replace(/^\S+\s/, ""), x: exit.x, y: CENTRAL_Y_M, z: exit.z + (i * c.quantity + k) * CENTRAL_STEP_M, rotY: 0, mount: "rack", remote: true, role: "processor", cls: c.cls });
      }
    });
  }

  // Puntas virtuales (mesa, switch a sumar, rack central): se dibujan donde están, no se pierden.
  const referenced = new Set(wiring.wires.flatMap((w) => [w.from.deviceId, w.to.deviceId]));
  for (const id of referenced) {
    if (devices.some((d) => d.deviceId === id)) continue;
    const v = wiring.virtual?.[id] ?? (VIRTUAL_IDS.has(id) ? fallbackVirtual(id, scene, profile) : null);
    if (!v) continue;
    // El rack central siempre en la salida actual de la sala (la puerta puede moverse).
    const pos = v.kind === "rack" ? { ...centralExit(scene), y: CENTRAL_Y_M } : { x: v.x, y: v.y, z: v.z };
    devices.push({ deviceId: id, unit: 0, label: v.label, short: VIRTUAL_SHORT[v.kind], x: pos.x, y: pos.y, z: pos.z, rotY: 0, mount: v.mount, remote: v.kind === "rack", role: "other", cls: VIRTUAL_CLS[v.kind], virtual: true });
    ports[id] = wiring.ports[id] ?? [];
  }

  // Puertos que el motor necesitó y la ficha no declara: existen (el cable no se pierde) y se avisan.
  const issues: WireIssue[] = [];
  for (const w of wiring.wires) {
    for (const end of [w.from, w.to]) {
      const p = pendingPort(end.portId);
      if (!p || (ports[end.deviceId] ?? []).some((q) => q.id === p.id)) continue;
      ports[end.deviceId] = [...(ports[end.deviceId] ?? []), p];
    }
    if ([w.from, w.to].some((e) => e.portId.startsWith(PENDING_PREFIX))) issues.push({ wireId: w.id, level: "warn", text: "La ficha del equipo no declara un puerto libre para este cable: confirmar el puerto en obra o cargar la ficha." });
  }

  const at = (end: WireEnd) => devices.find((d) => d.deviceId === end.deviceId && d.unit === end.unit) ?? null;
  const trunk = opts.trunk ?? null;
  const measure = (w: Wire): Omit<ModelWire, keyof Wire> => {
    const a = at(w.from);
    const b = at(w.to);
    const remote = Boolean(a?.remote || b?.remote);
    if (w.lengthOverrideM != null) return { runM: w.lengthOverrideM, lengthM: w.lengthOverrideM, lengthKind: "fixed", remote, note: null };
    if (!a || !b) return { runM: 0, lengthM: 0, lengthKind: "estimated", remote, note: "Falta una de las puntas del cable" };
    let run = wireRunM(a, b, w.points, scene.heightM);
    let lengthKind: LengthKind = "plan";
    let note: string | null = null;
    if (remote) {
      // Tramo dentro de la sala hasta la salida + troncal hasta el rack central.
      if (trunk?.meters != null) run += trunk.meters;
      if (!trunk?.measured) lengthKind = "estimated";
      note = trunk?.note ?? "Medido hasta la salida de la sala: falta ubicar el rack central para sumar la troncal";
    }
    return { runM: r2(run), lengthM: wireLengthM(run, w.signal), lengthKind, remote, note };
  };
  const wires: ModelWire[] = wiring.wires.map((w) => ({ ...w, ...measure(w) }));
  const lengthById = new Map(wires.map((w) => [w.id, w.lengthM]));
  // Datos eléctricos de ficha (sala y rack central): con ellos corre el control de carga de las salidas de parlante.
  const electricalOf: ElectricalOf = (id) => {
    const d = profile?.devices[id];
    if (d) return { label: d.label, ports: d.ports };
    const c = id.startsWith(CENTRAL_PREFIX) ? profile?.centralDevices?.find((x) => `${CENTRAL_PREFIX}${x.key}` === id) : undefined;
    return c ? { label: c.label, ports: c.ports } : null;
  };
  issues.unshift(...validateWires(wiring.wires, (id) => ports[id] ?? null, (w) => lengthById.get(w.id) ?? 0, profile ? electricalOf : undefined, { category: opts.category ?? null }));
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

/**
 * "deviceId#2" → { deviceId, unit: 2 }; "central:central_amp#0" → central.
 * Las puntas virtuales del motor ("table", "switch-new", "central") no llevan
 * número de unidad: son una sola (unidad 0). Antes se descartaban y el cable
 * desaparecía del plano técnico.
 */
function nodeEnd(nodeId: string): { deviceId: string; unit: number } | null {
  const m = /^(.*)#(\d+)$/.exec(nodeId);
  if (m) return { deviceId: m[1]!, unit: Number(m[2]) };
  return nodeId ? { deviceId: nodeId, unit: 0 } : null;
}

const VIRTUAL_KIND: Record<string, VirtualEnd["kind"]> = { table: "table", "switch-new": "switch", central: "rack" };

/** Puntas virtuales del plan (mesa, switch a sumar, rack central) con su posición. */
function virtualEndsOf(plan: CablingPlan): Record<string, VirtualEnd> {
  const out: Record<string, VirtualEnd> = {};
  for (const n of plan.nodes) {
    const kind = VIRTUAL_KIND[n.id];
    if (!n.virtual || !kind) continue;
    out[n.id] = { id: n.id, label: n.label, kind, x: r2(n.pos.x), y: kind === "rack" ? CENTRAL_Y_M : r2(n.pos.y), z: r2(n.pos.z), mount: n.mount };
  }
  return out;
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
export function autoWires(plan: CablingPlan, model: WiringModel, current: SceneWiring, opts: { only?: Set<string> } = {}): SceneWiring {
  const virtual = virtualEndsOf(plan);
  const generic = placeholderPorts(plan, model, new Set(Object.keys(virtual)));
  // Puertos de las puntas virtuales: los del plan actual (la cantidad cambia con los equipos),
  // sin perder los que ya usan cables guardados.
  const virtualPorts = Object.fromEntries(Object.entries(generic).filter(([id]) => virtual[id]).map(([id, list]) => [id, unionPorts(list, current.ports[id])]));
  const ports = { ...generic, ...current.ports, ...virtualPorts };
  // Cables que el usuario borró a mano: no se vuelven a proponer (uno por cada borrado).
  const dismissed = new Map<string, number>();
  for (const k of current.dismissed ?? []) dismissed.set(k, (dismissed.get(k) ?? 0) + 1);
  model = { ...model, ports: { ...model.ports, ...ports } };
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
  // Sin puerto libre en la ficha: el cable igual existe, con un puerto "a confirmar" (el modelo lo avisa).
  const pending = (end: { deviceId: string; unit: number }, side: "out" | "in", signal: IoSignal): string => {
    let k = 1;
    while (taken.has(`${end.deviceId}#${end.unit}#${PENDING_PREFIX}${side}:${signal}:${k}`)) k++;
    return `${PENDING_PREFIX}${side}:${signal}:${k}`;
  };
  const placed = (end: { deviceId: string; unit: number }) => model.devices.find((d) => d.deviceId === end.deviceId && d.unit === end.unit) ?? (virtual[end.deviceId] && end.unit === 0 ? virtual[end.deviceId] : undefined);
  let n = 0;
  for (const link of plan.links) {
    if (link.signal === "wireless" || (opts.only && !opts.only.has(link.id))) continue;
    const a = nodeEnd(link.from);
    const b = nodeEnd(link.to);
    if (!a || !b) continue;
    const key = linkKey(a.deviceId, b.deviceId, link.signal);
    const skip = dismissed.get(key) ?? 0;
    if (skip > 0) {
      dismissed.set(key, skip - 1);
      continue;
    }
    const wanted = ENGINE_TO_IO[link.signal];
    const channel = link.signal === "speaker" ? /Canal (\d+)/.exec(link.fromPort)?.[1] : undefined;
    const channelPort = channel ? (model.ports[a.deviceId] ?? []).find((p) => p.signal === "speaker" && p.direction !== "in" && p.id.endsWith(`:${channel}`)) : undefined;
    const fromPort = channelPort?.id ?? pick(a, wanted, "out", link.signal === "speaker") ?? pending(a, "out", wanted[0]!);
    const toPort = pick(b, wanted, "in", false) ?? pending(b, "in", wanted[0]!);
    // Ya hay un cable manual entre esos mismos puertos: manda el manual.
    if (manual.some((w) => w.from.deviceId === a.deviceId && w.to.deviceId === b.deviceId && w.from.portId === fromPort && w.to.portId === toPort)) continue;
    taken.add(`${a.deviceId}#${a.unit}#${fromPort}`);
    taken.add(`${b.deviceId}#${b.unit}#${toPort}`);
    const signal = (model.ports[a.deviceId] ?? []).find((p) => p.id === fromPort)?.signal ?? wanted[0]!;
    wires.push({ id: `auto-${++n}-${link.id}`, from: { ...a, portId: fromPort }, to: { ...b, portId: toPort }, signal, cableProductId: null, label: null, points: squarePoints(planPoints(link.route), placed(a), placed(b)), lengthOverrideM: null, origin: "auto" });
  }
  const used = new Set(wires.flatMap((w) => [w.from.deviceId, w.to.deviceId]));
  const keepVirtual = Object.fromEntries(Object.entries({ ...current.virtual, ...virtual }).filter(([id]) => used.has(id)));
  return { ...current, ports, ...(Object.keys(keepVirtual).length ? { virtual: keepVirtual } : {}), wires: numberLabels(wires) };
}

/**
 * Equipos sin ficha validada: puertos genéricos según los enlaces que les
 * asignó el motor (uno por cable), para poder cablearlos igual. Quedan como
 * puertos cargados a mano, editables, hasta que se valide la ficha.
 */
function placeholderPorts(plan: CablingPlan, model: WiringModel, virtualIds: Set<string>): Record<string, WirePort[]> {
  const need = new Map<string, Map<string, number>>();
  const add = (nodeId: string, signal: Signal, direction: "in" | "out") => {
    const end = nodeEnd(nodeId);
    // Las puntas virtuales (mesa, switch a sumar, rack central) siempre llevan los puertos que pide el plan.
    if (!end || signal === "wireless" || (model.ports[end.deviceId]?.length && !virtualIds.has(end.deviceId))) return;
    const io = ENGINE_TO_IO[signal][0];
    if (!io) return;
    const per = need.get(end.deviceId) ?? new Map<string, number>();
    const key = `${direction}|${io}|${end.unit}`;
    per.set(key, (per.get(key) ?? 0) + 1);
    need.set(end.deviceId, per);
  };
  for (const link of plan.links) {
    add(link.from, link.signal, "out");
    add(link.to, link.signal, "in");
  }
  const out: Record<string, WirePort[]> = {};
  for (const [deviceId, per] of need) {
    // Por unidad pueden variar; alcanza con el máximo de cada señal y sentido.
    const max = new Map<string, number>();
    for (const [key, n] of per) {
      const [direction, io] = key.split("|");
      const k = `${direction}|${io}`;
      max.set(k, Math.max(max.get(k) ?? 0, n));
    }
    out[deviceId] = portsFromSignals([...max].map(([k, count]) => {
      const [direction, signal] = k.split("|") as ["in" | "out", IoSignal];
      return { signal, direction, count };
    }));
  }
  return out;
}

/** Sin quiebres y con puntas desalineadas: un quiebre a escuadra (como se tiende en obra). */
function squarePoints(points: WirePoint[], a: { x: number; z: number } | undefined, b: { x: number; z: number } | undefined): WirePoint[] {
  if (points.length || !a || !b) return points;
  if (Math.abs(a.x - b.x) < 0.05 || Math.abs(a.z - b.z) < 0.05) return points;
  return [{ x: Math.round(b.x * 100) / 100, z: Math.round(a.z * 100) / 100 }];
}

/** Une los puertos de una punta virtual sin repetir ids (los que usan cables guardados quedan). */
function unionPorts(a: WirePort[], b: WirePort[] | undefined): WirePort[] {
  if (!b?.length) return a;
  const ids = new Set(a.map((p) => p.id));
  return [...a, ...b.filter((p) => !ids.has(p.id))];
}

/** Clave de un cable para comparar cableados: equipos de las dos puntas (sin unidad) y familia física. */
export function linkKey(a: string, b: string, signal: string): string {
  return `${[a, b].sort().join("|")}|${physicalFamily(signal)}`;
}

/** Etiquetas de obra correlativas por señal para los cables que no tienen ("HDMI-001"). */
export function numberLabels(wires: Wire[]): Wire[] {
  const count = new Map<string, number>();
  // Las etiquetas ya puestas no se repiten (ej. cables sumados a un cableado guardado).
  const used = new Set(wires.map((w) => w.label).filter((l): l is string => Boolean(l)));
  return wires.map((w) => {
    if (w.label) return w;
    const code = signalFamily(w.signal).toUpperCase().replace(/[^A-Z0-9]/g, "");
    let k = count.get(code) ?? 0;
    let label = "";
    do label = `${code}-${String(++k).padStart(3, "0")}`;
    while (used.has(label));
    count.set(code, k);
    used.add(label);
    return { ...w, label };
  });
}
