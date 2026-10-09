import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { autoFillProjectSlots } from "./auto-fill";
import { resizeSceneMeters } from "./dimensions";
import { platformFromBrief, type RoomBrief } from "./brief";
import { layoutSlotsForScene } from "./slot-layout";
import { ensureRoomBuilderSchema } from "./ensure-schema";
import { getHubPreset } from "./hub-presets";
import { getRoomTemplate, resizeTemplate } from "./templates";
import { displayProxyKey, targetDisplayInches } from "./sizing";
import { buildSceneFromTemplate, parseScene, productSizeCm, type ProductSizeCm, type RoomScene } from "./scene";

function decimal(n: number) {
  return new Prisma.Decimal(n);
}

export async function listRoomProjects(ownerId?: string) {
  await ensureRoomBuilderSchema();
  return prisma.roomProject.findMany({
    where: {
      parentId: null,
      ...(ownerId ? { ownerId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      client: { select: { id: true, companyName: true } },
      quote: { select: { id: true, number: true } },
      _count: { select: { children: true, devices: true } },
      children: {
        select: {
          id: true,
          name: true,
          templateKey: true,
          unitCount: true,
          status: true,
          _count: { select: { devices: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function getRoomProject(id: string) {
  await ensureRoomBuilderSchema();
  const project = await prisma.roomProject.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, companyName: true } },
      quote: { select: { id: true, number: true } },
      parent: { select: { id: true, name: true, kind: true } },
      children: {
        orderBy: { createdAt: "asc" },
        include: {
          _count: { select: { devices: true } },
        },
      },
      devices: {
        include: {
          product: {
            select: {
              id: true,
              normalizedName: true,
              supplierSku: true,
              baseCostUsd: true,
              widthCm: true,
              heightCm: true,
              depthCm: true,
              brand: { select: { name: true } },
              designProfile: { select: { diagonalIn: true } },
              images: {
                where: { isPrimary: true },
                select: { url: true },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!project) return null;
  const scene = parseScene(project.sceneJson);
  if (!scene) return project;
  const bySlot = new Map(project.devices.map((d) => [d.slotKey, d]));
  const emptyDisplay = `tv_${targetDisplayInches(scene, project.category)}`;
  scene.devices = scene.devices.map((device) => {
    const row = device.slotKey ? bySlot.get(device.slotKey) : undefined;
    return {
      ...device,
      productId: device.productId ?? row?.productId ?? null,
      imageUrl: row?.product?.images?.[0]?.url ?? device.imageUrl ?? null,
      productName: row?.product?.normalizedName ?? device.productName ?? null,
      brandName: row?.product?.brand?.name ?? device.brandName ?? null,
      sizeCm: row?.product ? productSizeCm(row.product) : device.sizeCm ?? null,
      // Pantallas: sus pulgadas reales; sin producto, el tamaño que corresponde al ambiente.
      proxyKey:
        device.designRole !== "display"
          ? device.proxyKey ?? null
          : row?.product
            ? displayProxyKey({ diagonalIn: row.product.designProfile?.diagonalIn, name: row.product.normalizedName, widthCm: row.product.widthCm }) ?? emptyDisplay
            : emptyDisplay,
    };
  });
  return { ...project, sceneJson: scene };
}

export async function createSpaceProject(input: {
  ownerId: string;
  name: string;
  templateKey: string;
  areaM2?: number;
  platform?: string | null;
  clientId?: string | null;
  unitCount?: number;
  parentId?: string | null;
  notes?: string | null;
  autoFill?: boolean;
  widthM?: number;
  depthM?: number;
  heightM?: number;
  /** Relevamiento del asistente (opcional: sin él se usa la plantilla tal cual). */
  brief?: RoomBrief | null;
}) {
  await ensureRoomBuilderSchema();
  const base = getRoomTemplate(input.templateKey);
  if (!base) throw new Error(`Template desconocido: ${input.templateKey}`);
  let template =
    input.areaM2 && input.areaM2 > 0 && !input.widthM
      ? resizeTemplate(base, input.areaM2)
      : base;
  let scene = buildSceneFromTemplate(template);
  if (input.widthM && input.depthM) {
    scene = resizeSceneMeters(scene, {
      widthM: input.widthM,
      depthM: input.depthM,
      heightM: input.heightM,
    });
  }
  // Superficie real (formas libres): manda sobre ancho × profundidad para cantidades.
  if (input.widthM && input.depthM && input.areaM2 && input.areaM2 > 0) scene = { ...scene, areaM2: Math.round(input.areaM2 * 100) / 100 };
  if (input.brief) {
    const slots = layoutSlotsForScene(template.key, scene, input.brief);
    scene = {
      ...buildSceneFromTemplate({ ...template, slots }),
      widthM: scene.widthM,
      depthM: scene.depthM,
      heightM: scene.heightM,
      areaM2: scene.areaM2,
      brief: input.brief,
    };
  }

  const created = await prisma.roomProject.create({
    data: {
      name: input.name,
      kind: "space",
      templateKey: template.key,
      category: template.category,
      sizePreset: template.sizePreset,
      areaM2: decimal(scene.areaM2),
      heightM: decimal(scene.heightM),
      platform: input.brief ? platformFromBrief(input.brief) : (input.platform ?? template.platforms[0] ?? null),
      unitCount: Math.max(1, input.unitCount ?? 1),
      status: "draft",
      visibility: "private",
      sceneJson: scene as unknown as Prisma.InputJsonValue,
      notes: input.notes ?? null,
      ownerId: input.ownerId,
      clientId: input.clientId ?? null,
      parentId: input.parentId ?? null,
      devices: {
        create: scene.devices.map((d) => ({
          slotKey: d.slotKey,
          designRole: d.designRole,
          quantity: d.quantity,
          poseJson: d.pose as unknown as Prisma.InputJsonValue,
          coverageJson: Prisma.JsonNull,
          productId: null,
        })),
      },
    },
    include: {
      devices: true,
      children: true,
    },
  });

  if (input.autoFill !== false) {
    try {
      await autoFillProjectSlots(created.id, { includeOptional: false });
    } catch (error) {
      // Un ranking que falla no debe romper el alta, pero queda registrado.
      console.error("[room-builder/auto-fill]", created.id, error);
    }
    return (await getRoomProject(created.id)) ?? created;
  }

  return created;
}

export async function createHubProject(input: {
  ownerId: string;
  name: string;
  hubPresetKey: string;
  clientId?: string | null;
  spaceOverrides?: Array<{
    templateKey: string;
    name?: string;
    unitCount?: number;
    areaM2?: number;
  }>;
}) {
  const preset = getHubPreset(input.hubPresetKey);
  if (!preset) throw new Error(`Hub preset desconocido: ${input.hubPresetKey}`);

  const hubScene = {
    version: 1,
    templateKey: preset.key,
    widthM: 0,
    depthM: 0,
    heightM: 0,
    areaM2: 0,
    cameraPreset: "plan",
    coverageView: "off",
    selectedSlotKey: null,
    slots: [],
    devices: [],
    hubPresetKey: preset.key,
  };

  const hub = await prisma.roomProject.create({
    data: {
      name: input.name,
      kind: "hub",
      templateKey: preset.key,
      category: preset.category,
      sizePreset: null,
      areaM2: decimal(0),
      heightM: decimal(0),
      platform: null,
      unitCount: 1,
      status: "draft",
      visibility: "private",
      sceneJson: hubScene as unknown as Prisma.InputJsonValue,
      ownerId: input.ownerId,
      clientId: input.clientId ?? null,
    },
  });

  const overrides = new Map(
    (input.spaceOverrides ?? []).map((o) => [o.templateKey, o]),
  );

  for (const space of preset.spaces) {
    const ov = overrides.get(space.templateKey);
    await createSpaceProject({
      ownerId: input.ownerId,
      name: ov?.name ?? space.name,
      templateKey: space.templateKey,
      unitCount: ov?.unitCount ?? space.unitCount,
      areaM2: ov?.areaM2,
      clientId: input.clientId,
      parentId: hub.id,
    });
  }

  return getRoomProject(hub.id);
}

/** La cotización sale de RoomProjectDevice.quantity: se alinea con la escena (unidades agregadas o quitadas en el 3D). */
async function syncDeviceQuantities(projectId: string, scene: RoomScene) {
  const rows = await prisma.roomProjectDevice.findMany({
    where: { roomProjectId: projectId },
    select: { id: true, slotKey: true, quantity: true },
  });
  const wanted = new Map(scene.devices.map((d) => [d.slotKey, Math.max(1, Math.round(d.quantity || 1))]));
  const changes = rows.filter((r) => r.slotKey && wanted.has(r.slotKey) && wanted.get(r.slotKey) !== r.quantity);
  if (!changes.length) return;
  await prisma.$transaction(
    changes.map((r) => prisma.roomProjectDevice.update({ where: { id: r.id }, data: { quantity: wanted.get(r.slotKey as string) as number } })),
  );
}

export async function updateRoomProjectScene(
  id: string,
  scene: RoomScene,
  patch?: {
    name?: string;
    platform?: string | null;
    unitCount?: number;
    status?: string;
    notes?: string | null;
    areaM2?: number;
    heightM?: number;
  },
) {
  await syncDeviceQuantities(id, scene);
  return prisma.roomProject.update({
    where: { id },
    data: {
      sceneJson: scene as unknown as Prisma.InputJsonValue,
      ...(patch?.name ? { name: patch.name } : {}),
      ...(patch?.platform !== undefined ? { platform: patch.platform } : {}),
      ...(patch?.unitCount != null
        ? { unitCount: Math.max(1, patch.unitCount) }
        : {}),
      ...(patch?.status ? { status: patch.status } : {}),
      ...(patch?.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch?.areaM2 != null ? { areaM2: decimal(patch.areaM2) } : {}),
      ...(patch?.heightM != null ? { heightM: decimal(patch.heightM) } : {}),
    },
  });
}

export async function assignProductToSlot(input: {
  projectId: string;
  slotKey: string;
  productId: string | null;
  quantity?: number;
}) {
  const project = await prisma.roomProject.findUnique({
    where: { id: input.projectId },
    select: { id: true, sceneJson: true },
  });
  if (!project) throw new Error("Proyecto no encontrado");

  const scene = parseScene(project.sceneJson);
  if (!scene) throw new Error("Escena inválida");

  let productMeta: {
    name: string | null;
    brand: string | null;
    imageUrl: string | null;
    sizeCm: ProductSizeCm | null;
    proxyKey: string | null;
    designRole: string | null;
    coverage: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  } = {
    name: null,
    brand: null,
    imageUrl: null,
    sizeCm: null,
    proxyKey: null,
    designRole: null,
    coverage: Prisma.JsonNull,
  };

  if (input.productId) {
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      select: {
        normalizedName: true,
        widthCm: true,
        heightCm: true,
        depthCm: true,
        brand: { select: { name: true } },
        designProfile: true,
        images: {
          where: { isPrimary: true },
          select: { url: true },
          take: 1,
        },
      },
    });
    if (!product) throw new Error("Producto no encontrado");
    productMeta = {
      name: product.normalizedName,
      brand: product.brand?.name ?? null,
      imageUrl: product.images[0]?.url ?? null,
      sizeCm: productSizeCm(product),
      proxyKey:
        product.designProfile?.designRole === "display"
          ? displayProxyKey({ diagonalIn: product.designProfile.diagonalIn, name: product.normalizedName, widthCm: product.widthCm })
          : null,
      designRole: product.designProfile?.designRole ?? null,
      coverage: product.designProfile
        ? ({
            source:
              product.designProfile.hfovDeg != null ||
              product.designProfile.coverageRadiusM != null ||
              product.designProfile.viewingDistanceMaxM != null
                ? "datasheet"
                : "missing",
            hfovDeg:
              product.designProfile.hfovDeg == null
                ? undefined
                : Number(product.designProfile.hfovDeg),
            vfovDeg:
              product.designProfile.vfovDeg == null
                ? undefined
                : Number(product.designProfile.vfovDeg),
            maxRangeM:
              product.designProfile.maxRangeM == null
                ? undefined
                : Number(product.designProfile.maxRangeM),
            micRadiusM:
              product.designProfile.coverageRadiusM == null
                ? undefined
                : Number(product.designProfile.coverageRadiusM),
            viewMinM:
              product.designProfile.viewingDistanceMinM == null
                ? undefined
                : Number(product.designProfile.viewingDistanceMinM),
            viewMaxM:
              product.designProfile.viewingDistanceMaxM == null
                ? undefined
                : Number(product.designProfile.viewingDistanceMaxM),
          } as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    };
  }

  scene.devices = scene.devices.map((d) =>
    d.slotKey === input.slotKey
      ? {
          ...d,
          productId: input.productId,
          productName: productMeta.name,
          brandName: productMeta.brand,
          imageUrl: productMeta.imageUrl,
          sizeCm: productMeta.sizeCm,
          proxyKey: productMeta.proxyKey,
          quantity: input.quantity ?? d.quantity,
          coverage:
            productMeta.coverage === Prisma.JsonNull
              ? null
              : (productMeta.coverage as unknown as NonNullable<
                  (typeof d)["coverage"]
                >),
        }
      : d,
  );

  const device = await prisma.roomProjectDevice.findFirst({
    where: { roomProjectId: input.projectId, slotKey: input.slotKey },
  });

  if (device) {
    await prisma.roomProjectDevice.update({
      where: { id: device.id },
      data: {
        productId: input.productId,
        quantity: input.quantity ?? device.quantity,
        designRole: productMeta.designRole ?? device.designRole,
        coverageJson: productMeta.coverage,
      },
    });
  } else {
    const slot = scene.slots.find((s) => s.key === input.slotKey);
    await prisma.roomProjectDevice.create({
      data: {
        roomProjectId: input.projectId,
        slotKey: input.slotKey,
        productId: input.productId,
        designRole: productMeta.designRole ?? slot?.role ?? null,
        quantity: input.quantity ?? slot?.defaultQty ?? 1,
        poseJson: (slot?.pose ?? { x: 0, y: 0, z: 0, rotY: 0 }) as object,
        coverageJson: productMeta.coverage,
      },
    });
  }

  await updateRoomProjectScene(input.projectId, scene);
  return getRoomProject(input.projectId);
}

export async function deleteRoomProject(id: string) {
  return prisma.roomProject.delete({ where: { id } });
}
