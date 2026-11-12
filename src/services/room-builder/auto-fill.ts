import { prisma } from "@/lib/prisma";
import { assignProductToSlot, getRoomProject, updateRoomProjectScene } from "./project-service";
import { parseScene, type RoomScene } from "./scene";
import { processorKindForSlot, rankProductsForSlot } from "./rank-from-db";
import { preferredBrandsForSlot } from "./brief";
import { pickForTier, targetDisplayInches } from "./sizing";
import { catalogFor } from "./catalog-match";
import { genericByKey, genericForSlot } from "./generic/library";
import { fitContextFor, slotKind, type SlotKind } from "./role-fit";
import { addCustomDevice } from "./custom-devices";
import type { DesignRole, MountOption, RoomSlot } from "./types";

/**
 * Lugares que se resuelven por capacidades de la ficha (catalog-match) y no
 * por el ranking: la necesidad del catálogo y el genérico si no hay ninguno.
 */
const BY_CAPABILITY: Partial<Record<SlotKind, { need: string; generic: string }>> = {
  "dsp-aec": { need: "dsp", generic: "dsp" },
  "dsp-voice": { need: "dsp-voice", generic: "dsp" },
  "wireless-mic": { need: "wireless-mic", generic: "wireless-mic" },
  "av-receiver": { need: "av-receiver", generic: "av-receiver" },
};
/** Lugares sin rol de equipo que se cubren por su clave: presentación inalámbrica, conexión de mesa, fuente del cine. */
const BY_KEY: Record<string, { need: string | null; generic: string }> = {
  presentation: { need: "wireless-presentation", generic: "wireless-presentation" },
  table_input: { need: null, generic: "table-box" },
  source_video: { need: null, generic: "media-player" },
};

/** Desde estas pulgadas, si no hay una pantalla válida que llegue, va un proyector (la TV más grande no alcanza). */
const PROJECTOR_FROM_IN = 86;
/** Margen bajo el tamaño ideal que se acepta antes de pasar a proyector (pulgadas). */
const DISPLAY_SHORT_IN = 10;

/**
 * Cámaras que se alimentan y sacan su video por un adaptador propio (la ficha
 * lo indica): sin él la cámara no llega a la PC de sala. Modelo de la cámara →
 * modelo del adaptador en el catálogo.
 */
const CAMERA_ADAPTERS: Array<{ camera: RegExp; adapter: string }> = [{ camera: /\bUC-CAM-L1\b|huddly l1/i, adapter: "UC-CAMA-ADPT-ENET-USB" }];

type GenericFill = { key: string; name: string };

/** Genérico para un lugar sin producto válido; las pantallas grandes pasan a proyector. */
function genericFor(slot: RoomSlot, kind: SlotKind, targetInches: number | null): string | null {
  const byCap = BY_CAPABILITY[kind];
  if (byCap) return byCap.generic;
  if (BY_KEY[slot.key]) return BY_KEY[slot.key]!.generic;
  if (kind === "room-display" || kind === "signage-display") return targetInches != null && targetInches >= PROJECTOR_FROM_IN ? "projector" : "tv";
  return genericForSlot(slot.label, slot.role, slot.mount);
}

/** Nombre del genérico: el del lugar (lo que se pidió) y, si es proyector, que se lea. */
function genericName(slot: RoomSlot, key: string): string {
  if (key === "projector") return "Proyector (genérico: no hay en el catálogo una pantalla de ese tamaño)";
  return slot.label?.trim() || genericByKey(key)?.name || key;
}

/** Adaptador que necesita la cámara elegida (si su ficha lo pide) y que todavía no está en la sala. */
async function addCameraAdapters(projectId: string): Promise<void> {
  const scene = parseScene((await getRoomProject(projectId))?.sceneJson);
  if (!scene) return;
  for (const cam of scene.devices.filter((d) => d.designRole === "camera" && d.productId)) {
    const rule = CAMERA_ADAPTERS.find((r) => r.camera.test(cam.productName ?? ""));
    if (!rule) continue;
    const already = scene.devices.some((d) => (d.productName ?? "").toUpperCase().includes(rule.adapter));
    if (already) continue;
    const adapter = await prisma.product.findFirst({ where: { isActive: true, isDiscontinued: false, OR: [{ normalizedName: { equals: rule.adapter, mode: "insensitive" } }, { supplierSku: rule.adapter }] }, select: { id: true } });
    if (!adapter) continue;
    // Va junto a la PC de sala (rack): de ahí sale el USB; la cámara llega por UTP con PoE del adaptador.
    await addCustomDevice({ projectId, productId: adapter.id, mount: "rack", quantity: Math.max(1, cam.quantity || 1), addedBy: "system" });
  }
}

