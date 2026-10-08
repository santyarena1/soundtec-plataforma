/**
 * Motor de interconexiones / packs (estilo Collab Room Builder + Home).
 * Usa AccessoryRelation del catálogo + reglas de plataforma Crestron.
 */

import { prisma } from "@/lib/prisma";
import { getRoomProject } from "./project-service";
import { parseScene } from "./scene";
import type { RoomPlatform } from "./types";

export type InterconnectSuggestion = {
  id: string;
  reason: string;
  severity: "required" | "recommended";
  sourceProductId: string | null;
  sourceName: string | null;
  productId: string;
  name: string;
  brand: string | null;
  sku: string | null;
  kind: string;
  quantity: number;
  alreadyInProject: boolean;
};

const PLATFORM_PACK_ROLES: Partial<
  Record<RoomPlatform, Array<{ role: string; label: string; severity: "required" | "recommended" }>>
> = {
  "crestron-home": [
    { role: "processor", label: "Procesador Crestron Home / control", severity: "required" },
    { role: "touch", label: "Touch / teclado de control", severity: "recommended" },
  ],
  teams: [
    { role: "codec", label: "Compute / UC engine Teams", severity: "required" },
    { role: "touch", label: "Touch de sala", severity: "required" },
  ],
  zoom: [
    { role: "codec", label: "Compute / appliance Zoom", severity: "required" },
    { role: "touch", label: "Touch de sala", severity: "required" },
  ],
  byod: [
    { role: "processor", label: "Switch / procesador AV", severity: "recommended" },
  ],
  none: [],
};

/** Heurística: keypads / botoneras Crestron necesitan un procesador en el BOM. */
function looksLikeCrestronKeypad(name: string, type: string | null | undefined): boolean {
  const t = `${name} ${type ?? ""}`.toLowerCase();
  return /\b(keypad|button|btnb|btnw|hr-?\d|cameo|horizon|clw-|infiNET|c2n-cbd|bpc-)\b/i.test(
    t,
  );
}

function looksLikeLightingLoad(name: string, type: string | null | undefined): boolean {
  const t = `${name} ${type ?? ""}`.toLowerCase();
  return /\b(dimmer|lighting|lutron|clx-|glpac|load controller|shade|motor)\b/i.test(t);
}

