/**
 * Equipos libres: cualquier producto del catálogo, en cualquier ambiente y
 * con el montaje que se elija (no solo los lugares que trae la plantilla).
 * También la búsqueda abierta en todo el catálogo, con foto.
 */

import { prisma } from "@/lib/prisma";
import { poseForMount } from "./brief";
import { getRoomProject, updateRoomProjectScene } from "./project-service";
import { parseScene } from "./scene";
import { defaultMountForRole, roleForProduct } from "./product-roles";
import { MOUNT_OPTIONS, type DesignRole, type MountOption } from "./types";
import { genericByKey } from "./generic/library";

/** Prefijo de los lugares creados a mano (la plantilla nunca los rearma). */
export const CUSTOM_SLOT_PREFIX = "custom_";
const SEARCH_LIMIT = 30;
const MIN_QUERY = 2;

export type CatalogHit = {
  productId: string;
  name: string;
  sku: string | null;
  brand: string | null;
  imageUrl: string | null;
  priceUsd: number | null;
  role: DesignRole;
  mount: MountOption;
};

/** Búsqueda libre en todo el catálogo activo (nombre, modelo, SKU o marca). */
export async function searchCatalog(query: string): Promise<CatalogHit[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY) return [];
  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      isDiscontinued: false,
      OR: [
        { normalizedName: { contains: q, mode: "insensitive" } },
        { supplierSku: { contains: q, mode: "insensitive" } },
        { modelNumber: { contains: q, mode: "insensitive" } },
        { brand: { name: { contains: q, mode: "insensitive" } } },
      ],
    },
    select: {
      id: true,
      normalizedName: true,
      supplierSku: true,
      modelNumber: true,
      baseCostUsd: true,
      brand: { select: { name: true } },
      images: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: { url: true }, take: 1 },
      designProfile: { select: { designRole: true } },
      aiProfile: { select: { productType: true } },
    },
    orderBy: [{ normalizedName: "asc" }],
    take: SEARCH_LIMIT,
  });
  return rows.map((p) => {
    const role = roleForProduct(p.designProfile?.designRole, p.aiProfile?.productType);
    return {
      productId: p.id,
      name: p.normalizedName,
      sku: p.supplierSku ?? p.modelNumber ?? null,
      brand: p.brand?.name ?? null,
      imageUrl: p.images[0]?.url ?? null,
      priceUsd: p.baseCostUsd == null ? null : Number(p.baseCostUsd),
      role,
      mount: defaultMountForRole(role),
    };
  });
}

/** Agrega un producto como equipo propio del ambiente, con el montaje elegido. */
export async function addCustomDevice(input: { projectId: string; productId: string; mount: MountOption; quantity: number }) {
  if (!MOUNT_OPTIONS.includes(input.mount)) throw new Error("Montaje inválido");
  const { assignProductToSlot } = await import("./project-service");
  const project = await getRoomProject(input.projectId);
  if (!project || project.kind === "hub") throw new Error("Ambiente no encontrado");
  const scene = parseScene(project.sceneJson);
  if (!scene) throw new Error("Escena inválida");
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { normalizedName: true, designProfile: { select: { designRole: true } }, aiProfile: { select: { productType: true } } },
  });
  if (!product) throw new Error("Producto no encontrado");

  const role = roleForProduct(product.designProfile?.designRole, product.aiProfile?.productType);
  const key = `${CUSTOM_SLOT_PREFIX}${Date.now().toString(36)}`;
  const qty = Math.max(1, Math.min(48, Math.round(input.quantity)));
  const pose = poseForMount(input.mount, { widthM: scene.widthM, depthM: scene.depthM, heightM: scene.heightM }, role);
  scene.slots.push({ key, role, label: product.normalizedName, required: false, mount: input.mount, pose, defaultQty: qty });
  scene.devices.push({ id: `slot-${key}`, slotKey: key, productId: null, designRole: role, label: product.normalizedName, quantity: qty, pose, coverage: null });
  scene.selectedSlotKey = key;
  await updateRoomProjectScene(input.projectId, scene);
  return assignProductToSlot({ projectId: input.projectId, slotKey: key, productId: input.productId, quantity: qty });
}

