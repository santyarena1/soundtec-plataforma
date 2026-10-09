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
import { boundsFromPolygon, wallsFromPolygon, type PlanModeState } from "./plan-mode";
import { normalizePolygon, planUnderlayFor, polygonBox, polygonToRoomMeters, type PlanPoint } from "./plan-polygon";
import { createSpaceProject, getRoomProject, updateRoomProjectScene } from "./project-service";
import { parseScene } from "./scene";
import { getRoomTemplate } from "./templates";

export type PlanRoomInput = { name: string; templateKey: string; box: PlanBox; polygon?: PlanPoint[]; widthM: number; depthM: number };

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
export type PlanRoomLink = { projectId: string; name: string; templateKey: string; box: PlanBox; polygon?: PlanPoint[] };

/** Ambientes que se crean a la vez (cada uno rankea productos para sus equipos). */
const CREATE_CONCURRENCY = 4;
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

  const imageUrl = `/api/admin/room-builder/projects/${hub.id}/plan-image?v=${Date.now()}`;
  // De a varios en paralelo: con muchos ambientes, uno por uno no entra en el tiempo de la función.
  const results: Array<{ link: PlanRoomLink; area: number } | null> = [];
  for (let i = 0; i < rooms.length; i += CREATE_CONCURRENCY) {
    const chunk = rooms.slice(i, i + CREATE_CONCURRENCY);
    results.push(...(await Promise.all(chunk.map((room) => createPlanSpace(room, hub.id, imageUrl, input)))));
  }
  const links = results.filter((r): r is { link: PlanRoomLink; area: number } => r != null).map((r) => r.link);
  const totalArea = results.reduce((n, r) => n + (r?.area ?? 0), 0);

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

/**
 * Lo que el ambiente toma del plano: el plano impreso en su piso (siempre) y,
 * si tiene forma libre (L, ochava…), paredes y piso con esa forma. Devuelve
 * la superficie real en m².
 */
async function applyPlanContext(
  projectId: string,
  box: PlanBox,
  polygon: PlanPoint[] | null,
  ctx: { widthM: number; depthM: number; heightM: number; imageUrl: string; image: { widthPx: number; heightPx: number } },
): Promise<number> {
  const project = await getRoomProject(projectId);
  const scene = project ? parseScene(project.sceneJson) : null;
  if (!scene) return ctx.widthM * ctx.depthM;
  const planUnderlay = planUnderlayFor(box, ctx.widthM, ctx.depthM, { url: ctx.imageUrl, widthPx: ctx.image.widthPx, heightPx: ctx.image.heightPx });
  if (!polygon) {
    await updateRoomProjectScene(projectId, { ...scene, planUnderlay });
    return ctx.widthM * ctx.depthM;
  }
  const floorPolygon = polygonToRoomMeters(polygon, ctx.widthM, ctx.depthM);
  const bounds = boundsFromPolygon(floorPolygon);
  const plan: PlanModeState = {
    enabled: true,
    imageUrl: ctx.imageUrl,
    metersPerPixel: planUnderlay.mppX,
    imageWidthPx: ctx.image.widthPx,
    imageHeightPx: ctx.image.heightPx,
    heightM: ctx.heightM,
    walls: wallsFromPolygon(floorPolygon),
    floorPolygon,
  };
  await updateRoomProjectScene(projectId, { ...scene, plan, planUnderlay, areaM2: bounds.areaM2 }, { areaM2: bounds.areaM2 });
  return bounds.areaM2;
}

/** Un ambiente del plano: sala 3D con su forma, superficie real y equipos. */
async function createPlanSpace(room: PlanRoomInput, hubId: string, imageUrl: string, input: PlanProjectInput): Promise<{ link: PlanRoomLink; area: number } | null> {
  const template = getRoomTemplate(room.templateKey);
  if (!template) return null;
  const widthM = clampSide(room.widthM);
  const depthM = clampSide(room.depthM);
  const polygon = room.polygon ? normalizePolygon(room.polygon) : null;
  // Con forma libre, las cantidades (parlantes, micrófonos) salen de la superficie real.
  const areaM2 = polygon ? boundsFromPolygon(polygonToRoomMeters(polygon, widthM, depthM)).areaM2 : widthM * depthM;
  const space = await createSpaceProject({
    ownerId: input.ownerId,
    name: room.name,
    templateKey: template.key,
    widthM,
    depthM,
    heightM: input.heightM,
    areaM2,
    parentId: hubId,
    brief: briefForPlanRoom(template.category, template.key, input),
  });
  // El recuadro de la forma (el polígono manda) para que el plano del piso calce con las paredes.
  const box = polygon ? polygonBox(polygon) : room.box;
  const area = await applyPlanContext(space.id, box, polygon, { widthM, depthM, heightM: input.heightM, imageUrl, image: input.image });
  return { link: { projectId: space.id, name: room.name, templateKey: template.key, box: room.box, ...(polygon ? { polygon } : {}) }, area };
}
