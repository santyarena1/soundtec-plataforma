/**
 * Perfil de cableado de un ambiente contra la base: los puertos de cada equipo
 * (según su producto real) y si el audio o el control van a un rack central.
 * El cableado en sí se calcula en el navegador con las posiciones de la sala.
 */

import { prisma } from "@/lib/prisma";
import { devicePorts, deviceClass, type DeviceClass, type DevicePorts } from "./device-ports";
import type { IoProfileData } from "./io-profile/types";
import { getRoomProject } from "./project-service";
import { centralizedFor, defaultProjectSystem, normalizeProjectSystem } from "./project-system";
import { parseScene } from "./scene";
import { effectiveSpec, SPEC_PRODUCT_SELECT, type SpecProduct } from "./system-check-db";

/** Estado de la ficha del equipo: lista para cablear, a revisar o sin leer. */
export type DatasheetState = "ok" | "review" | "missing";

export type DeviceCablingProfile = {
  cls: DeviceClass;
  ports: DevicePorts | null;
  productId: string | null;
  label: string;
  datasheet: DatasheetState;
  /** datasheet | specs | page | secondary: de dónde salieron los puertos. */
  sourceKind: string | null;
  sources: string[];
};

export type CablingProfile = {
  /** Por equipo de la escena (id del equipo). */
  devices: Record<string, DeviceCablingProfile>;
  /** Equipamiento central del proyecto (fuera de la sala), si corresponde. */
  central: { label: string } | null;
};

export async function cablingProfile(projectId: string): Promise<CablingProfile | null> {
  const project = await getRoomProject(projectId);
  if (!project || project.kind === "hub") return null;
  const scene = parseScene(project.sceneJson);
  if (!scene) return null;

  const productIds = [...new Set(scene.devices.map((d) => d.productId).filter((id): id is string => Boolean(id)))];
  const products = (await prisma.product.findMany({ where: { id: { in: productIds } }, select: SPEC_PRODUCT_SELECT })) as unknown as SpecProduct[];
  const byId = new Map(products.map((p) => [p.id, p]));
  const ioRows = await prisma.productIoProfile.findMany({ where: { productId: { in: productIds } }, select: { productId: true, ports: true, capabilities: true, status: true, sourceUrls: true, source: true } });
  const ioById = new Map(ioRows.map((r) => [r.productId, r]));

  const devices: Record<string, DeviceCablingProfile> = {};
  for (const d of scene.devices) {
    const p = d.productId ? byId.get(d.productId) : undefined;
    const spec = p ? effectiveSpec(p) : null;
    const input = { role: d.designRole, slotKey: d.slotKey, name: p?.normalizedName ?? d.productName ?? d.label, spec };
    const io = d.productId ? ioById.get(d.productId) : undefined;
    // Solo cuenta la ficha validada (todas las citas verificadas o aprobada a mano).
    const valid = io && (io.status === "auto" || io.status === "approved");
    const ports = valid ? devicePorts({ ports: io.ports as unknown as IoProfileData["ports"], capabilities: io.capabilities as unknown as IoProfileData["capabilities"] }) : null;
    devices[d.id] = {
      cls: deviceClass(input),
      ports,
      productId: d.productId,
      label: p ? [p.brand?.name, p.normalizedName].filter(Boolean).join(" ") : (d.productName ?? d.label),
      sourceKind: io?.source ?? null,
      datasheet: ports ? "ok" : io && io.status === "needs_review" ? "review" : "missing",
      sources: io?.sourceUrls ?? [],
    };
  }

  let central: CablingProfile["central"] = null;
  if (project.parentId) {
    const hub = await prisma.roomProject.findUnique({ where: { id: project.parentId }, select: { sceneJson: true, category: true } });
    const raw = hub?.sceneJson && typeof hub.sceneJson === "object" ? (hub.sceneJson as Record<string, unknown>).system : null;
    if (raw) {
      const system = normalizeProjectSystem(raw, defaultProjectSystem("", "none"));
      const c = centralizedFor(system, project.id);
      const hasLocal = Object.values(devices).some((d) => d.cls === "amp" || d.cls === "dsp" || d.cls === "control");
      if ((c.audio || c.control) && !hasLocal) central = { label: system.location === "closet" ? "Closet técnico (equipamiento central)" : "Rack central del proyecto" };
    }
  }
  return { devices, central };
}
