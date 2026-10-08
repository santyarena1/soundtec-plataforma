import { assignProductToSlot, getRoomProject } from "./project-service";
import { parseScene } from "./scene";
import { rankProductsForSlot } from "./rank-from-db";
import type { DesignRole, MountOption } from "./types";

/**
 * Asigna el mejor producto rankeado a cada slot requerido (y opcionales si hay match fuerte).
 */
export async function autoFillProjectSlots(
  projectId: string,
  options?: { includeOptional?: boolean; minScore?: number },
) {
  const project = await getRoomProject(projectId);
  if (!project || project.kind === "hub") {
    return { filled: 0, attempted: 0 };
  }
  const scene = parseScene(project.sceneJson);
  if (!scene) return { filled: 0, attempted: 0 };

  const minScore = options?.minScore ?? 35;
  let filled = 0;
  let attempted = 0;

  for (const slot of scene.slots) {
    if (!slot.required && !options?.includeOptional) continue;
    const existing = scene.devices.find((d) => d.slotKey === slot.key);
    if (existing?.productId) continue;

    attempted += 1;
    const ranked = await rankProductsForSlot({
      role: slot.role as DesignRole,
      mount: slot.mount as MountOption,
      projectCategory: project.category,
      roomDepthM: scene.depthM,
      roomWidthM: scene.widthM,
      mode: "recommended",
      limit: 5,
    });
    const best = ranked.find((r) => r.compatible && r.score >= minScore);
    if (!best) continue;

    await assignProductToSlot({
      projectId,
      slotKey: slot.key,
      productId: best.productId,
      quantity: existing?.quantity ?? slot.defaultQty,
    });
    filled += 1;
  }

  return { filled, attempted };
}
