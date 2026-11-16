/**
 * Datos del rack contra la base: para cada equipo de rack de un ambiente (o
 * del rack central del proyecto), su alto en U, medidas, peso, consumo de la
 * ficha, PoE y potencia de salida (amplificadores). La elevación en sí la arma
 * rack-elevation.ts (lógica pura), así el navegador reordena sin volver al servidor.
 */

import { prisma } from "@/lib/prisma";
import { deviceClass, type DeviceClass } from "../device-ports";
import { genericByKey } from "../generic/library";
import type { IoCapabilities, IoPort } from "../io-profile/types";
import { getRoomProject } from "../project-service";
import { parseScene, productSizeCm, type SceneDevice } from "../scene";
import { effectiveSpec, SPEC_PRODUCT_SELECT, type SpecProduct } from "../system-check-db";
import { isPoeSwitch, NOT_IN_RACK, type PoeLoad, type RackInput, type RackItemInput } from "./rack-elevation";
import { devicePower, poeClassWatts, type SpecRow } from "./rack-power";

/** Montaje por rol cuando el equipo no tiene lugar de la tipología (mismo criterio que cabling-scene). */
const MOUNT_BY_ROLE: Record<string, string> = { display: "wall", camera: "wall", mic: "ceiling", speaker: "ceiling", touch: "table", codec: "rack", processor: "rack" };

type Fact = {
  name: string;
  brand: string | null;
  cls: DeviceClass;
  rackUnits: number | null;
  sizeCm: RackItemInput["sizeCm"];
  weightKg: number | null;
  specs: SpecRow[] | null;
  ampTotalW: number | null;
  /** PoE como equipo alimentado: consumo (W) y si es estimado. */
  pd: { watts: number; estimated: boolean } | null;
  poeBudgetW: number | null;
};

const n = (v: unknown) => {
  const x = v == null ? NaN : Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
};

/** Potencia total de salida de un amplificador (W): canales × W por canal (8 Ω si la ficha lo da). */
function ampTotal(caps: IoCapabilities, spec: { channels: number | null; wattsPerChannel: number | null } | null): number | null {
  const ch = n(caps.ampChannels?.value) ?? spec?.channels ?? null;
  const per = caps.ampWattsPerChannel?.value;
  const w = per ? (n(per["8Ω"]) ?? n(per["8 Ω"]) ?? Math.max(...Object.values(per).map((x) => Number(x) || 0))) : (spec?.wattsPerChannel ?? null);
  return ch && w ? ch * w : null;
}

/** ¿El equipo se alimenta por PoE? Puerto "pd" en la ficha, consumo PoE o "Powered Device" en la tabla. */
function poeOf(caps: IoCapabilities, ports: IoPort[], specs: SpecRow[]): { standard: string | null; watts: number | null } | null {
  const row = specs.find((s) => /power over ethernet|^poe\b|power source options/i.test(String(s.label ?? "")) && /powered device|\bpoe\b/i.test(String(s.value ?? "")) && !/sourcing|pse\b/i.test(String(s.value ?? "")));
  const isPd = ports.some((p) => p.poe === "pd") || Boolean(caps.poeWatts) || Boolean(row);
  if (!isPd) return null;
  return { standard: caps.poeStandard?.value ?? (row ? String(row.value) : null), watts: n(caps.poeWatts?.value) };
}

async function factsFor(devices: SceneDevice[]): Promise<Map<string, Fact>> {
  const ids = [...new Set(devices.map((d) => d.productId).filter((x): x is string => Boolean(x)))];
  const rows = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { ...SPEC_PRODUCT_SELECT, rackUnits: true, widthCm: true, heightCm: true, depthCm: true, weight: true, specifications: true, ioProfile: { select: { ports: true, capabilities: true, status: true } } },
      })
    : [];
  const byId = new Map(rows.map((p) => [p.id, p]));
  const out = new Map<string, Fact>();
  for (const d of devices) {
    const template = d.generic ? genericByKey(d.generic.key) : null;
    if (d.generic) {
      const cls = template?.cls ?? "other";
      out.set(d.id, { name: d.generic.name, brand: null, cls, rackUnits: null, sizeCm: null, weightKg: null, specs: null, ampTotalW: null, pd: template?.capabilities.poeWatts ? { watts: template.capabilities.poeWatts.value, estimated: true } : null, poeBudgetW: n(template?.capabilities.poeBudgetWatts?.value) });
      continue;
    }
    const p = d.productId ? byId.get(d.productId) : undefined;
    if (!p) continue;
    const spec = effectiveSpec(p as unknown as SpecProduct);
    const cls = deviceClass({ role: d.designRole, slotKey: d.slotKey, name: p.normalizedName, spec });
    const valid = p.ioProfile && (p.ioProfile.status === "auto" || p.ioProfile.status === "approved");
    const caps = (valid ? p.ioProfile!.capabilities : {}) as IoCapabilities;
    const ports = (valid ? p.ioProfile!.ports : []) as IoPort[];
    const specs = (Array.isArray(p.specifications) ? p.specifications : []) as SpecRow[];
    const poe = poeOf(caps, ports, specs);
    const amp = cls === "amp" ? ampTotal(caps, spec) : null;
    let pd: Fact["pd"] = null;
    if (poe) {
      // Lo que consume del switch: el consumo de la ficha si lo trae; si no, el de su clase PoE.
      const own = devicePower({ cls, specs, ampTotalW: amp });
      pd = own.kind !== "estimado" ? { watts: own.watts, estimated: false } : poe.watts ? { watts: poe.watts, estimated: false } : poeClassWatts(poe.standard);
    }
    out.set(d.id, {
      name: p.normalizedName,
      brand: p.brand?.name ?? null,
      cls,
      rackUnits: p.rackUnits ?? null,
      sizeCm: productSizeCm(p),
      weightKg: n(p.weight),
      specs,
      ampTotalW: amp,
      pd,
      poeBudgetW: n(caps.poeBudgetWatts?.value),
    });
  }
  return out;
}

