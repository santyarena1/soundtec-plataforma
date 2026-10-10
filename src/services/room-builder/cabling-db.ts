/**
 * Perfil de cableado de un ambiente contra la base: los puertos de cada equipo
 * (según su producto real) y si el audio o el control van a un rack central.
 * El cableado en sí se calcula en el navegador con las posiciones de la sala.
 */

import { prisma } from "@/lib/prisma";
import { genericByKey } from "./generic/library";
import { devicePorts, deviceClass, type DeviceClass, type DevicePorts } from "./device-ports";
import type { IoProfileData } from "./io-profile/types";
import { getRoomProject } from "./project-service";
import { centralizedFor, defaultProjectSystem, normalizeProjectSystem } from "./project-system";
import { parseScene, type RoomScene } from "./scene";
import { effectiveSpec, SPEC_PRODUCT_SELECT, type SpecProduct } from "./system-check-db";

/** Estado de la ficha del equipo: lista para cablear, a revisar o sin leer. */
export type DatasheetState = "ok" | "none" | "review" | "missing";

export type DeviceCablingProfile = {
  cls: DeviceClass;
  ports: DevicePorts | null;
  productId: string | null;
  label: string;
  datasheet: DatasheetState;
  /** datasheet | specs | page | secondary: de dónde salieron los puertos. */
  sourceKind: string | null;
  sources: string[];
  /** Puertos de la ficha tal cual (validada), para separarlos en puertos individuales en el plano técnico. */
  ioPorts?: IoProfileData["ports"] | null;
};

export type CablingProfile = {
  /** Por equipo de la escena (id del equipo). */
  devices: Record<string, DeviceCablingProfile>;
  /** Equipamiento central del proyecto (fuera de la sala), si corresponde. */
  central: { label: string } | null;
  /** Equipos reales del rack central (amplificador, procesador, streaming…) con sus puertos de ficha. */
  centralDevices?: Array<DeviceCablingProfile & { key: string; quantity: number; /** Canales de parlante que le tocan a esta sala, por unidad. */ grants?: Array<{ unit: number; channels: number[] }> }>;
};

export async function cablingProfile(projectId: string): Promise<CablingProfile | null> {
  const project = await getRoomProject(projectId);
  if (!project || project.kind === "hub") return null;
  const scene = parseScene(project.sceneJson);
  if (!scene) return null;

  const devices: Record<string, DeviceCablingProfile> = {};
  for (const [id, info] of Object.entries(await deviceProfiles(scene.devices))) devices[id] = info;

  let central: CablingProfile["central"] = null;
  let centralDevices: CablingProfile["centralDevices"] = [];
  if (project.parentId) {
    const hub = await prisma.roomProject.findUnique({ where: { id: project.parentId }, select: { sceneJson: true, category: true } });
    const raw = hub?.sceneJson && typeof hub.sceneJson === "object" ? (hub.sceneJson as Record<string, unknown>).system : null;
    if (raw) {
      const system = normalizeProjectSystem(raw, defaultProjectSystem("", "none"));
      const c = centralizedFor(system, project.id);
      // Audio y control se centralizan por separado: un equipo real de la sala reemplaza solo lo suyo
      // (un amplificador local no le saca el control central, ni un procesador local la amplificación).
      const real = Object.values(devices).filter((d) => d.sourceKind !== "generic" && d.productId);
      const localAudio = real.some((d) => d.cls === "amp" || d.cls === "dsp");
      const localControl = real.some((d) => d.cls === "control" && !/gateway|\bgw|gwex|bridge|antena|antenna/i.test(d.label));
      const audioCentral = c.audio && !localAudio;
      const controlCentral = c.control && !localControl;
      if (audioCentral || controlCentral) {
        central = { label: system.location === "closet" ? "Closet técnico (equipamiento central)" : "Rack central del proyecto" };
        // Lo que ya está elegido en el rack central entra al diagrama como equipo real.
        const hubScene = parseScene(hub?.sceneJson);
        const hubDevices = (hubScene?.devices ?? []).filter((d) => d.productId && ((audioCentral && /amp|streamer/.test(d.slotKey)) || (controlCentral && /processor/.test(d.slotKey)) || /switch/.test(d.slotKey)));
        const profiles = await deviceProfiles(hubDevices);
        centralDevices = hubDevices.map((d) => ({ ...profiles[d.id]!, key: d.slotKey, quantity: Math.max(1, d.quantity || 1) }));
        // Los amplificadores del rack se comparten: cada ambiente recibe sus propios canales.
        if (audioCentral && project.parentId) {
          const grants = await centralChannelGrants(project.parentId, centralDevices);
          const mine = grants.get(project.id) ?? [];
          centralDevices = centralDevices.map((c) => (c.cls === "amp" ? { ...c, grants: mine.filter((g) => g.key === c.key).map((g) => ({ unit: g.unit, channels: g.channels })) } : c));
        }
      }
    }
  }
  return { devices, central, centralDevices };
}

