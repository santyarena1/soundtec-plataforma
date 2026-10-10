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
import { genericByKey } from "./generic/library";
import { getRoomProject, updateRoomProjectScene } from "./project-service";
import { parseScene } from "./scene";
import { autoWires, buildWiringModel, wiringOf } from "./wiring/model";

/** Rondas de resolución: cada una puede destrabar la siguiente (ej. amplificador → su fuente). */
const MAX_ROUNDS = 4;

export type ResolvedAddition = { generic: string; name: string; reason: string };
export type ResolveResult = { added: ResolvedAddition[]; remaining: CableFinding[]; wires: number };

export async function resolveAndWire(projectId: string): Promise<ResolveResult> {
  const added: ResolvedAddition[] = [];
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
    for (const f of remaining) if (f.fix && genericByKey(f.fix.generic) && !fixes.has(f.fix.generic)) fixes.set(f.fix.generic, f);
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
