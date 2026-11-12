/**
 * Datos de las láminas de una sala, leídos de la base: equipos numerados con
 * el origen de sus puertos, cables con etiqueta y largo, diagrama y avisos.
 * Si la sala tiene cableado manual (plano técnico) se usa ese; si no, la
 * propuesta automática. Cuando hay manual, los cables que el automático
 * propone y el manual no tiene se avisan (no se ocultan). Nunca se inventan
 * conexiones: un equipo sin ficha queda con sus puertos "pendientes".
 */

import { prisma } from "@/lib/prisma";
import type { CablingProfile } from "@/services/room-builder/cabling-db";
import { centralExit } from "@/services/room-builder/cabling-scene";
import { loadRoomCables } from "@/services/room-builder/cable-list-db";
import { getRoomProject } from "@/services/room-builder/project-service";
import type { RoomScene, SceneDevice } from "@/services/room-builder/scene";
import { layoutSceneDevices, sceneDims } from "@/services/room-builder/units";
import type { RoomCable } from "@/services/room-builder/wiring/cable-list";
import { blockKey, layoutDiagram } from "@/services/room-builder/wiring/diagram-layout";
import { wiringOf, type WiringModel } from "@/services/room-builder/wiring/model";
import { floorOf, planFurniture, planWalls } from "@/services/room-builder/wiring/plan-geometry";
import type { TrunkContext } from "@/services/room-builder/wiring/rack-trunk";
import type { WirePort } from "@/services/room-builder/wiring/types";
import { cableTag, type PortsSource, type SheetCable, type SheetDevice, type SheetWarning } from "@/services/room-builder/sheets/sheet-model";
import type { PlanWallInput } from "@/services/room-builder/sheets/plan-sheet-svg";
import { diagramCuts, wiringDiagramSvg } from "@/services/room-builder/sheets/wiring-diagram-svg";

const MOUNT_LABEL: Record<string, string> = { wall: "Pared", ceiling: "Cielorraso", table: "Mesa", rack: "Rack", floor: "Piso" };
const ROLE_LABEL: Record<string, string> = { display: "Pantalla", camera: "Cámara", mic: "Micrófono", speaker: "Parlante", touch: "Panel / teclado", codec: "Codec", processor: "Procesador", other: "Equipo" };

type Pt = { x: number; y: number };

export type RoomSheet = {
  id: string;
  name: string;
  category: string;
  hubName: string | null;
  clientName: string | null;
  dims: { widthM: number; depthM: number; heightM: number };
  /** De dónde salen los cables: plano técnico (manual), propuesta automática o ninguno. */
  source: "manual" | "auto" | "none";
  floor: Pt[];
  walls: PlanWallInput[];
  furniture: Array<{ outline: Pt[] }>;
  exit: { x: number; z: number } | null;
  devices: SheetDevice[];
  cables: SheetCable[];
  /** Diagrama de conexiones en SVG (null sin cables). */
  diagram: SheetDiagram | null;
  warnings: SheetWarning[];
};

/** Diagrama de conexiones en SVG con su tamaño y dónde se lo puede partir sin cortar equipos. */
export type SheetDiagram = { svg: string; width: number; height: number; cuts: number[] };

type ProductInfo ={ name: string; brand: string | null; image: string | null };

async function productInfo(ids: string[]): Promise<Map<string, ProductInfo>> {
  if (!ids.length) return new Map();
  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, normalizedName: true, brand: { select: { name: true } }, images: { where: { isPrimary: true }, select: { url: true }, take: 1 } },
  });
  return new Map(rows.map((p) => [p.id, { name: p.normalizedName, brand: p.brand?.name ?? null, image: p.images[0]?.url ?? null }]));
}

/** Origen de los puertos de un equipo de la sala, como lo lee un integrador. */
function portsSource(device: SceneDevice, profile: CablingProfile | null, override: WirePort[] | undefined): { ports: PortsSource; note: string | null } {
  if (device.generic) return { ports: "generico", note: "Equipo genérico: modelo a definir" };
  if (override?.some((p) => p.source !== "datasheet")) return { ports: "pendiente", note: override.some((p) => p.source === "manual") ? "Puertos cargados a mano" : "Puertos genéricos hasta validar la ficha" };
  const state = profile?.devices[device.id]?.datasheet ?? "missing";
  if (state === "ok" || state === "none") return { ports: "ficha", note: state === "none" ? "Sin conexiones según ficha" : null };
  return { ports: "pendiente", note: state === "review" ? "Ficha a revisar" : "Sin ficha validada" };
}

