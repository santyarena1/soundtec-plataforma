/**
 * Lo que ve el cliente en el enlace de solo lectura: cada sala con su plano a
 * escala, el diagrama de conexiones y la lista de equipos (con foto si hay),
 * SIN precios ni costos. Sale de los mismos datos que las láminas.
 */

import { prisma } from "@/lib/prisma";
import { optimizedImage } from "@/lib/image-url";
import { COTA_MARGIN_MM, planContentExtent, SCALE_BAR_BAND_MM, scaledPlanSvg } from "@/services/room-builder/sheets/plan-sheet-svg";
import { mmAtScale } from "@/services/room-builder/sheets/scale";
import { totalLength, type PortsSource } from "@/services/room-builder/sheets/sheet-model";
import { loadRoomSheet, type RoomSheet } from "./sheets/room-sheet";

/** Escala del plano en pantalla (el dibujo se adapta al ancho; la escala gráfica sigue valiendo). */
const WEB_SCALE = 50;

export type PublicDevice = { n: string; brand: string; model: string; quantity: number; location: string; ports: PortsSource; image: string | null };
export type PublicRoom = {
  id: string;
  name: string;
  dims: { widthM: number; depthM: number; heightM: number };
  planSvg: string | null;
  diagramSvg: string | null;
  devices: PublicDevice[];
  cables: number;
  meters: number;
  /** Cableado manual del plano técnico o propuesta automática (estimada). */
  source: RoomSheet["source"];
};
export type PublicProject = { name: string; clientName: string | null; rooms: PublicRoom[] };

/** Plano de la sala recortado a su contenido (sin la hoja A3 alrededor). */
function webPlanSvg(room: RoomSheet): string | null {
  if (!room.walls.length) return null;
  const ext = planContentExtent(room);
  const areaMm = { w: Math.ceil(mmAtScale(ext.widthM, WEB_SCALE) + 2 * COTA_MARGIN_MM), h: Math.ceil(mmAtScale(ext.depthM, WEB_SCALE) + 2 * COTA_MARGIN_MM + SCALE_BAR_BAND_MM) };
  return scaledPlanSvg({ floor: room.floor, walls: room.walls, furniture: room.furniture, devices: room.devices, cables: room.cables, exit: room.exit, areaMm, scale: WEB_SCALE, showTags: false });
}

/** Foto del producto achicada; las imágenes internas (sin http) no se exponen. */
const publicImage = (url: string | null | undefined) => (url && /^https?:\/\//i.test(url) ? optimizedImage(url, 256) : null);

function publicRoom(room: RoomSheet): PublicRoom {
  return {
    id: room.id,
    name: room.name,
    dims: room.dims,
    planSvg: webPlanSvg(room),
    diagramSvg: room.diagram?.svg ?? null,
    devices: room.devices.map((d) => ({ n: d.remote ? "R" : String(d.n), brand: d.brand, model: d.model, quantity: d.quantity, location: d.location, ports: d.ports, image: publicImage(d.imageUrl) })),
    cables: room.cables.length,
    meters: totalLength(room.cables),
    source: room.source,
  };
}

export async function loadPublicProject(projectId: string): Promise<PublicProject> {
  const project = await prisma.roomProject.findUnique({
    where: { id: projectId },
    select: { name: true, kind: true, client: { select: { companyName: true } }, children: { select: { id: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!project) throw new Error("Proyecto no encontrado");
  const ids = project.kind === "hub" ? project.children.map((c) => c.id) : [projectId];
  const rooms = await Promise.all(
    ids.map((id) =>
      loadRoomSheet(id).catch((error: unknown) => {
        console.error(`[room-builder/public] ambiente ${id}`, error);
        return null;
      }),
    ),
  );
  const valid = rooms.filter((r): r is RoomSheet => Boolean(r));
  return { name: project.name, clientName: project.client?.companyName ?? valid[0]?.clientName ?? null, rooms: valid.map(publicRoom) };
}
