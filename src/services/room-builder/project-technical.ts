/**
 * Plano técnico del proyecto completo (varios ambientes como una unidad):
 * todos los equipos de cada ambiente y del rack central, todos los cables
 * de puerto a puerto, la planilla de cables y los materiales totales.
 */

import { prisma } from "@/lib/prisma";
import { cablingProfile } from "./cabling-db";
import type { CableLink } from "./cabling";
import { cablingForScene } from "./cabling-scene";

import { getRoomProject } from "./project-service";
import { parseScene, type ProjectTechnicalSettings } from "./scene";
import { centralExit } from "./cabling-scene";
import { buildWiringModel, type PlacedDevice, type WiringModel } from "./wiring/model";
import { WIRE_SIGNAL_STYLE, type Wire, type WirePort } from "./wiring/types";

const CENTRAL_PREFIX = "central:";

export type ScheduleRow = {
  room: string;
  label: string;
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
  signal: string;
  lengthM: number;
  cable: string | null;
};
export type EquipmentRow = { room: string; name: string; brand: string | null; quantity: number; productId: string | null; generic: boolean; missing: string[] };
export type MaterialRow = { signal: string; cables: number; meters: number };
/** Un ambiente en la planta del proyecto: su recuadro en el plano, sus equipos y cables (m de la sala). */
export type FloorRoom = {
  id: string;
  name: string;
  level: string;
  widthM: number;
  depthM: number;
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  exit: { x: number; z: number };
  devices: Array<{ x: number; z: number; short: string; label: string; role: string; cls: string | null }>;
  wires: Array<{ color: string; label: string | null; pts: Array<{ x: number; z: number }> }>;
  /** Cables que salen hacia el rack central, por tipo. */
  trunk: Record<string, number>;
  /** Metros de cable del ambiente al rack. */
  trunkMeters: number;
  /** Posición guardada en la planta esquemática (px). */
  pos: { x: number; y: number } | null;
};
export type ProjectFloor = {
  image: { url: string; widthPx: number; heightPx: number } | null;
  rack: { u: number; v: number } | null;
  rooms: FloorRoom[];
};
export type ProjectTechnical = {
  model: WiringModel;
  floor: ProjectFloor;
  /** Enlaces inalámbricos (cliente → gateway/receptor) de todos los ambientes. */
  wireless: CableLink[];
  rooms: Array<{ id: string; name: string; wires: number; devices: number }>;
  schedule: ScheduleRow[];
  equipment: EquipmentRow[];
  materials: MaterialRow[];
  connectors: Array<{ name: string; quantity: number }>;
};

/** Código corto del ambiente para las etiquetas de obra ("Living" → "LIV"). */
const roomCode = (name: string) => name.normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "AMB";

/** Conectores a armar en obra por tipo de cable (cables armados de fábrica no suman). */
const FIELD_CONNECTORS: Partial<Record<string, string>> = { lan: "Ficha RJ-45", dante: "Ficha RJ-45", hdbaset: "Ficha RJ-45 blindada (HDBaseT)", rs232: "Bornera Phoenix / DB9", "analog-audio": "Conector Phoenix / XLR", mic: "Conector XLR / Phoenix" };