/**
 * Capacidad del rack central: si los canales de los amplificadores centrales no alcanzan para
 * los parlantes de todos los ambientes, suma unidades del mismo amplificador al rack.
 * Devuelve cuántas unidades agregó.
 */
export async function ensureCentralAmpCapacity(hubId: string): Promise<{ added: number; label: string | null }> {
  const hub = await getRoomProject(hubId);
  const hubScene = hub ? parseScene(hub.sceneJson) : null;
  if (!hub || !hubScene) return { added: 0, label: null };
  const amps = hubScene.devices.filter((d) => d.productId && /amp|streamer/.test(d.slotKey));
  if (!amps.length) return { added: 0, label: null };
  const profiles = await deviceProfiles(amps);
  const ampDevs = amps.filter((d) => profiles[d.id]?.cls === "amp");
  if (!ampDevs.length) return { added: 0, label: null };
  const outsOf = (id: string) => (profiles[id]?.ioPorts ?? []).filter((p) => p.signal === "speaker" && p.direction !== "in").reduce((a, p) => a + p.count, 0);
  const have = ampDevs.reduce((a, d) => a + outsOf(d.id) * Math.max(1, d.quantity || 1), 0);
  let need = 0;
  for (const child of hub.children) {
    const space = await getRoomProject(child.id);
    const scene = space ? parseScene(space.sceneJson) : null;
    if (!scene) continue;
    const p = await deviceProfiles(scene.devices.filter((d) => d.productId || d.generic));
    if (Object.values(p).some((x) => x.cls === "amp" && x.productId && x.sourceKind !== "generic")) continue;
    const passive = scene.devices.filter((d) => {
      const x = p[d.id];
      return x && (x.cls === "speaker" || x.cls === "subwoofer") && (x.ports?.inputs ?? []).some((g) => g.signal === "speaker");
    });
    need += Math.ceil(passive.reduce((a, d) => a + Math.max(1, d.quantity || 1), 0) / SPEAKERS_PER_CHANNEL);
  }
  if (need <= have) return { added: 0, label: null };
  // Se suman unidades del amplificador central principal (el de más canales).
  const main = [...ampDevs].sort((a, b) => outsOf(b.id) - outsOf(a.id))[0]!;
  const per = Math.max(1, outsOf(main.id));
  const units = Math.ceil((need - have) / per);
  const { setCentralDevice } = await import("./project-system-db");
  await setCentralDevice(hubId, main.slotKey, main.productId!, Math.max(1, main.quantity || 1) + units);
  return { added: units, label: profiles[main.id]?.label ?? null };
}

/** Canales de parlante que pide un ambiente: los pasivos de a 2 por canal (baja impedancia). */
const SPEAKERS_PER_CHANNEL = 2;

/**
 * Reparto de los canales de los amplificadores del rack central entre los ambientes del
 * proyecto, en el orden de los ambientes: cada uno recibe canales propios (unidad + canal).
 */
