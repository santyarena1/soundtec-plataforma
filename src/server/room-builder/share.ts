/**
 * Enlace de solo lectura para el cliente (/p/[token]): resuelve el token a un
 * proyecto vigente. Lo usan la página pública, su tarjeta al compartir y la
 * descarga de láminas. Un token desactivado o vencido es como si no existiera.
 */

import { prisma } from "@/lib/prisma";
import { ensureRoomBuilderSchema } from "@/services/room-builder/ensure-schema";

/** Formato del token (24 caracteres URL-safe; se acepta un rango por si cambia el largo). */
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export type SharedProject = { id: string; name: string; kind: string; updatedAt: Date; expiresAt: Date | null };

export async function findSharedProject(token: string): Promise<SharedProject | null> {
  if (!TOKEN_RE.test(token)) return null;
  await ensureRoomBuilderSchema();
  const p = await prisma.roomProject.findUnique({ where: { shareToken: token }, select: { id: true, name: true, kind: true, updatedAt: true, shareExpiresAt: true } });
  if (!p) return null;
  if (p.shareExpiresAt && p.shareExpiresAt < new Date()) return null;
  return { id: p.id, name: p.name, kind: p.kind, updatedAt: p.updatedAt, expiresAt: p.shareExpiresAt };
}

/**
 * Suma una visita al enlace (sin esperar ni fallar la página si la base no
 * responde). En SQL directo: con Prisma se tocaría updatedAt y el proyecto
 * subiría en la lista como si alguien lo hubiera editado.
 */
export function countShareView(projectId: string): void {
  void prisma.$executeRaw`UPDATE "RoomProject" SET "shareViews" = "shareViews" + 1 WHERE "id" = ${projectId}`.catch((error: unknown) => console.error(`[room-builder/share] visita ${projectId}`, error));
}