export async function analyzeInterconnect(projectId: string): Promise<{
  platform: string | null;
  suggestions: InterconnectSuggestion[];
  placedCount: number;
}> {
  const project = await getRoomProject(projectId);
  if (!project) throw new Error("Proyecto no encontrado");

  const scene = parseScene(project.sceneJson);
  const placedIds = new Set(
    project.devices.map((d) => d.productId).filter((id): id is string => !!id),
  );
  const suggestions: InterconnectSuggestion[] = [];
  const seen = new Set<string>();

  function push(s: InterconnectSuggestion) {
    const key = `${s.productId}:${s.reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(s);
  }

  // 1) Relaciones del catálogo (accesorios / incluidos / compatibles)
  if (placedIds.size > 0) {
    const relations = await prisma.accessoryRelation.findMany({
      where: {
        productId: { in: [...placedIds] },
        kind: { in: ["ACCESSORY", "INCLUDED", "COMPATIBLE", "RELATED"] },
      },
      include: {
        product: {
          select: { id: true, normalizedName: true },
        },
        accessoryProduct: {
          select: {
            id: true,
            normalizedName: true,
            supplierSku: true,
            modelNumber: true,
            isActive: true,
            brand: { select: { name: true } },
            aiProfile: { select: { productType: true } },
          },
        },
      },
      take: 400,
    });

    for (const rel of relations) {
      if (!rel.accessoryProduct.isActive) continue;
      const required =
        rel.isRequired ||
        rel.kind === "INCLUDED" ||
        (rel.kind === "ACCESSORY" &&
          looksLikeCrestronKeypad(
            rel.product.normalizedName,
            null,
          ));
      push({
        id: rel.id,
        reason:
          rel.kind === "INCLUDED"
            ? `Incluido con ${rel.product.normalizedName}`
            : rel.kind === "ACCESSORY"
              ? `Accesorio de ${rel.product.normalizedName}`
              : `Compatible / relacionado con ${rel.product.normalizedName}`,
        severity: required ? "required" : "recommended",
        sourceProductId: rel.productId,
        sourceName: rel.product.normalizedName,
        productId: rel.accessoryProductId,
        name: rel.accessoryProduct.normalizedName,
        brand: rel.accessoryProduct.brand?.name ?? null,
        sku:
          rel.accessoryProduct.supplierSku ??
          rel.accessoryProduct.modelNumber,
        kind: rel.kind,
        quantity: rel.quantity ?? 1,
        alreadyInProject: placedIds.has(rel.accessoryProductId),
      });
    }
  }

  // 2) Reglas de plataforma: roles faltantes en la escena
  const platform = (project.platform ?? "none") as RoomPlatform;
  const pack = PLATFORM_PACK_ROLES[platform] ?? [];
  const rolesPresent = new Set(
    project.devices
      .filter((d) => d.productId)
      .map((d) => d.designRole)
      .filter(Boolean),
  );

  for (const need of pack) {
    if (rolesPresent.has(need.role)) continue;
    // sugerir top Crestron del rol vía design profile
    const candidate = await prisma.productDesignProfile.findFirst({
      where: {
        designRole: need.role === "codec" ? { in: ["codec", "processor"] } : need.role,
        product: {
          isActive: true,
          isDiscontinued: false,
          brand: { slug: "crestron" },
        },
      },
      orderBy: [{ completenessScore: "desc" }, { updatedAt: "desc" }],
      include: {
        product: {
          select: {
            id: true,
            normalizedName: true,
            supplierSku: true,
            modelNumber: true,
            brand: { select: { name: true } },
          },
        },
      },
    });
    if (!candidate) continue;
    push({
      id: `platform-${platform}-${need.role}`,
      reason: `Pack ${platform}: ${need.label}`,
      severity: need.severity,
      sourceProductId: null,
      sourceName: null,
      productId: candidate.productId,
      name: candidate.product.normalizedName,
      brand: candidate.product.brand?.name ?? null,
      sku: candidate.product.supplierSku ?? candidate.product.modelNumber,
      kind: "PLATFORM_PACK",
      quantity: 1,
      alreadyInProject: placedIds.has(candidate.productId),
    });
  }

  // 3) Keypads Crestron sin procesador en el proyecto
  const placedProducts = await prisma.product.findMany({
    where: { id: { in: [...placedIds] } },
    select: {
      id: true,
      normalizedName: true,
      brand: { select: { slug: true } },
      aiProfile: { select: { productType: true } },
      designProfile: { select: { designRole: true } },
    },
  });

  const hasProcessor = placedProducts.some(
    (p) =>
      p.designProfile?.designRole === "processor" ||
      p.aiProfile?.productType === "control" ||
      p.aiProfile?.productType === "processor",
  );

  for (const p of placedProducts) {
    if (p.brand?.slug !== "crestron") continue;
    const isKeypad = looksLikeCrestronKeypad(
      p.normalizedName,
      p.aiProfile?.productType,
    );
    const isLighting = looksLikeLightingLoad(
      p.normalizedName,
      p.aiProfile?.productType,
    );
    if ((isKeypad || isLighting) && !hasProcessor) {
      const proc = await prisma.productDesignProfile.findFirst({
        where: {
          designRole: "processor",
          product: {
            isActive: true,
            brand: { slug: "crestron" },
            OR: [
              { isCrestronHomeCompatible: true },
              { normalizedName: { contains: "Home", mode: "insensitive" } },
              { modelNumber: { contains: "CP", mode: "insensitive" } },
            ],
          },
        },
        orderBy: { completenessScore: "desc" },
        include: {
          product: {
            select: {
              id: true,
              normalizedName: true,
              supplierSku: true,
              modelNumber: true,
              brand: { select: { name: true } },
            },
          },
        },
      });
      if (proc) {
        push({
          id: `keypad-needs-proc-${p.id}`,
          reason: `${p.normalizedName} requiere un procesador Crestron compatible para controlar iluminación/automatización`,
          severity: "required",
          sourceProductId: p.id,
          sourceName: p.normalizedName,
          productId: proc.productId,
          name: proc.product.normalizedName,
          brand: proc.product.brand?.name ?? null,
          sku: proc.product.supplierSku ?? proc.product.modelNumber,
          kind: "CRESTRON_CHAIN",
          quantity: 1,
          alreadyInProject: placedIds.has(proc.productId),
        });
      }
    }
  }

  // Orden: required missing first
  suggestions.sort((a, b) => {
    const am = a.alreadyInProject ? 1 : 0;
    const bm = b.alreadyInProject ? 1 : 0;
    if (am !== bm) return am - bm;
    if (a.severity !== b.severity) {
      return a.severity === "required" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return {
    platform: project.platform,
    suggestions: suggestions.slice(0, 60),
    placedCount: placedIds.size,
  };
}

/** Agrega sugerencias faltantes al BOM del proyecto (slots libres o slot genérico). */
export async function applyInterconnectSuggestions(
  projectId: string,
  productIds: string[],
) {
  const { assignProductToSlot, getRoomProject } = await import("./project-service");
  const project = await getRoomProject(projectId);
  if (!project) throw new Error("Proyecto no encontrado");
  const scene = parseScene(project.sceneJson);
  if (!scene) throw new Error("Escena inválida");

  const analysis = await analyzeInterconnect(projectId);
  const wanted = new Set(productIds);
  const toAdd = analysis.suggestions.filter(
    (s) => wanted.has(s.productId) && !s.alreadyInProject,
  );

  let added = 0;
  for (const sug of toAdd) {
    // Buscar slot vacío del mismo rol si existe
    const profile = await prisma.productDesignProfile.findUnique({
      where: { productId: sug.productId },
      select: { designRole: true },
    });
    const role = profile?.designRole;
    const emptySlot = scene.slots.find((slot) => {
      if (role && slot.role !== role) return false;
      const device = scene.devices.find((d) => d.slotKey === slot.key);
      return !device?.productId;
    });

    if (emptySlot) {
      await assignProductToSlot({
        projectId,
        slotKey: emptySlot.key,
        productId: sug.productId,
        quantity: sug.quantity,
      });
      added += 1;
      // refresh scene locally for next empty slot
      const refreshed = await getRoomProject(projectId);
      const nextScene = parseScene(refreshed?.sceneJson);
      if (nextScene) {
        scene.devices = nextScene.devices;
      }
      continue;
    }

    // Sin slot: crear device BOM-only en slot sintético
    const slotKey = `bom_${sug.productId.slice(-8)}`;
    if (!scene.slots.some((s) => s.key === slotKey)) {
      scene.slots.push({
        key: slotKey,
        role: (role as never) || "other",
        label: sug.name,
        required: sug.severity === "required",
        mount: "rack",
        pose: { x: 0, y: 0.4, z: -scene.depthM / 2 + 0.3, rotY: 0 },
        defaultQty: sug.quantity,
      });
      scene.devices.push({
        id: `slot-${slotKey}`,
        slotKey,
        productId: null,
        designRole: role || "other",
        label: sug.name,
        quantity: sug.quantity,
        pose: { x: 0, y: 0.4, z: -scene.depthM / 2 + 0.3, rotY: 0 },
        coverage: null,
      });
      const { updateRoomProjectScene } = await import("./project-service");
      await updateRoomProjectScene(projectId, scene);
    }
    await assignProductToSlot({
      projectId,
      slotKey,
      productId: sug.productId,
      quantity: sug.quantity,
    });
    added += 1;
  }

  return {
    added,
    project: await getRoomProject(projectId),
    analysis: await analyzeInterconnect(projectId),
  };
}
