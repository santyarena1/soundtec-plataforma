/**
 * Resolver y trazar: el sistema detecta lo que impide cablear la sala (falta
 * un amplificador, una fuente, un gateway, el switch…), lo resuelve solo
 * sumando el equipo genérico que corresponde, vuelve a calcular hasta que no
 * quede nada por resolver y traza todos los cables de puerto a puerto. Lo que
 * agrega queda a la vista para que el usuario lo cambie si quiere.
 */

import { cablingProfile } from "./cabling-db";
import { cablingForScene } from "./cabling-scene";
import type { CableFinding } from "./cabling";
import { addCustomDevice, addGenericDevice, removeCustomDevice } from "./custom-devices";
import { catalogFor } from "./catalog-match";
import { assignProductToSlot } from "./project-service";
import type { RoomScene } from "./scene";
import { genericByKey, genericForSlot } from "./generic/library";
import { getRoomProject, updateRoomProjectScene } from "./project-service";
import { parseScene } from "./scene";
import { autoWires, buildWiringModel, wiringOf } from "./wiring/model";

/** Rondas de resolución: cada una puede destrabar la siguiente (ej. amplificador → su fuente). */
const MAX_ROUNDS = 4;
/** Máximo de un mismo genérico que el sistema suma solo (si hace falta más, es una decisión de diseño). */
const MAX_SAME = 3;

export type ResolvedAddition = { generic: string; name: string; reason: string; /** Producto del catálogo (si no, es un genérico). */ catalog?: boolean };

/** Marcas preferidas del proyecto: las del brief y las de lo que ya está elegido. */
function brandsOf(scene: RoomScene) {
  const projectBrands = [...new Set(scene.devices.map((d) => d.brandName).filter((b): b is string => Boolean(b)).map((b) => b.toLowerCase().replace(/\s+/g, "-")))];
  return { brief: scene.brief?.brands ?? {}, projectBrands };
}

/** Suma lo que resuelve una necesidad: primero un producto del catálogo que sirva; si no hay, el genérico. */
async function addSolution(projectId: string, scene: RoomScene, key: string, reason: string, near?: { x: number; z: number }): Promise<ResolvedAddition> {
  const template = genericByKey(key)!;
  const { brief, projectBrands } = brandsOf(scene);
  const pick = await catalogFor(key, brief, projectBrands);
  if (pick) {
    await addCustomDevice({ projectId, productId: pick.productId, mount: template.mount, quantity: 1, near, addedBy: "system" });
    return { generic: key, name: pick.name, reason, catalog: true };
  }
  await addGenericDevice({ projectId, key, quantity: 1, near, addedBy: "system" });
  return { generic: key, name: template.name, reason };
}

/** Genéricos que ya estaban en la sala y tienen un producto del catálogo que los reemplaza. */
async function upgradeGenerics(projectId: string): Promise<ResolvedAddition[]> {
  const project = await getRoomProject(projectId);
  const scene = project ? parseScene(project.sceneJson) : null;
  if (!project || !scene) return [];
  const { brief, projectBrands } = brandsOf(scene);
  const out: ResolvedAddition[] = [];
  for (const d of scene.devices) {
    if (!d.generic) continue;
    const pick = await catalogFor(d.generic.key, brief, projectBrands);
    if (!pick) continue;
    // El lugar queda y pasa a ser el producto real (se le saca el genérico).
    const fresh = parseScene((await getRoomProject(projectId))?.sceneJson);
    if (!fresh) continue;
    await updateRoomProjectScene(projectId, { ...fresh, devices: fresh.devices.map((x) => (x.id === d.id ? { ...x, generic: null } : x)) });
    await assignProductToSlot({ projectId, slotKey: d.slotKey, productId: pick.productId, quantity: Math.max(1, d.quantity || 1) });
    out.push({ generic: d.generic.key, name: pick.name, reason: `Reemplaza al genérico "${d.generic.name}"`, catalog: true });
  }
  return out;
}
export type ResolveResult = { added: ResolvedAddition[]; removed: ResolvedAddition[]; remaining: CableFinding[]; wires: number };

/** Lugares de la plantilla sin producto: se cubren con el genérico que corresponde (precio y descripción a completar). */
async function fillEmptySlots(projectId: string): Promise<ResolvedAddition[]> {
  const project = await getRoomProject(projectId);
  const scene = project ? parseScene(project.sceneJson) : null;
  if (!project || !scene) return [];
  const filled: ResolvedAddition[] = [];
  const { brief, projectBrands } = brandsOf(scene);
  const toGeneric = new Map<string, { key: string; name: string }>();
  for (const d of scene.devices) {
    if (d.productId || d.generic) continue;
    const slot = scene.slots.find((s) => s.key === d.slotKey);
    const key = genericForSlot(slot?.label ?? d.label, d.designRole);
    const template = key ? genericByKey(key) : null;
    if (!template) continue;
    // Primero un producto real del catálogo; el genérico solo si no hay.
    const pick = await catalogFor(template.key, brief, projectBrands);
    if (pick) {
      await assignProductToSlot({ projectId, slotKey: d.slotKey, productId: pick.productId, quantity: Math.max(1, d.quantity || 1) });
      filled.push({ generic: template.key, name: pick.name, reason: "Lugar sin equipo elegido", catalog: true });
      continue;
    }
    const name = slot?.label?.trim() || template.name;
    toGeneric.set(d.id, { key: template.key, name });
    filled.push({ generic: template.key, name, reason: "Lugar sin equipo elegido (no hay en el catálogo)" });
  }
  if (toGeneric.size) {
    const fresh = parseScene((await getRoomProject(projectId))?.sceneJson);
    if (fresh) {
      const devices = fresh.devices.map((d) => {
        const g = toGeneric.get(d.id);
        return g ? { ...d, generic: { key: g.key, name: g.name, description: null, priceUsd: null }, productName: g.name } : d;
      });
      await updateRoomProjectScene(projectId, { ...fresh, devices });
    }
  }
  return filled;
}