const qty = (d: SceneDevice) => Math.max(1, Math.round(d.quantity || 1));

function rackItems(devices: SceneDevice[], facts: Map<string, Fact>): RackItemInput[] {
  return devices.flatMap((d) => {
    const f = facts.get(d.id);
    if (!f || NOT_IN_RACK.has(f.cls)) return [];
    return Array.from({ length: qty(d) }, (_, unit) => ({
      key: `${d.id}#${unit}`,
      deviceId: d.id,
      unit,
      name: qty(d) > 1 ? `${f.name} (${unit + 1})` : f.name,
      brand: f.brand,
      cls: f.cls,
      rackUnits: f.rackUnits,
      sizeCm: f.sizeCm,
      weightKg: f.weightKg,
      specs: f.specs,
      ampTotalW: f.ampTotalW,
      poe: f.pd ? { pd: true, watts: f.pd.watts, estimated: f.pd.estimated } : null,
      poeBudgetW: f.poeBudgetW,
    }));
  });
}

function poeLoads(devices: SceneDevice[], facts: Map<string, Fact>, prefix = ""): PoeLoad[] {
  return devices.flatMap((d) => {
    const f = facts.get(d.id);
    if (!f?.pd) return [];
    return Array.from({ length: qty(d) }, () => ({ name: `${prefix}${f.name}`, watts: f.pd!.watts, estimated: f.pd!.estimated }));
  });
}

type RoomRack = { input: RackInput; hasSwitch: boolean; poeAll: PoeLoad[] };

/** Rack de un ambiente: los equipos con montaje en rack (los de pared, techo y mesa quedan en la sala). */
async function loadRoomRack(projectId: string): Promise<RoomRack | null> {
  const project = await getRoomProject(projectId);
  if (!project || project.kind === "hub") return null;
  const scene = parseScene(project.sceneJson);
  if (!scene) return null;
  const devices = scene.devices.filter((d) => d.productId || d.generic);
  const facts = await factsFor(devices);
  const slots = new Map(scene.slots.map((s) => [s.key, s.mount]));
  const inRack = devices.filter((d) => (slots.get(d.slotKey) ?? MOUNT_BY_ROLE[d.designRole] ?? "rack") === "rack");
  const items = rackItems(inRack, facts);
  const hasSwitch = items.some(isPoeSwitch);
  const outside = devices.filter((d) => !inRack.includes(d));
  // Sin switch PoE en la sala y con proyecto: el PoE lo da el rack central (se cuenta allá).
  const centralPoe = !hasSwitch && Boolean(project.parentId);
  const loads = poeLoads(outside, facts);
  const notes = centralPoe && loads.length ? [`${loads.length} equipo(s) PoE de la sala se alimentan desde el rack central (su consumo se cuenta allá).`] : [];
  return {
    input: { id: project.id, title: `Rack · ${project.name}`, scope: "room", items, poeLoads: centralPoe ? [] : loads, order: scene.rackOrder ?? null, notes },
    hasSwitch,
    // Los equipos PoE del rack de la sala sin switch usan su fuente (tienen toma en ese rack): no se suman al central.
    poeAll: poeLoads(outside, facts, `${project.name} · `),
  };
}

export async function roomRackInput(projectId: string): Promise<RackInput | null> {
  return (await loadRoomRack(projectId))?.input ?? null;
}

/** Racks del proyecto: el central (con el PoE de los ambientes sin switch propio) y el de cada ambiente con equipos de rack. */
export async function projectRackInputs(hubId: string): Promise<RackInput[]> {
  const hub = await getRoomProject(hubId);
  if (!hub || hub.kind !== "hub") throw new Error("Proyecto no encontrado");
  const rooms = (await Promise.all(hub.children.map((c) => loadRoomRack(c.id)))).filter((r): r is RoomRack => Boolean(r));
  const raw = (hub.sceneJson && typeof hub.sceneJson === "object" ? hub.sceneJson : {}) as Record<string, unknown>;
  const devices = (parseScene(hub.sceneJson)?.devices ?? []).filter((d) => d.productId || d.generic);
  const facts = await factsFor(devices);
  const order = Array.isArray(raw.rackOrder) ? (raw.rackOrder as unknown[]).filter((k): k is string => typeof k === "string") : null;
  const central: RackInput = {
    id: hub.id,
    title: "Rack central",
    scope: "central",
    items: rackItems(devices, facts),
    poeLoads: [...rooms.filter((r) => !r.hasSwitch).flatMap((r) => r.poeAll), ...poeLoads(devices.filter((d) => NOT_IN_RACK.has(facts.get(d.id)?.cls ?? "other")), facts)],
    order,
  };
  return [central, ...rooms.map((r) => r.input).filter((r) => r.items.length)];
}