/** Quita un equipo agregado a mano (los de la plantilla se vacían, no se borran). */
export async function removeCustomDevice(projectId: string, slotKey: string) {
  if (!slotKey.startsWith(CUSTOM_SLOT_PREFIX) && !slotKey.startsWith("bom_")) throw new Error("Solo se pueden quitar equipos agregados a mano");
  const project = await getRoomProject(projectId);
  if (!project) throw new Error("Ambiente no encontrado");
  const scene = parseScene(project.sceneJson);
  if (!scene) throw new Error("Escena inválida");
  scene.slots = scene.slots.filter((s) => s.key !== slotKey);
  scene.devices = scene.devices.filter((d) => d.slotKey !== slotKey);
  if (scene.selectedSlotKey === slotKey) scene.selectedSlotKey = scene.slots[0]?.key ?? null;
  await prisma.roomProjectDevice.deleteMany({ where: { roomProjectId: projectId, slotKey } });
  await updateRoomProjectScene(projectId, scene);
  return getRoomProject(projectId);
}

/** Agrega un equipo genérico (no es del catálogo) con las conexiones de su plantilla. */
export async function addGenericDevice(input: { projectId: string; key: string; mount?: MountOption; quantity: number; name?: string }) {
  const template = genericByKey(input.key);
  if (!template) throw new Error("Plantilla genérica inexistente");
  const mount = input.mount && MOUNT_OPTIONS.includes(input.mount) ? input.mount : template.mount;
  const project = await getRoomProject(input.projectId);
  if (!project || project.kind === "hub") throw new Error("Ambiente no encontrado");
  const scene = parseScene(project.sceneJson);
  if (!scene) throw new Error("Escena inválida");
  const key = `${CUSTOM_SLOT_PREFIX}${Date.now().toString(36)}`;
  const qty = Math.max(1, Math.min(48, Math.round(input.quantity)));
  const name = input.name?.trim().slice(0, 120) || template.name;
  const pose = poseForMount(mount, { widthM: scene.widthM, depthM: scene.depthM, heightM: scene.heightM }, template.role);
  scene.slots.push({ key, role: template.role, label: name, required: false, mount, pose, defaultQty: qty });
  scene.devices.push({ id: `slot-${key}`, slotKey: key, productId: null, designRole: template.role, label: name, productName: name, quantity: qty, pose, coverage: null, generic: { key: template.key, name, description: null, priceUsd: null } });
  scene.selectedSlotKey = key;
  await updateRoomProjectScene(input.projectId, scene);
  return getRoomProject(input.projectId);
}

/** Edita nombre, descripción y precio de un genérico (lo que va a la cotización). */
export async function updateGenericDevice(projectId: string, slotKey: string, patch: { name?: string; description?: string | null; priceUsd?: number | null }) {
  const project = await getRoomProject(projectId);
  if (!project) throw new Error("Ambiente no encontrado");
  const scene = parseScene(project.sceneJson);
  if (!scene) throw new Error("Escena inválida");
  const device = scene.devices.find((d) => d.slotKey === slotKey);
  if (!device?.generic) throw new Error("No es un equipo genérico");
  const name = patch.name?.trim().slice(0, 120);
  const generic = {
    ...device.generic,
    ...(name ? { name } : {}),
    ...(patch.description !== undefined ? { description: patch.description?.trim().slice(0, 2000) || null } : {}),
    ...(patch.priceUsd !== undefined ? { priceUsd: patch.priceUsd == null || !Number.isFinite(patch.priceUsd) ? null : Math.max(0, Math.round(patch.priceUsd * 100) / 100) } : {}),
  };
  scene.devices = scene.devices.map((d) => (d.slotKey === slotKey ? { ...d, generic, label: generic.name, productName: generic.name } : d));
  scene.slots = scene.slots.map((s) => (s.key === slotKey ? { ...s, label: generic.name } : s));
  await updateRoomProjectScene(projectId, scene);
  return getRoomProject(projectId);
}
