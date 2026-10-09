/**
 * Proyecto completo desde un plano: un proyecto contenedor con el plano y,
 * adentro, un ambiente por cada recuadro detectado (medidas reales,
 * equipos según su tipo y las preferencias comunes).
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { initialBrief } from "@/components/room-builder/wizard/wizard-data";
import type { BrandGroup, BriefControl, BriefTier, BriefVcPlatform, RoomBrief } from "./brief";
import { ensureRoomBuilderSchema } from "./ensure-schema";
import { PLAN_KIND_CATEGORY, type PlanBox, type PlanKind } from "./plan-analysis";
import { createSpaceProject, getRoomProject } from "./project-service";
import { getRoomTemplate } from "./templates";

export type PlanRoomInput = { name: string; templateKey: string; box: PlanBox; widthM: number; depthM: number };

export type PlanProjectInput = {
  ownerId: string;
  name: string;
  kind: PlanKind;
  image: { data: Buffer; widthPx: number; heightPx: number };
  heightM: number;
  control: BriefControl;
  vcPlatform: BriefVcPlatform | null;
  tier: BriefTier;
  brands: Partial<Record<BrandGroup, string[]>>;
  rooms: PlanRoomInput[];
};

/** Ambiente del proyecto contenedor ubicado sobre el plano. */
export type PlanRoomLink = { projectId: string; name: string; templateKey: string; box: PlanBox };

const MIN_SIDE_M = 1.5;
const MAX_SIDE_M = 80;
const clampSide = (n: number) => Math.min(MAX_SIDE_M, Math.max(MIN_SIDE_M, Math.round(n * 10) / 10));

/** Respuestas del asistente para un ambiente, con lo común del proyecto. */
export function briefForPlanRoom(category: string, templateKey: string, common: Pick<PlanProjectInput, "control" | "vcPlatform" | "tier" | "brands">): RoomBrief {
  const base = initialBrief(category, templateKey);
  const wantsControl = common.control !== "none";
  const systems = wantsControl
    ? [...new Set([...base.systems, "control" as const])]
    : base.systems.filter((s) => s !== "control" && s !== "lighting" && s !== "shades");
  return {
    ...base,
    systems: systems.length ? systems : ["audio"],
    control: wantsControl ? common.control : "none",
    vcPlatform: systems.includes("vc") ? (common.vcPlatform ?? base.vcPlatform ?? "teams") : null,
    tier: common.tier,
    brands: common.brands,
  };
}

export async function createProjectFromPlan(input: PlanProjectInput) {
  await ensureRoomBuilderSchema();
  const rooms = input.rooms.filter((r) => getRoomTemplate(r.templateKey));
  if (!rooms.length) throw new Error("Elegí al menos un ambiente con equipos");
  const category = PLAN_KIND_CATEGORY[input.kind];

  const hub = await prisma.roomProject.create({
    data: {
      name: input.name,
      kind: "hub",
      templateKey: "plan",
      category,
      sizePreset: null,
      areaM2: 0,
      heightM: input.heightM,
      platform: input.control === "crestron-home" ? "crestron-home" : null,
      unitCount: 1,
      status: "draft",
      visibility: "private",
      sceneJson: { version: 1, templateKey: "plan", widthM: 0, depthM: 0, heightM: 0, areaM2: 0, cameraPreset: "plan", coverageView: "off", selectedSlotKey: null, slots: [], devices: [] },
      ownerId: input.ownerId,
    },
  });

  await prisma.roomPlanImage.create({
    data: { roomProjectId: hub.id, data: input.image.data, mimeType: "image/webp", widthPx: input.image.widthPx, heightPx: input.image.heightPx },
  });

  const links: PlanRoomLink[] = [];
  let totalArea = 0;
  for (const room of rooms) {
    const template = getRoomTemplate(room.templateKey);
    if (!template) continue;
    const widthM = clampSide(room.widthM);
    const depthM = clampSide(room.depthM);
    totalArea += widthM * depthM;
    const space = await createSpaceProject({
      ownerId: input.ownerId,
      name: room.name,
      templateKey: template.key,
      widthM,
      depthM,
      heightM: input.heightM,
      areaM2: widthM * depthM,
      parentId: hub.id,
      brief: briefForPlanRoom(template.category, template.key, input),
    });
    links.push({ projectId: space.id, name: room.name, templateKey: template.key, box: room.box });
  }

  const imageUrl = `/api/admin/room-builder/projects/${hub.id}/plan-image?v=${Date.now()}`;
  await prisma.roomProject.update({
    where: { id: hub.id },
    data: {
      areaM2: Math.round(totalArea * 100) / 100,
      sceneJson: {
        version: 1,
        templateKey: "plan",
        widthM: 0,
        depthM: 0,
        heightM: 0,
        areaM2: 0,
        cameraPreset: "plan",
        coverageView: "off",
        selectedSlotKey: null,
        slots: [],
        devices: [],
        planImage: { url: imageUrl, widthPx: input.image.widthPx, heightPx: input.image.heightPx },
        planRooms: links,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return getRoomProject(hub.id);
}
