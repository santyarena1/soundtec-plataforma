/**
 * Plano técnico del proyecto completo (varios ambientes como una unidad):
 * todos los equipos de cada ambiente y del rack central, todos los cables
 * de puerto a puerto, la planilla de cables y los materiales totales.
 */

import { prisma } from "@/lib/prisma";
import { cablingProfile } from "./cabling-db";
import { getRoomProject } from "./project-service";
import { parseScene } from "./scene";
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
export type ProjectTechnical = {
  model: WiringModel;
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

  for (const child of hub.children) {
    const space = await getRoomProject(child.id);
    const scene = space ? parseScene(space.sceneJson) : null;
    if (!space || !scene) continue;
    const profile = await cablingProfile(space.id);
    const m = buildWiringModel(scene, profile);
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
    rooms,
    schedule,
    equipment,
    materials: [...mats.values()].sort((a, b) => b.meters - a.meters),
    connectors: [...conns].map(([name, quantity]) => ({ name, quantity })),
  };
}
