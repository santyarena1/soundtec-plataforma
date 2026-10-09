/**
 * Sistema del proyecto contra la base: suma lo que aporta cada ambiente,
 * guarda la configuración (y re-arma los ambientes que pasan a central o a
 * propio) y sugiere los equipos centrales del catálogo.
 */

import { prisma } from "@/lib/prisma";
import type { BriefControl } from "./brief";
import { autoFillProjectSlots } from "./auto-fill";
import { rebuildSceneKeepingProducts } from "./hydrate-scene";
import { assignProductToSlot, getRoomProject, updateRoomProjectScene } from "./project-service";
import {
  CENTRAL_SLOTS,
  centralizedFor,
  checkProjectSystem,
  defaultProjectSystem,
  normalizeProjectSystem,
  roomChannels,
  unitsFor,
  type CentralDevice,
  type CentralRequirement,
  type ProjectFinding,
  type ProjectSystem,
  type RoomLoad,
  type SystemTotals,
} from "./project-system";
import { AMPLIFIER_MATCH } from "./rank-from-db";
import { parseScene, type RoomScene } from "./scene";
import { effectiveSpec, SPEC_PRODUCT_SELECT, type SpecProduct } from "./system-check-db";
import type { DesignRole, MountOption } from "./types";

export type CentralAction = { slotKey: string; productId: string; quantity: number; label: string; imageUrl: string | null; priceUsd: number | null };
export type ResolvedProjectFinding = ProjectFinding & { actions: CentralAction[] };

export type RoomRow = RoomLoad & { templateKey: string; own: boolean; channels: number };

export type HubSystemView = {
  system: ProjectSystem;
  totals: SystemTotals;
  rooms: RoomRow[];
  central: Array<{ slotKey: string; label: string; productId: string | null; productName: string | null; brandName: string | null; imageUrl: string | null; quantity: number; channels: number | null }>;
  findings: ResolvedProjectFinding[];
};

const SUGGESTIONS = 3;
const KIND_TO_PLAN: Record<string, string> = {
  residential: "residencial",
  hotel: "hoteleria",
  videoconference: "corporativo",
  office: "corporativo",
  training: "educacion",
  classroom: "educacion",
  commercial: "comercial",
  lobby: "comercial",
  event: "eventos",
};

/** Configuración guardada del proyecto o la recomendada. */
export function systemOf(hubScene: unknown, category: string, fallbackControl: BriefControl): ProjectSystem {
  const raw = hubScene && typeof hubScene === "object" ? (hubScene as { system?: unknown }).system : undefined;
  return normalizeProjectSystem(raw, defaultProjectSystem(KIND_TO_PLAN[category] ?? category, fallbackControl));
}

const num = (v: unknown) => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Lo que aporta un ambiente: parlantes, zonas, paneles y equipos de red. */
async function roomLoad(roomId: string, system: ProjectSystem): Promise<RoomRow | null> {
  const room = await getRoomProject(roomId);
  if (!room || room.kind === "hub") return null;
  const scene = parseScene(room.sceneJson);
  if (!scene) return null;
  const speakerIds = scene.devices.filter((d) => d.designRole === "speaker" && d.productId).map((d) => d.productId as string);
  const products = speakerIds.length
    ? ((await prisma.product.findMany({ where: { id: { in: speakerIds } }, select: SPEC_PRODUCT_SELECT })) as unknown as SpecProduct[])
    : [];
  const spec = products[0] ? effectiveSpec(products[0]) : null;
  const qty = (role: string) => scene.devices.filter((d) => d.designRole === role).reduce((n, d) => n + Math.max(1, d.quantity || 1), 0);
  const centralized = centralizedFor(system, room.id);
  const load: RoomLoad = {
    id: room.id,
    name: room.name,
    unitCount: Math.max(1, room.unitCount),
    speakers: qty("speaker"),
    zones: scene.brief?.audio?.zones ?? 1,
    speakerSpec: spec ? { nominalOhms: spec.nominalOhms, highImpedance: spec.highImpedance, wattsPerChannel: spec.wattsPerChannel } : null,
    streaming: Boolean(scene.brief?.audio?.streaming),
    touchPoints: qty("touch"),
    networked: qty("display") + qty("camera") + qty("codec"),
    centralized,
  };
  // Canales que este ambiente le pide al equipamiento central (× unidades).
  const channels = centralized.audio ? roomChannels(load, 4) * load.unitCount : 0;
  return { ...load, templateKey: room.templateKey, own: system.ownRooms.includes(room.id), channels };
}

