"use server";

import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { appUrl } from "@/lib/app-url";
import { ensureRoomBuilderSchema } from "@/services/room-builder/ensure-schema";

/** Vencimientos que se pueden elegir (días). */
const DAYS = [7, 30, 90] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RoomProjectShare = {
  url: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  views: number;
  /** active: vigente; expired: vencido; none: sin enlace (o desactivado). */
  state: "active" | "expired" | "none";
};

const idSchema = z.string().min(1).max(64);
const createSchema = z.object({ projectId: idSchema, days: z.union([z.literal(7), z.literal(30), z.literal(90)]) });

/** Token del enlace: 18 bytes al azar (24 caracteres URL-safe), imposible de adivinar. */
const newToken = () => randomBytes(18).toString("base64url");

const projectShareUrl = async (token: string) => `${appUrl()}/p/${token}`;

async function readShare(projectId: string): Promise<RoomProjectShare> {
  const p = await prisma.roomProject.findUnique({ where: { id: projectId }, select: { shareToken: true, shareExpiresAt: true, shareCreatedAt: true, shareViews: true } });
  if (!p) throw new Error("Proyecto no encontrado");
  if (!p.shareToken) return { url: null, expiresAt: null, createdAt: null, views: 0, state: "none" };
  return {
    url: await projectShareUrl(p.shareToken),
    expiresAt: p.shareExpiresAt?.toISOString() ?? null,
    createdAt: p.shareCreatedAt?.toISOString() ?? null,
    views: p.shareViews,
    state: p.shareExpiresAt && p.shareExpiresAt < new Date() ? "expired" : "active",
  };
}

/** Estado del enlace para el cliente de un proyecto o sala. */
export async function getRoomProjectShare(projectId: string): Promise<{ ok: true; share: RoomProjectShare } | { ok: false; error: string }> {
  await requireStaff("room_builder.use");
  const id = idSchema.safeParse(projectId);
  if (!id.success) return { ok: false, error: "Proyecto inválido." };
  try {
    await ensureRoomBuilderSchema();
    return { ok: true, share: await readShare(id.data) };
  } catch (error) {
    console.error(`[room-project-share] leer ${projectId}`, error);
    return { ok: false, error: "No se pudo leer el enlace." };
  }
}

/** Crea o renueva el enlace: un token nuevo invalida el anterior y las visitas vuelven a cero. */
export async function createRoomProjectShare(projectId: string, days: number): Promise<{ ok: true; share: RoomProjectShare } | { ok: false; error: string }> {
  await requireStaff("room_builder.use");
  const parsed = createSchema.safeParse({ projectId, days });
  if (!parsed.success) return { ok: false, error: `Elegí un vencimiento de ${DAYS.join(", ")} días.` };
  try {
    await ensureRoomBuilderSchema();
    const now = new Date();
    await prisma.roomProject.update({
      where: { id: parsed.data.projectId },
      data: { shareToken: newToken(), shareCreatedAt: now, shareExpiresAt: new Date(now.getTime() + parsed.data.days * DAY_MS), shareViews: 0 },
    });
    return { ok: true, share: await readShare(parsed.data.projectId) };
  } catch (error) {
    console.error(`[room-project-share] crear ${projectId}`, error);
    return { ok: false, error: "No se pudo crear el enlace." };
  }
}

/** Desactiva el enlace: se borra el token y la dirección deja de funcionar. */
export async function disableRoomProjectShare(projectId: string): Promise<{ ok: true; share: RoomProjectShare } | { ok: false; error: string }> {
  await requireStaff("room_builder.use");
  const id = idSchema.safeParse(projectId);
  if (!id.success) return { ok: false, error: "Proyecto inválido." };
  try {
    await ensureRoomBuilderSchema();
    await prisma.roomProject.update({ where: { id: id.data }, data: { shareToken: null, shareExpiresAt: null, shareCreatedAt: null, shareViews: 0 } });
    return { ok: true, share: await readShare(id.data) };
  } catch (error) {
    console.error(`[room-project-share] desactivar ${projectId}`, error);
    return { ok: false, error: "No se pudo desactivar el enlace." };
  }
}