export async function projectTechnical(hubId: string): Promise<ProjectTechnical> {
  const hub = await getRoomProject(hubId);
  if (!hub || hub.kind !== "hub") throw new Error("Proyecto no encontrado");

  const devices: PlacedDevice[] = [];
  const ports: Record<string, WirePort[]> = {};
  const wires: Array<Wire & { lengthM: number }> = [];
  const schedule: ScheduleRow[] = [];
  const equipment: EquipmentRow[] = [];
  const rooms: ProjectTechnical["rooms"] = [];
  const seenCentral = new Set<string>();
  const cableIds = new Set<string>();
  const wireless: CableLink[] = [];
  const hubSceneRaw = (hub.sceneJson && typeof hub.sceneJson === "object" ? hub.sceneJson : {}) as Record<string, unknown>;
  const settings = (hubSceneRaw.technical ?? {}) as ProjectTechnicalSettings;
  const planRooms = Array.isArray(hubSceneRaw.planRooms) ? (hubSceneRaw.planRooms as Array<{ projectId: string; box: FloorRoom["box"] }>) : [];
  const planImage = (hubSceneRaw.planImage ?? null) as ProjectFloor["image"];
  const floorRooms: FloorRoom[] = [];

  for (const child of hub.children) {
    const space = await getRoomProject(child.id);
    const scene = space ? parseScene(space.sceneJson) : null;
    if (!space || !scene) continue;
    const profile = await cablingProfile(space.id);
    const m = buildWiringModel(scene, profile);
    if (profile) {
      const nodeKey = (id: string) => (id.startsWith(CENTRAL_PREFIX) ? id : `${space.id}:${id}`);
      for (const l of cablingForScene(scene, space.category, profile).links.filter((x) => x.signal === "wireless")) wireless.push({ ...l, id: `${space.id}:${l.id}`, from: nodeKey(l.from), to: nodeKey(l.to) });
    }
    const key = (deviceId: string) => (deviceId.startsWith(CENTRAL_PREFIX) ? deviceId : `${space.id}:${deviceId}`);
    const code = roomCode(space.name);

    for (const d of m.devices) {
      const k = key(d.deviceId);
      if (d.remote) {
        if (seenCentral.has(`${k}#${d.unit}`)) continue;
        seenCentral.add(`${k}#${d.unit}`);
        devices.push({ ...d, deviceId: k });
      } else devices.push({ ...d, deviceId: k, label: `${space.name} · ${d.label}` });
    }
    for (const [id, list] of Object.entries(m.ports)) ports[key(id)] = list;

    const byDev = new Map(m.devices.map((d) => [`${d.deviceId}#${d.unit}`, d]));
    const portLabel = (deviceId: string, portId: string) => m.ports[deviceId]?.find((p) => p.id === portId)?.label ?? portId;
    for (const w of m.wires) {
      const label = w.label ? `${code}-${w.label}` : null;
      wires.push({ ...w, id: `${space.id}:${w.id}`, label, from: { ...w.from, deviceId: key(w.from.deviceId) }, to: { ...w.to, deviceId: key(w.to.deviceId) } });
      if (w.cableProductId) cableIds.add(w.cableProductId);
      schedule.push({
        room: space.name,
        label: label ?? "",
        from: byDev.get(`${w.from.deviceId}#${w.from.unit}`)?.short ?? w.from.deviceId,
        fromPort: portLabel(w.from.deviceId, w.from.portId),
        to: byDev.get(`${w.to.deviceId}#${w.to.unit}`)?.short ?? w.to.deviceId,
        toPort: portLabel(w.to.deviceId, w.to.portId),
        signal: WIRE_SIGNAL_STYLE[w.signal].label,
        lengthM: Math.round(w.lengthM * 10) / 10,
        cable: w.cableProductId,
      });
    }

    for (const d of scene.devices) {
      if (!d.productId && !d.generic) continue;
      const missing = d.generic ? [d.generic.priceUsd == null ? "precio" : "", d.generic.description ? "" : "descripción"].filter(Boolean) : [];
      equipment.push({ room: space.name, name: d.generic?.name ?? d.productName ?? d.label, brand: d.brandName ?? null, quantity: Math.max(1, d.quantity || 1) * Math.max(1, space.unitCount), productId: d.productId, generic: Boolean(d.generic), missing });
    }
    rooms.push({ id: space.id, name: space.name, wires: m.wires.length, devices: m.devices.filter((d) => !d.remote).length });
    // Planta: equipos y recorridos de la sala, y la troncal que va al rack.
    const pos = new Map(m.devices.map((d) => [`${d.deviceId}#${d.unit}`, d]));
    const trunk: Record<string, number> = {};
    let trunkMeters = 0;
    const exit = centralExit(scene);
    floorRooms.push({
      id: space.id,
      name: space.name,
      level: settings.levels?.[space.id] ?? "Planta baja",
      widthM: scene.widthM,
      depthM: scene.depthM,
      box: planRooms.find((r) => r.projectId === space.id)?.box ?? null,
      exit,
      devices: m.devices.filter((d) => !d.remote).map((d) => ({ x: d.x, z: d.z, short: d.short, label: d.label, role: d.role, cls: d.cls ?? null })),
      wires: m.wires.map((w) => {
        const a = pos.get(`${w.from.deviceId}#${w.from.unit}`);
        const b = pos.get(`${w.to.deviceId}#${w.to.unit}`);
        if (a?.remote || b?.remote) {
          trunk[WIRE_SIGNAL_STYLE[w.signal].label] = (trunk[WIRE_SIGNAL_STYLE[w.signal].label] ?? 0) + 1;
          trunkMeters += w.lengthM;
        }
        const ends = [a?.remote ? exit : a, ...w.points, b?.remote ? exit : b].filter((p): p is { x: number; z: number } => Boolean(p));
        return { color: WIRE_SIGNAL_STYLE[w.signal].color, label: w.label, pts: ends.map((p) => ({ x: p.x, z: p.z })) };
      }),
      trunk,
      trunkMeters: Math.round(trunkMeters),
      pos: settings.roomPos?.[space.id] ?? null,
    });
  }

  // Equipamiento central del proyecto (rack).
  const hubScene = parseScene(hub.sceneJson);
  for (const d of hubScene?.devices ?? []) {
    if (!d.productId && !d.generic) continue;
    equipment.push({ room: "Rack central", name: d.generic?.name ?? d.productName ?? d.label, brand: d.brandName ?? null, quantity: Math.max(1, d.quantity || 1), productId: d.productId, generic: Boolean(d.generic), missing: [] });
  }

  // Nombre de los cables del catálogo elegidos a mano.
  if (cableIds.size) {
    const names = new Map((await prisma.product.findMany({ where: { id: { in: [...cableIds] } }, select: { id: true, normalizedName: true } })).map((p) => [p.id, p.normalizedName]));
    for (const r of schedule) if (r.cable) r.cable = names.get(r.cable) ?? r.cable;
  }

  const mats = new Map<string, MaterialRow>();
  const conns = new Map<string, number>();
  for (const w of wires) {
    const label = WIRE_SIGNAL_STYLE[w.signal].label;
    const row = mats.get(label) ?? { signal: label, cables: 0, meters: 0 };
    row.cables++;
    row.meters = Math.round((row.meters + w.lengthM) * 10) / 10;
    mats.set(label, row);
    const c = FIELD_CONNECTORS[w.signal];
    if (c) conns.set(c, (conns.get(c) ?? 0) + 2);
  }

  return {
    model: { devices, ports, wires, issues: [] },
    floor: { image: planImage, rack: settings.rack ?? null, rooms: floorRooms },
    wireless,
    rooms,
    schedule,
    equipment,
    materials: [...mats.values()].sort((a, b) => b.meters - a.meters),
    connectors: [...conns].map(([name, quantity]) => ({ name, quantity })),
  };
}
