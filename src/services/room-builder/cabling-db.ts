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
  centralDevices?: Array<DeviceCablingProfile & { key: string; quantity: number }>;
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
      // Solo un equipo real de la sala (no un genérico ni un gateway) reemplaza al rack central.
      const real = Object.values(devices).filter((d) => d.sourceKind !== "generic" && d.productId);
      const hasLocal = real.some((d) => d.cls === "amp" || d.cls === "dsp" || (d.cls === "control" && !/gateway|gw|bridge|antena|antenna/i.test(d.label)));
      if ((c.audio || c.control) && !hasLocal) {
        central = { label: system.location === "closet" ? "Closet técnico (equipamiento central)" : "Rack central del proyecto" };
        // Lo que ya está elegido en el rack central entra al diagrama como equipo real.
        const hubScene = parseScene(hub?.sceneJson);
        const hubDevices = (hubScene?.devices ?? []).filter((d) => d.productId && ((c.audio && /amp|streamer/.test(d.slotKey)) || (c.control && /processor|switch/.test(d.slotKey)) || /switch/.test(d.slotKey)));
        const profiles = await deviceProfiles(hubDevices);
        centralDevices = hubDevices.map((d) => ({ ...profiles[d.id]!, key: d.slotKey, quantity: Math.max(1, d.quantity || 1) }));
      }
    }
  }
  return { devices, central, centralDevices };
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