/** Marca como genéricos los lugares que quedaron sin producto válido. */
async function applyGenerics(projectId: string, fills: Map<string, GenericFill>): Promise<void> {
  if (!fills.size) return;
  const fresh = parseScene((await getRoomProject(projectId))?.sceneJson);
  if (!fresh) return;
  const devices = fresh.devices.map((d) => {
    const g = fills.get(d.slotKey);
    return g && !d.productId ? { ...d, generic: { key: g.key, name: g.name, description: null, priceUsd: null }, productName: g.name } : d;
  });
  await updateRoomProjectScene(projectId, { ...fresh, devices } as RoomScene);
}

/**
 * Asigna a cada lugar requerido (y opcionales si hay match fuerte) el mejor
 * producto que CUMPLE su papel. Si el catálogo no tiene ninguno, pone el
 * genérico que corresponde (precio y descripción a completar), nunca un
 * producto de otra categoría.
 */
export async function autoFillProjectSlots(
  projectId: string,
  options?: { includeOptional?: boolean; minScore?: number },
) {
  const project = await getRoomProject(projectId);
  if (!project || project.kind === "hub") {
    return { filled: 0, attempted: 0, generics: [] as string[] };
  }
  const scene = parseScene(project.sceneJson);
  if (!scene) return { filled: 0, attempted: 0, generics: [] as string[] };

  const tier = scene.brief?.tier ?? "recomendado";
  const displayInches = scene.brief?.video?.sizeIn ?? targetDisplayInches(scene, project.category);
  const brands = scene.brief?.brands ?? {};
  const control = scene.brief?.control ?? null;
  let filled = 0;
  let attempted = 0;
  const generics = new Map<string, GenericFill>();

  for (const slot of scene.slots) {
    if (!slot.required && !options?.includeOptional) continue;
    const existing = scene.devices.find((d) => d.slotKey === slot.key);
    if (existing?.productId || existing?.generic) continue;
    attempted += 1;
    const kind = slotKind(slot);
    const quantity = existing?.quantity ?? slot.defaultQty;

    const byCap = BY_CAPABILITY[kind] ?? BY_KEY[slot.key];
    if (byCap) {
      const pick = byCap.need ? await catalogFor(byCap.need, brands, [], control) : null;
      if (pick) {
        await assignProductToSlot({ projectId, slotKey: slot.key, productId: pick.productId, quantity });
        filled += 1;
      } else if (slot.required) generics.set(slot.key, { key: byCap.generic, name: genericName(slot, byCap.generic) });
      continue;
    }

    const isRoomDisplay = kind === "room-display";
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
      slotLabel: slot.label,
      preferredBrands: preferredBrandsForSlot(scene.brief, slot.role, slot.key),
      fit: fitContextFor({ brief: scene.brief, category: project.category, templateKey: project.templateKey, slotKey: slot.key, slots: scene.slots }),
    });
    const target = isRoomDisplay ? displayInches : null;
    let best = pickForTier(ranked, tier, { minScore: options?.minScore, targetInches: target });
    // Pantalla: si la más grande que sirve queda corta para la sala, va un proyector (genérico si no hay).
    if (best && isRoomDisplay && target != null && best.diagonalIn != null && best.diagonalIn < target - DISPLAY_SHORT_IN) best = null;
    if (!best) {
      if (slot.required) {
        const key = genericFor(slot, kind, target);
        if (key && genericByKey(key)) generics.set(slot.key, { key, name: genericName(slot, key) });
      }
      continue;
    }

    await assignProductToSlot({ projectId, slotKey: slot.key, productId: best.productId, quantity });
    filled += 1;
  }

  await applyGenerics(projectId, generics);
  await addCameraAdapters(projectId).catch((error) => console.error("[room-builder/auto-fill] adaptador de cámara", projectId, error));

  return { filled, attempted, generics: [...generics.values()].map((g) => g.name) };
}
