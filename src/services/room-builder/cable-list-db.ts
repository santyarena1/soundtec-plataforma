/**
 * La lista única de cables de un ambiente, leída de la base: escena, puertos
 * de ficha y la troncal hasta el rack central del proyecto. La usan la
 * cotización, la planilla del proyecto y las láminas.
 */

import { prisma } from "@/lib/prisma";
import { cablingProfile, type CablingProfile } from "./cabling-db";
import { centralExit } from "./cabling-scene";
import { parseScene, type ProjectTechnicalSettings, type RoomScene } from "./scene";
import { roomCableList, type RoomCableList } from "./wiring/cable-list";
import type { RackTrunk } from "./wiring/model";
import { rackTrunk, type TrunkContext } from "./wiring/rack-trunk";

/** Planta del proyecto para medir troncales: plano, rack y la caja de cada ambiente. */
export async function trunkContext(hubId: string): Promise<TrunkContext | null> {
  const hub = await prisma.roomProject.findUnique({ where: { id: hubId }, select: { sceneJson: true, children: { select: { id: true, sceneJson: true }, orderBy: { createdAt: "asc" } } } });
  if (!hub) return null;
  const raw = (hub.sceneJson && typeof hub.sceneJson === "object" ? hub.sceneJson : {}) as Record<string, unknown>;
  const settings = (raw.technical ?? {}) as ProjectTechnicalSettings;
  const planRooms = Array.isArray(raw.planRooms) ? (raw.planRooms as Array<{ projectId: string; box: TrunkContext["rooms"][number]["box"] }>) : [];
  const image = (raw.planImage ?? null) as TrunkContext["image"];
  const rooms: TrunkContext["rooms"] = [];
  for (const c of hub.children) {
    const scene = parseScene(c.sceneJson);
    if (!scene) continue;
    rooms.push({ id: c.id, widthM: scene.widthM, depthM: scene.depthM, box: planRooms.find((r) => r.projectId === c.id)?.box ?? null, exit: centralExit(scene) });
  }
  return { image, rack: settings.rack ?? null, rooms, roomPos: settings.roomPos ?? {} };
}

/** Troncal del ambiente al rack (null si el ambiente no es parte de un proyecto). */
export async function roomTrunk(spaceId: string, ctx?: TrunkContext | null): Promise<RackTrunk | null> {
  if (ctx) return rackTrunk(ctx, spaceId);
  const space = await prisma.roomProject.findUnique({ where: { id: spaceId }, select: { parentId: true } });
  if (!space?.parentId) return null;
  const loaded = await trunkContext(space.parentId);
  return loaded ? rackTrunk(loaded, spaceId) : null;
}

/** Lista de cables de un ambiente con todo lo que necesita (perfil de puertos y troncal). */
export async function loadRoomCables(space: { id: string; category: string; sceneJson: unknown }, ctx?: TrunkContext | null): Promise<{ scene: RoomScene; profile: CablingProfile | null; list: RoomCableList } | null> {
  const scene = parseScene(space.sceneJson);
  if (!scene) return null;
  const profile = await cablingProfile(space.id);
  const trunk = profile?.central ? await roomTrunk(space.id, ctx) : null;
  return { scene, profile, list: roomCableList(scene, space.category, profile, trunk) };
}