/** Equipos centrales elegidos (dispositivos del proyecto contenedor). */
async function centralDevices(hubId: string) {
  const hub = await getRoomProject(hubId);
  const scene = hub ? parseScene(hub.sceneJson) : null;
  const devices = scene?.devices ?? [];
  const ids = devices.map((d) => d.productId).filter((id): id is string => Boolean(id));
  const products = ids.length ? ((await prisma.product.findMany({ where: { id: { in: ids } }, select: SPEC_PRODUCT_SELECT })) as unknown as SpecProduct[]) : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  return devices.map((d) => {
    const p = d.productId ? byId.get(d.productId) : undefined;
    return {
      device: d,
      product: p ?? null,
      check: { slotKey: d.slotKey, quantity: Math.max(1, d.quantity || 1), spec: p ? effectiveSpec(p) : null, label: d.label } as CentralDevice,
    };
  });
}

const label = (p: SpecProduct) => `${p.brand?.name ? `${p.brand.name} · ` : ""}${p.normalizedName}`;
const price = (p: SpecProduct) => num(p.baseCostUsd);

/** Productos del catálogo que cubren un requerimiento central. */
async function actionsFor(req: CentralRequirement, preferred: string[]): Promise<CentralAction[]> {
  const prefer = (a: SpecProduct, b: SpecProduct) => Number(preferred.includes(b.brand?.slug ?? "")) - Number(preferred.includes(a.brand?.slug ?? ""));
  if (req.kind === "amplifier") {
    const rows = (await prisma.product.findMany({ where: { isActive: true, isDiscontinued: false, OR: AMPLIFIER_MATCH }, select: SPEC_PRODUCT_SELECT, take: 300 })) as unknown as SpecProduct[];
    return rows
      .map((p) => ({ p, spec: effectiveSpec(p) }))
      .filter(({ spec }) => spec.kind === "amplifier" && (spec.channels ?? 0) >= 2 && (!req.networked || spec.networked) && spec.highImpedance === req.highImpedance)
      .map(({ p, spec }) => {
        const units = unitsFor(req.minChannels, spec.channels as number);
        return { p, spec, units, total: (price(p) ?? Number.MAX_SAFE_INTEGER) * units };
      })
      // Lo más simple primero: menos equipos, y entre iguales el más económico.
      .sort((a, b) => prefer(a.p, b.p) || a.units - b.units || a.total - b.total)
      .slice(0, SUGGESTIONS)
      .map(({ p, spec, units }) => ({
        slotKey: req.slotKey,
        productId: p.id,
        quantity: units,
        label: `${units > 1 ? `${units} × ` : ""}${label(p)} (${(spec.channels as number) * units} canales)`,
        imageUrl: p.images[0]?.url ?? null,
        priceUsd: price(p),
      }));
  }
  const terms =
    req.kind === "processor"
      ? req.platform === "crestron-home"
        ? ["CP4-R", "MC4-R", "PRO4", "CP4N"]
        : ["CP4N", "CP4", "MC4", "PRO4", "RMC4"]
      : req.kind === "streamer"
        ? ["NODE", "BluOS", "streamer", "DM-NAX-AMP", "ZSA"]
        : ["switch"];
  const rows = (await prisma.product.findMany({
    where: { isActive: true, isDiscontinued: false, OR: terms.map((t) => ({ normalizedName: { contains: t, mode: "insensitive" as const } })) },
    select: SPEC_PRODUCT_SELECT,
    take: 80,
  })) as unknown as SpecProduct[];
  const wantKind = req.kind === "processor" ? "processor" : req.kind === "switch" ? "switch" : null;
  return rows
    .filter((p) => {
      const spec = effectiveSpec(p);
      if (req.kind === "streamer") return spec.streaming;
      if (req.kind === "processor") return p.brand?.slug === "crestron" && /\b(CP4|MC4|PRO4|RMC4|CP4N|CP4-R|MC4-R)\b/i.test(p.normalizedName);
      return spec.kind === wantKind;
    })
    .sort((a, b) => prefer(a, b) || (price(a) ?? Number.MAX_SAFE_INTEGER) - (price(b) ?? Number.MAX_SAFE_INTEGER))
    .slice(0, SUGGESTIONS)
    .map((p) => ({
      slotKey: req.slotKey,
      productId: p.id,
      quantity: req.kind === "streamer" ? req.sources : 1,
      label: label(p),
      imageUrl: p.images[0]?.url ?? null,
      priceUsd: price(p),
    }));
}

