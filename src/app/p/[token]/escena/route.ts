import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { findSharedProject } from "@/server/room-builder/share";
import { hydrateRoomScene } from "@/services/room-builder/hydrate-scene";
import { parseScene, type RoomScene } from "@/services/room-builder/scene";

export const dynamic = "force-dynamic";

const LIMIT = 60;
const WINDOW_MS = 10 * 60 * 1000;
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

const httpOnly = (url: string | null | undefined) => (url && /^https?:\/\//i.test(url) ? url : null);

/**
 * Escena para el visor 3D de solo lectura: se sacan el plano del cliente
 * (imagen que sirve una ruta del panel), el brief (notas internas), el
 * cableado y los arreglos automáticos. Quedan sala, muebles y equipos.
 */
function publicScene(scene: RoomScene): RoomScene {
  return {
    ...scene,
    selectedSlotKey: null,
    coverageView: "off",
    cameraPreset: "general",
    planUnderlay: null,
    plan: scene.plan ? { ...scene.plan, imageUrl: "" } : scene.plan,
    brief: null,
    wiring: null,
    autoFixes: null,
    // Sin precios: las láminas y el BOM del enlace salen sin precio, la escena tampoco lo lleva.
    devices: scene.devices.map((d) => ({ ...d, imageUrl: httpOnly(d.imageUrl), generic: d.generic ? { ...d.generic, priceUsd: null } : d.generic })),
  };
}

/** Escena 3D de un ambiente del enlace del cliente (?sala=<id>; sin sala, el propio ambiente compartido). */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const project = await findSharedProject(params.token);
  if (!project) return NextResponse.json({ ok: false, error: "Enlace no disponible." }, { status: 404, headers });
  const rate = await consumeRateLimit(`room-project-scene:${project.id}`, LIMIT, WINDOW_MS);
  if (!rate.ok) return NextResponse.json({ ok: false, error: "Demasiadas consultas seguidas." }, { status: 429, headers });
  const roomId = new URL(req.url).searchParams.get("sala") ?? project.id;
  // Solo el ambiente compartido o uno de los ambientes del proyecto compartido.
  const room = await prisma.roomProject.findFirst({
    where: { id: roomId, kind: { not: "hub" }, OR: [{ id: project.id }, { parentId: project.id }] },
    select: { name: true, category: true, templateKey: true, heightM: true, sceneJson: true },
  });
  if (!room) return NextResponse.json({ ok: false, error: "Ambiente no encontrado." }, { status: 404, headers });
  const parsed = parseScene(room.sceneJson);
  try {
    const { scene } = hydrateRoomScene(parsed, { templateKey: room.templateKey, heightM: Number(room.heightM) || undefined });
    return NextResponse.json({ ok: true, name: room.name, category: room.category, templateKey: room.templateKey, scene: publicScene(scene) }, { headers });
  } catch (error) {
    console.error(`[p/escena] ${roomId}`, error);
    return NextResponse.json({ ok: false, error: "No se pudo leer la sala 3D." }, { status: 500, headers });
  }
}