async function centralChannelGrants(hubId: string, central: Array<DeviceCablingProfile & { key: string; quantity: number }>): Promise<Map<string, Array<{ key: string; unit: number; channels: number[] }>>> {
  const hub = await getRoomProject(hubId);
  const pool: Array<{ key: string; unit: number; free: number[] }> = [];
  for (const c of central.filter((x) => x.cls === "amp")) {
    const outs = (c.ioPorts ?? []).filter((p) => p.signal === "speaker" && (p.direction === "out" || p.direction === "bidir")).reduce((a, p) => a + p.count, 0);
    for (let u = 0; u < c.quantity; u++) pool.push({ key: c.key, unit: u, free: Array.from({ length: outs }, (_, k) => k + 1) });
  }
  const grants = new Map<string, Array<{ key: string; unit: number; channels: number[] }>>();
  for (const child of hub?.children ?? []) {
    const space = await getRoomProject(child.id);
    const scene = space ? parseScene(space.sceneJson) : null;
    if (!scene) continue;
    const profiles = await deviceProfiles(scene.devices.filter((d) => d.productId || d.generic));
    // Un ambiente con amplificación propia no toma canales del rack.
    if (Object.values(profiles).some((p) => p.cls === "amp" && p.productId && p.sourceKind !== "generic")) continue;
    const passive = scene.devices.filter((d) => {
      const p = profiles[d.id];
      return p && (p.cls === "speaker" || p.cls === "subwoofer") && (p.ports?.inputs ?? []).some((g) => g.signal === "speaker");
    });
    let need = Math.ceil(passive.reduce((a, d) => a + Math.max(1, d.quantity || 1), 0) / SPEAKERS_PER_CHANNEL);
    const mine: Array<{ key: string; unit: number; channels: number[] }> = [];
    for (const slot of pool) {
      if (need <= 0) break;
      const take = slot.free.splice(0, need);
      if (!take.length) continue;
      need -= take.length;
      mine.push({ key: slot.key, unit: slot.unit, channels: take });
    }
    grants.set(child.id, mine);
  }
  return grants;
}

/** Perfil de cableado de cada equipo según su producto y su ficha validada. */
async function deviceProfiles(list: RoomScene["devices"]): Promise<Record<string, DeviceCablingProfile>> {
  const productIds = [...new Set(list.map((d) => d.productId).filter((id): id is string => Boolean(id)))];
  const products = (await prisma.product.findMany({ where: { id: { in: productIds } }, select: SPEC_PRODUCT_SELECT })) as unknown as SpecProduct[];
  const byId = new Map(products.map((p) => [p.id, p]));
  const ioRows = await prisma.productIoProfile.findMany({ where: { productId: { in: productIds } }, select: { productId: true, ports: true, capabilities: true, status: true, sourceUrls: true, source: true } });
  const ioById = new Map(ioRows.map((r) => [r.productId, r]));

  const devices: Record<string, DeviceCablingProfile> = {};
  for (const d of list) {
    // Equipo genérico: sus conexiones salen de la plantilla, no de una ficha.
    const template = d.generic ? genericByKey(d.generic.key) : null;
    if (d.generic && template) {
      devices[d.id] = {
        cls: template.cls,
        ports: devicePorts({ ports: template.ports, capabilities: template.capabilities }) ?? { inputs: [], outputs: [], network: 0 },
        productId: null,
        label: d.generic.name,
        sourceKind: "generic",
        datasheet: "ok",
        sources: [],
        ioPorts: template.ports,
      };
      continue;
    }
    const p = d.productId ? byId.get(d.productId) : undefined;
    const spec = p ? effectiveSpec(p) : null;
    const input = { role: d.designRole, slotKey: d.slotKey, name: p?.normalizedName ?? d.productName ?? d.label, spec };
    const io = d.productId ? ioById.get(d.productId) : undefined;
    // Solo cuenta la ficha validada (todas las citas verificadas o aprobada a mano).
    const valid = io && (io.status === "auto" || io.status === "approved");
    // Sin conexiones (accesorio): no se cablea y tampoco falta nada.
    const none = io?.status === "not_applicable";
    const ports = none ? { inputs: [], outputs: [], network: 0 } : valid ? devicePorts({ ports: io.ports as unknown as IoProfileData["ports"], capabilities: io.capabilities as unknown as IoProfileData["capabilities"] }) : null;
    devices[d.id] = {
      cls: deviceClass(input),
      ports,
      productId: d.productId,
      label: p ? [p.brand?.name, p.normalizedName].filter(Boolean).join(" ") : (d.productName ?? d.label),
      sourceKind: io?.source ?? null,
      datasheet: none ? "none" : ports ? "ok" : io && io.status === "needs_review" ? "review" : "missing",
      sources: io?.sourceUrls ?? [],
      ioPorts: valid ? (io.ports as unknown as IoProfileData["ports"]) : null,
    };
  }

  return devices;
}