/** Vista completa del sistema del proyecto. */
export async function analyzeHubSystem(hubId: string): Promise<HubSystemView | null> {
  const hub = await getRoomProject(hubId);
  if (!hub || hub.kind !== "hub") return null;
  const firstChild = hub.children[0] ? await getRoomProject(hub.children[0].id) : null;
  const childBrief = firstChild ? parseScene(firstChild.sceneJson)?.brief : null;
  const system = systemOf(hub.sceneJson, hub.category, childBrief?.control ?? (hub.platform === "crestron-home" ? "crestron-home" : "none"));

  const rooms = (await Promise.all(hub.children.map((c) => roomLoad(c.id, system)))).filter((r): r is RoomRow => r != null);
  const central = await centralDevices(hubId);
  const { totals, findings } = checkProjectSystem(system, rooms, central.map((c) => c.check));
  const brands = childBrief?.brands ?? {};
  const resolved = await Promise.all(
    findings.map(async (f): Promise<ResolvedProjectFinding> => {
      if (!f.requirement) return { ...f, actions: [] };
      const preferred = f.requirement.kind === "amplifier" ? (brands.amplification ?? []) : f.requirement.kind === "streamer" ? (brands.streaming ?? []) : ["crestron"];
      return { ...f, actions: await actionsFor(f.requirement, preferred) };
    }),
  );
  return {
    system,
    totals,
    rooms,
    central: central.map(({ device, product, check }) => ({
      slotKey: device.slotKey,
      label: device.label,
      productId: product?.id ?? null,
      productName: product?.normalizedName ?? null,
      brandName: product?.brand?.name ?? null,
      imageUrl: product?.images[0]?.url ?? null,
      quantity: check.quantity,
      channels: check.spec?.channels ?? null,
    })),
    findings: resolved,
  };
}

/** Re-arma un ambiente cuando cambia lo que le resuelve el equipamiento central. */
async function applyCentralizedToRoom(roomId: string, centralized: { audio: boolean; control: boolean }) {
  const room = await getRoomProject(roomId);
  if (!room) return;
  const scene = parseScene(room.sceneJson);
  if (!scene?.brief) return;
  const prev = scene.brief.centralized;
  if (prev && prev.audio === centralized.audio && prev.control === centralized.control) return;
  let next: RoomScene;
  try {
    next = rebuildSceneKeepingProducts({ ...scene, brief: { ...scene.brief, centralized } }, room.templateKey);
  } catch {
    return;
  }
  // Los equipos que ya no van en el ambiente (su amplificador / procesador) salen también de la cotización.
  const keep = new Set(next.slots.map((s) => s.key));
  await prisma.roomProjectDevice.deleteMany({ where: { roomProjectId: roomId, slotKey: { notIn: [...keep] } } });
  await updateRoomProjectScene(roomId, next);
  // Si vuelve a tener equipos propios, se eligen solos.
  if (!centralized.audio || !centralized.control) await autoFillProjectSlots(roomId).catch(() => undefined);
}

