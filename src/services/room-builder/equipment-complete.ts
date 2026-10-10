/**
 * Completar equipos (como un integrador): suma lo que el sistema necesita y
 * todavía no tiene, con productos reales del catálogo y las marcas elegidas.
 *
 * - Equipamiento central del proyecto (amplificación por canales, procesador,
 *   streaming, switch) cuando el ambiente lo resuelve en el rack central.
 * - Lo que falta en el ambiente: amplificador o canales insuficientes,
 *   streaming, switch de red.
 * - Una fuente de video para las pantallas que no tienen ninguna (reproductor
 *   con salida HDMI confirmada en su ficha).
 *
 * No reemplaza lo que el usuario ya eligió salvo que no alcance (canales).
 */

import { prisma } from "@/lib/prisma";
import { analyzeHubSystem, setCentralDevice } from "./project-system-db";
import { getRoomProject } from "./project-service";
import { parseScene } from "./scene";
import { addProductToProject, analyzeProjectSystem } from "./system-check-db";

export type AppliedEquipment = { label: string; scope: "central" | "room" };
export type CompleteResult = { applied: AppliedEquipment[]; pending: string[] };

/** Faltantes del ambiente que se resuelven solos (no cambian elecciones del usuario). */
const AUTO_ROOM_FINDINGS = new Set(["amp-missing", "amp-channels", "stream-missing", "net-switch"]);
/** Nombres de reproductores de video que puede haber en el catálogo. */
const PLAYER_TERMS = ["BrightSign", "media player", "reproductor", "Apple TV", "Fire TV", "Chromecast", "Android TV", "signage player"];
const PLAYER_CANDIDATES = 40;

type IoPort = { direction?: string; signal?: string; count?: number };

const hasPort = (ports: unknown, direction: "in" | "out" | "bidir", signal: string) =>
  Array.isArray(ports) && (ports as IoPort[]).some((p) => p.signal === signal && (p.direction === direction || p.direction === "bidir"));

/** Hub: pone el equipamiento central que falta (amplificación, procesador, streaming, switch). */
async function completeCentral(hubId: string): Promise<AppliedEquipment[]> {
  const view = await analyzeHubSystem(hubId);
  if (!view) return [];
  const applied: AppliedEquipment[] = [];
  for (const f of view.findings) {
    if (f.level !== "error" && f.level !== "warn") continue;
    const action = f.actions[0];
    if (!action) continue;
    await setCentralDevice(hubId, action.slotKey, action.productId, action.quantity);
    applied.push({ label: `${action.label.replace(/^(Agregar|Usar|Cambiar a)\s+/i, "")}${action.quantity > 1 ? ` ×${action.quantity}` : ""}`, scope: "central" });
  }
  return applied;
}

/** Ambiente: amplificador / canales / streaming / switch que falten. */
async function completeRoom(spaceId: string): Promise<AppliedEquipment[]> {
  const check = await analyzeProjectSystem(spaceId);
  if (!check) return [];
  const { assignProductToSlot } = await import("./project-service");
  const applied: AppliedEquipment[] = [];
  for (const f of check.findings) {
    if ((f.level !== "error" && f.level !== "warn") || !AUTO_ROOM_FINDINGS.has(f.id)) continue;
    const action = f.actions[0];
    if (!action) continue;
    if (action.type === "assign") await assignProductToSlot({ projectId: spaceId, slotKey: action.slotKey, productId: action.productId, quantity: action.quantity });
    else await addProductToProject(spaceId, action.productId, action.quantity);
    applied.push({ label: action.label.replace(/^(Agregar|Usar|Cambiar a)\s+/i, ""), scope: "room" });
  }
  return applied;
}

/** Pantallas sin ninguna fuente en la sala: un reproductor con salida HDMI real. */
async function completeVideoSource(spaceId: string): Promise<{ applied: AppliedEquipment[]; pending: string[] }> {
  const project = await getRoomProject(spaceId);
  const scene = project ? parseScene(project.sceneJson) : null;
  if (!scene) return { applied: [], pending: [] };
  const displays = scene.devices.filter((d) => d.designRole === "display" && d.productId);
  if (!displays.length) return { applied: [], pending: [] };
  const ids = scene.devices.map((d) => d.productId).filter((id): id is string => Boolean(id));
  const io = await prisma.productIoProfile.findMany({ where: { productId: { in: ids } }, select: { productId: true, ports: true } });
  const displayIds = new Set(displays.map((d) => d.productId));
  // Cualquier equipo de la sala que no sea pantalla y saque HDMI ya es una fuente.
  const hasSource = io.some((r) => !displayIds.has(r.productId) && (hasPort(r.ports, "out", "hdmi") || hasPort(r.ports, "out", "hdbaset")));
  if (hasSource || scene.devices.some((d) => d.designRole === "codec")) return { applied: [], pending: [] };

  const candidates = await prisma.product.findMany({
    where: { isActive: true, isDiscontinued: false, OR: PLAYER_TERMS.map((t) => ({ normalizedName: { contains: t, mode: "insensitive" as const } })), ioProfile: { status: { in: ["auto", "approved"] } } },
    select: { id: true, normalizedName: true, brand: { select: { name: true } }, ioProfile: { select: { ports: true } } },
    take: PLAYER_CANDIDATES,
  });
  const player = candidates.find((p) => hasPort(p.ioProfile?.ports, "out", "hdmi") && !hasPort(p.ioProfile?.ports, "in", "hdmi"));
  if (!player) return { applied: [], pending: ["Fuente de video para la pantalla: no hay en el catálogo un reproductor con salida HDMI confirmada en su ficha."] };
  await addProductToProject(spaceId, player.id, displays.reduce((n, d) => n + Math.max(1, d.quantity || 1), 0));
  return { applied: [{ label: `${player.brand?.name ? `${player.brand.name} ` : ""}${player.normalizedName} (fuente de video)`, scope: "room" }], pending: [] };
}

/** Completa el ambiente y, si resuelve en el rack central, el equipamiento del proyecto. */
export async function completeSpaceEquipment(spaceId: string): Promise<CompleteResult> {
  const project = await getRoomProject(spaceId);
  if (!project || project.kind === "hub") throw new Error("Ambiente no encontrado");
  const applied: AppliedEquipment[] = [];
  if (project.parentId) applied.push(...(await completeCentral(project.parentId)));
  applied.push(...(await completeRoom(spaceId)));
  const video = await completeVideoSource(spaceId);
  applied.push(...video.applied);
  return { applied, pending: video.pending };
}

/** Proyecto desde plano: deja resuelto el equipamiento central al generarlo. */
export async function completeHubEquipment(hubId: string): Promise<AppliedEquipment[]> {
  return completeCentral(hubId);
}
