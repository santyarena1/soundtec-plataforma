import { assignProductToSlot, getRoomProject } from "./project-service";
import { parseScene } from "./scene";
import { processorKindForSlot, rankProductsForSlot } from "./rank-from-db";
import { preferredBrandsForSlot } from "./brief";
import { pickForTier, targetDisplayInches } from "./sizing";
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

  const tier = scene.brief?.tier ?? "recomendado";
  const displayInches = scene.brief?.video?.sizeIn ?? targetDisplayInches(scene, project.category);
  let filled = 0;
  let attempted = 0;

  for (const slot of scene.slots) {
    if (!slot.required && !options?.includeOptional) continue;
    const existing = scene.devices.find((d) => d.slotKey === slot.key);
    if (existing?.productId || existing?.generic) continue;

    attempted += 1;
    const ranked = await rankProductsForSlot({
      role: slot.role as DesignRole,
      mount: slot.mount as MountOption,
      projectCategory: project.category,
      roomDepthM: scene.depthM,
      roomWidthM: scene.widthM,
      // Siempre por calidad: el nivel decide después entre los buenos (ver pickForTier).
      mode: "recommended",
      // Pantallas: todas, para poder elegir por tamaño (no solo las 30 mejor puntuadas).
      limit: slot.role === "display" ? 100 : 30,
      processorKind: processorKindForSlot(slot.key, slot.role),
      slotKey: slot.key,
      preferredBrands: preferredBrandsForSlot(scene.brief, slot.role, slot.key),
    });
    const best = pickForTier(ranked, tier, {
      minScore: options?.minScore,
      targetInches: slot.role === "display" && !/signage/.test(slot.key) ? displayInches : null,
    });
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
