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
import { addGenericDevice } from "./custom-devices";
import { genericByKey, genericForSlot } from "./generic/library";
import { getRoomProject, updateRoomProjectScene } from "./project-service";
import { parseScene } from "./scene";
import { autoWires, buildWiringModel, wiringOf } from "./wiring/model";

/** Rondas de resolución: cada una puede destrabar la siguiente (ej. amplificador → su fuente). */
const MAX_ROUNDS = 4;
/** Máximo de un mismo genérico que el sistema suma solo (si hace falta más, es una decisión de diseño). */
const MAX_SAME = 3;

export type ResolvedAddition = { generic: string; name: string; reason: string };
export type ResolveResult = { added: ResolvedAddition[]; remaining: CableFinding[]; wires: number };

/** Lugares de la plantilla sin producto: se cubren con el genérico que corresponde (precio y descripción a completar). */
async function fillEmptySlots(projectId: string): Promise<ResolvedAddition[]> {
  const project = await getRoomProject(projectId);
  const scene = project ? parseScene(project.sceneJson) : null;
  if (!project || !scene) return [];
  const filled: ResolvedAddition[] = [];
  const devices = scene.devices.map((d) => {
    if (d.productId || d.generic) return d;
    const slot = scene.slots.find((s) => s.key === d.slotKey);
    const key = genericForSlot(slot?.label ?? d.label, d.designRole);
    const template = key ? genericByKey(key) : null;
    if (!template) return d;
    const name = slot?.label?.trim() || template.name;
    filled.push({ generic: template.key, name, reason: "Lugar sin equipo elegido" });
    return { ...d, generic: { key: template.key, name, description: null, priceUsd: null }, productName: name };
  });
  if (filled.length) await updateRoomProjectScene(projectId, { ...scene, devices });
  return filled;
}

export async function resolveAndWire(projectId: string): Promise<ResolveResult> {
  const added: ResolvedAddition[] = await fillEmptySlots(projectId);
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
    for (const f of remaining) if (f.fix && genericByKey(f.fix.generic) && !fixes.has(f.fix.generic) && count(f.fix.generic) < MAX_SAME) fixes.set(f.fix.generic, f);
    if (!fixes.size) break;
    for (const [key, f] of fixes) {
      const template = genericByKey(key)!;
      await addGenericDevice({ projectId, key, quantity: 1, near: f.fix?.near });
      added.push({ generic: key, name: template.name, reason: f.title });
    }
  }

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
  return { added, remaining, wires: wiring.wires.length };
}