/** Equipos de la sala numerados en el orden de la escena, con sus unidades en la planta. */
function roomDevices(scene: RoomScene, profile: CablingProfile | null, products: Map<string, ProductInfo>): SheetDevice[] {
  const slots = new Map(scene.slots.map((s) => [s.key, s]));
  const wiring = wiringOf(scene);
  const out: SheetDevice[] = [];
  for (const { device } of layoutSceneDevices(scene.devices, slots, sceneDims(scene))) {
    if (!device.productId && !device.generic) continue;
    const p = device.productId ? products.get(device.productId) : undefined;
    const slot = slots.get(device.slotKey);
    const src = portsSource(device, profile, wiring.ports[device.id]);
    out.push({
      n: out.length + 1,
      deviceId: device.id,
      brand: p?.brand ?? device.brandName ?? "",
      model: device.generic?.name ?? p?.name ?? device.productName ?? device.label,
      role: device.designRole,
      quantity: Math.max(1, device.quantity || 1),
      location: [MOUNT_LABEL[slot?.mount ?? ""] ?? "—", device.label && device.label !== ROLE_LABEL[device.designRole] ? device.label : null].filter(Boolean).join(" · "),
      ports: src.ports,
      portsNote: src.note,
      units: (device.units ?? []).map((u) => ({ x: u.pose.x, z: u.pose.z })),
      remote: false,
      imageUrl: p?.image ?? device.imageUrl ?? null,
      productId: device.productId,
    });
  }
  return out;
}

/** Equipos del rack central que alimentan esta sala (numerados a continuación). */
function centralDevices(ids: string[], profile: CablingProfile | null, products: Map<string, ProductInfo>, start: number, labels: Map<string, string>): SheetDevice[] {
  return ids.map((id, i) => {
    const c = profile?.centralDevices?.find((x) => `central:${x.key}` === id);
    const p = c?.productId ? products.get(c.productId) : undefined;
    const state = c?.datasheet ?? "missing";
    return {
      n: start + i,
      deviceId: id,
      brand: p?.brand ?? "",
      model: p?.name ?? c?.label ?? labels.get(id) ?? id.replace(/^central:/, ""),
      role: "processor",
      quantity: c?.quantity ?? 1,
      location: "Rack central (fuera de la sala)",
      ports: state === "ok" || state === "none" ? "ficha" : "pendiente",
      portsNote: state === "review" ? "Ficha a revisar" : state === "missing" ? "Sin ficha validada" : null,
      units: [],
      remote: true,
      imageUrl: p?.image ?? null,
      productId: c?.productId ?? null,
    };
  });
}

const deviceText = (d: SheetDevice | undefined, fallback: string) => (d ? `${d.remote ? "R" : d.n} · ${d.model}` : fallback);

/**
 * Cables de la lista única del ambiente (wiring/cable-list.ts): los mismos de
 * la cotización y la planilla, con el largo final (troncal al rack incluida).
 */
function sheetCables(cables: RoomCable[], model: WiringModel, devices: SheetDevice[], cableNames: Map<string, string>, prefix: string | null, exit: { x: number; z: number }, proposal: boolean): SheetCable[] {
  const byId = new Map(devices.map((d) => [d.deviceId, d]));
  const placed = new Map(model.devices.map((d) => [blockKey(d.deviceId, d.unit), d]));
  return cables.map((w, i) => {
    const a = placed.get(blockKey(w.from.deviceId, w.from.unit));
    const b = placed.get(blockKey(w.to.deviceId, w.to.unit));
    const end = (p: typeof a) => (p ? (p.remote ? exit : { x: p.x, z: p.z }) : null);
    const pts = [end(a), ...w.points, end(b)].filter((p): p is { x: number; z: number } => Boolean(p));
    const unitSuffix = (deviceId: string, unit: number) => ((byId.get(deviceId)?.units.length ?? 1) > 1 ? ` (${unit + 1})` : "");
    return {
      tag: w.label ? (prefix ? `${prefix}-${w.label}` : w.label) : cableTag(i, prefix),
      fromDevice: byId.has(w.from.deviceId) ? deviceText(byId.get(w.from.deviceId), w.fromName) + unitSuffix(w.from.deviceId, w.from.unit) : w.fromName,
      fromPort: w.fromPort,
      toDevice: byId.has(w.to.deviceId) ? deviceText(byId.get(w.to.deviceId), w.toName) + unitSuffix(w.to.deviceId, w.to.unit) : w.toName,
      toPort: w.toPort,
      signal: w.signalLabel,
      color: w.color,
      cable: w.cableProductId ? (cableNames.get(w.cableProductId) ?? null) : null,
      lengthM: Math.round(w.lengthM * 10) / 10,
      // La propuesta automática todavía no está confirmada en el plano técnico: sus largos son estimados.
      lengthKind: proposal && w.lengthKind === "plan" ? "estimated" : w.lengthKind,
      points: pts.map((p) => ({ x: p.x, z: p.z })),
      note: w.note,
    };
  });
}