/** Guarda la configuración y la aplica a cada ambiente. */
export async function saveHubSystem(hubId: string, raw: unknown): Promise<HubSystemView | null> {
  const hub = await getRoomProject(hubId);
  if (!hub || hub.kind !== "hub") return null;
  const current = systemOf(hub.sceneJson, hub.category, "none");
  const system = normalizeProjectSystem(raw, current);
  const scene = (hub.sceneJson && typeof hub.sceneJson === "object" ? hub.sceneJson : {}) as Record<string, unknown>;
  await prisma.roomProject.update({ where: { id: hubId }, data: { sceneJson: { ...scene, system } as never } });
  for (const child of hub.children) await applyCentralizedToRoom(child.id, centralizedFor(system, child.id));
  return analyzeHubSystem(hubId);
}

const CENTRAL_ROLE: Record<string, DesignRole> = {
  [CENTRAL_SLOTS.amplifier]: "processor",
  [CENTRAL_SLOTS.processor]: "processor",
  [CENTRAL_SLOTS.streamer]: "processor",
  [CENTRAL_SLOTS.switch]: "other",
};
const CENTRAL_LABEL: Record<string, string> = {
  [CENTRAL_SLOTS.amplifier]: "Amplificación central",
  [CENTRAL_SLOTS.processor]: "Procesador de control",
  [CENTRAL_SLOTS.streamer]: "Streaming",
  [CENTRAL_SLOTS.switch]: "Switch de red",
};

/** Pone (o cambia) un equipo central del proyecto. */
export async function setCentralDevice(hubId: string, slotKey: string, productId: string, quantity: number) {
  const hub = await getRoomProject(hubId);
  if (!hub || hub.kind !== "hub") throw new Error("Proyecto no encontrado");
  if (!Object.values(CENTRAL_SLOTS).includes(slotKey as never)) throw new Error("Equipo central inválido");
  const scene = parseScene(hub.sceneJson);
  if (!scene) throw new Error("Escena inválida");
  const qty = Math.max(1, Math.min(48, Math.round(quantity)));
  if (!scene.slots.some((s) => s.key === slotKey)) {
    const role = CENTRAL_ROLE[slotKey] ?? "other";
    const pose = { x: 0, y: 0.4, z: 0, rotY: 0 };
    const mount: MountOption = "rack";
    scene.slots.push({ key: slotKey, role, label: CENTRAL_LABEL[slotKey] ?? slotKey, required: true, mount, pose, defaultQty: qty });
    scene.devices.push({ id: `slot-${slotKey}`, slotKey, productId: null, designRole: role, label: CENTRAL_LABEL[slotKey] ?? slotKey, quantity: qty, pose, coverage: null });
    await updateRoomProjectScene(hubId, scene);
  }
  await assignProductToSlot({ projectId: hubId, slotKey, productId, quantity: qty });
  return analyzeHubSystem(hubId);
}

/** Saca un equipo central. */
export async function removeCentralDevice(hubId: string, slotKey: string) {
  const hub = await getRoomProject(hubId);
  if (!hub || hub.kind !== "hub") throw new Error("Proyecto no encontrado");
  const scene = parseScene(hub.sceneJson);
  if (!scene) throw new Error("Escena inválida");
  scene.slots = scene.slots.filter((s) => s.key !== slotKey);
  scene.devices = scene.devices.filter((d) => d.slotKey !== slotKey);
  await prisma.roomProjectDevice.deleteMany({ where: { roomProjectId: hubId, slotKey } });
  await updateRoomProjectScene(hubId, scene);
  return analyzeHubSystem(hubId);
}