export async function resolveAndWire(projectId: string): Promise<ResolveResult> {
  const added: ResolvedAddition[] = [...(await upgradeGenerics(projectId)), ...(await fillEmptySlots(projectId))];
  let remaining: CableFinding[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const project = await getRoomProject(projectId);
    const scene = project ? parseScene(project.sceneJson) : null;
    const profile = scene ? await cablingProfile(projectId) : null;
    if (!project || !scene || !profile) throw new Error("Ambiente no encontrado");
    const plan = cablingForScene(scene, project.category, profile);
    remaining = plan.findings.filter((f) => f.level !== "info");
    // Una solución por tipo de equipo en cada ronda; la siguiente ronda ve si hace falta otro.
    const fixes = new Map<string, CableFinding>();
    const count = (key: string) => added.filter((a) => a.generic === key).length;
    // Con amplificación en el rack central no se suman amplificadores en la sala.
    const centralCls = new Set(profile.central ? (profile.centralDevices ?? []).map((c) => c.cls) : []);
    for (const f of remaining) {
      if (!f.fix || !genericByKey(f.fix.generic) || fixes.has(f.fix.generic) || count(f.fix.generic) >= MAX_SAME) continue;
      const cls = genericByKey(f.fix.generic)!.cls;
      if ((cls === "amp" || cls === "switch") && centralCls.has(cls)) continue;
      fixes.set(f.fix.generic, f);
    }
    if (!fixes.size) break;
    for (const [key, f] of fixes) {
      // Si esa misma falta ya se intentó resolver y sigue, no se insiste (es una decisión de diseño).
      if (added.some((a) => a.generic === key && a.reason === f.title)) continue;
      added.push(await addSolution(projectId, scene, key, f.title, f.fix?.near));
    }
  }

  // Lo que sobra: genéricos que quedaron sin ninguna conexión (ej. un amplificador cuando la sala usa el rack central).
  const removed = await removeUnused(projectId);

  // Con el diseño resuelto: el conexionado completo como cables editables (lo manual queda).
  const project = await getRoomProject(projectId);
  const scene = project ? parseScene(project.sceneJson) : null;
  const profile = scene ? await cablingProfile(projectId) : null;
  if (!project || !scene || !profile) throw new Error("Ambiente no encontrado");
  const plan = cablingForScene(scene, project.category, profile);
  const model = buildWiringModel(scene, profile);
  const wiring = autoWires(plan, model, wiringOf(scene));
  await updateRoomProjectScene(projectId, { ...scene, wiring });
  remaining = plan.findings.filter((f) => f.level !== "info");
  const removedKeys = new Set(removed.map((r) => r.generic));
  return { added: added.filter((a) => !removedKeys.has(a.generic)), removed, remaining, wires: wiring.wires.length };
}

/** Quita los genéricos agregados a mano o por el sistema que no tienen ninguna conexión en el plan. */
async function removeUnused(projectId: string): Promise<ResolvedAddition[]> {
  const project = await getRoomProject(projectId);
  const scene = project ? parseScene(project.sceneJson) : null;
  const profile = scene ? await cablingProfile(projectId) : null;
  if (!project || !scene || !profile) return [];
  const plan = cablingForScene(scene, project.category, profile);
  // Conexiones que sirven a la sala (un equipo que solo alimenta al rack central no cuenta).
  const linked = new Set(plan.links.filter((l) => !l.to.startsWith("central:") && !l.from.startsWith("central:")).flatMap((l) => [l.from.replace(/#\d+$/, ""), l.to.replace(/#\d+$/, "")]));
  const removed: ResolvedAddition[] = [];
  // Clases que ya cubre el rack central del proyecto (amplificación, red).
  const centralCls = new Set(profile.central ? (profile.centralDevices ?? []).map((c) => c.cls) : []);
  for (const d of scene.devices) {
    if (!d.slotKey.startsWith("custom_") || (!d.generic && d.addedBy !== "system")) continue;
    const info = profile.devices[d.id];
    const template = d.generic ? genericByKey(d.generic.key) : info ? { cls: info.cls } : null;
    // Amplificador genérico en una sala que se amplifica desde el rack central: sobra aunque tenga parlantes asignados.
    const redundant = Boolean(template && (template.cls === "amp" || template.cls === "switch") && centralCls.has(template.cls));
    if (linked.has(d.id) && !redundant) continue;
    // Solo lo que existe para alimentar o distribuir; un motor o un sensor sin cables (inalámbrico/a definir) se deja.
    if (!template || !["amp", "dsp", "streamer", "source", "video-switch", "switch"].includes(template.cls)) continue;
    await removeCustomDevice(projectId, d.slotKey);
    removed.push({ generic: d.generic?.key ?? d.productId ?? "", name: d.generic?.name ?? d.productName ?? d.label, reason: "Sin conexiones en el diseño" });
  }
  return removed;
}