/** Láminas de una sala. `tagPrefix` antepone el código del ambiente a las etiquetas (juego del proyecto). */
export async function loadRoomSheet(spaceId: string, opts: { tagPrefix?: string | null; trunkCtx?: TrunkContext | null } = {}): Promise<RoomSheet> {
  const project = await getRoomProject(spaceId);
  if (!project || project.kind === "hub") throw new Error("Ambiente no encontrado");
  const prefix = opts.tagPrefix ?? null;
  // La lista única de cables (la misma de la cotización y la planilla del proyecto).
  const loaded = await loadRoomCables(project, opts.trunkCtx);
  if (!loaded) throw new Error("Escena inválida");
  const { scene, profile, list } = loaded;
  const wiring = wiringOf(scene);
  const manual = list.source === "manual";
  const { model, plan } = list;

  const hub = project.parentId ? await prisma.roomProject.findUnique({ where: { id: project.parentId }, select: { name: true, client: { select: { companyName: true } } } }) : null;
  const centralIds = [...new Set(model.devices.filter((d) => d.remote).map((d) => d.deviceId))];
  const productIds = [
    ...scene.devices.map((d) => d.productId),
    ...(profile?.centralDevices ?? []).map((c) => c.productId),
    ...list.cables.map((w) => w.cableProductId),
  ].filter((id): id is string => Boolean(id));
  const products = await productInfo([...new Set(productIds)]);
  const cableNames = new Map([...products].map(([id, p]) => [id, p.name]));

  const local = roomDevices(scene, profile, products);
  const remoteLabels = new Map(model.devices.filter((d) => d.remote).map((d) => [d.deviceId, d.label]));
  const devices = [...local, ...centralDevices(centralIds, profile, products, local.length + 1, remoteLabels)];
  const exit = centralIds.length ? centralExit(scene) : null;
  const cables = sheetCables(list.cables, model, devices, cableNames, prefix, centralExit(scene), list.source === "auto");

  const warnings: SheetWarning[] = [];
  let diagram: SheetDiagram | null = null;
  const tagOf = new Map(list.cables.map((w, i) => [w.id, cables[i]!.tag]));
  if (cables.length) {
    const numbers = Object.fromEntries(model.devices.map((d) => [blockKey(d.deviceId, d.unit), devices.find((x) => x.deviceId === d.deviceId)?.n ?? 0]));
    diagram = wiringDiagramSvgSafe(model, wiring.diagram ?? {}, numbers, Object.fromEntries(tagOf));
  }
  for (const issue of model.issues) warnings.push({ level: issue.level, text: `${tagOf.get(issue.wireId) ?? "Cable"}: ${issue.text}` });
  if (manual) {
    // Lo que el armado automático propone y el plano técnico no tiene ya viene sumado en la lista,
    // con su aviso por cable ("propuesto por el sistema"): no se oculta ni se omite de la planilla.
  } else if (plan && cables.length) {
    warnings.push({ level: "info", text: "La sala no tiene cableado trazado en el plano técnico: conexiones y largos son la propuesta automática (estimados), a confirmar en el plano técnico." });
    for (const f of plan.findings) if (f.level !== "info") warnings.push({ level: f.level, text: `${f.title}: ${f.detail}` });
  } else {
    warnings.push({ level: "warn", text: "La sala todavía no tiene cableado: falta trazarlo en el plano técnico." });
  }
  for (const d of devices) if (d.ports === "pendiente") warnings.push({ level: "warn", text: `${d.remote ? "R" : d.n} · ${d.model}: puertos pendientes (${(d.portsNote ?? "sin ficha").toLowerCase()}); sus conexiones no están confirmadas por el fabricante.` });
  // Troncal al rack: una sola nota por sala (ya está sumada en cada cable, o falta el dato).
  const trunkNote = list.cables.find((c) => c.remote && c.note)?.note;
  if (trunkNote) warnings.push({ level: list.cables.some((c) => c.remote && c.lengthKind === "estimated") ? "warn" : "info", text: `Cables al rack central: ${trunkNote}` });
  const nodeLabel = new Map(plan?.nodes.map((n) => [n.id, n.label]) ?? []);
  for (const l of plan?.links.filter((x) => x.signal === "wireless") ?? []) warnings.push({ level: "info", text: `Enlace inalámbrico (sin cable): ${nodeLabel.get(l.from) ?? l.fromPort} → ${nodeLabel.get(l.to) ?? l.toPort}${l.protocol ? ` (${l.protocol})` : ""}.` });

  return {
    id: project.id,
    name: project.name,
    category: project.category,
    hubName: hub?.name ?? null,
    clientName: project.client?.companyName ?? hub?.client?.companyName ?? null,
    dims: { widthM: scene.widthM, depthM: scene.depthM, heightM: scene.heightM },
    source: manual ? "manual" : cables.length ? "auto" : "none",
    floor: floorOf(scene),
    walls: planWalls(scene, project.category),
    furniture: planFurniture(scene, project.category).filter((f) => !f.layer).map((f) => ({ outline: f.outline })),
    exit,
    devices,
    cables,
    diagram,
    warnings,
  };
}

/** Diagrama del cableado manual con los números de equipo y las etiquetas de las láminas. */
function wiringDiagramSvgSafe(model: WiringModel, positions: Record<string, { x: number; y: number }>, numbers: Record<string, number>, tags: Record<string, string>): SheetDiagram | null {
  if (!model.devices.length) return null;
  const layout = layoutDiagram(model, positions);
  return { svg: wiringDiagramSvg(layout, { numbers, tags }), width: layout.width, height: layout.height, cuts: diagramCuts(layout.blocks) };
}
