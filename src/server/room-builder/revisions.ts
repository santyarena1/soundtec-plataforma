/**
 * Revisiones de las láminas guardadas en la base (RoomProject.revisionsJson).
 * Un ambiente de un proyecto que no emitió revisiones propias usa las del
 * proyecto (es la misma documentación). Se escriben en SQL directo para no
 * tocar updatedAt: emitir una revisión no es editar el diseño.
 */

import { prisma } from "@/lib/prisma";
import { ensureRoomBuilderSchema } from "@/services/room-builder/ensure-schema";
import { appendRevision, parseRevisions, type Revision, type RevisionStatus } from "@/services/room-builder/revisions";

export type ProjectRevisions = {
  /** Proyecto o ambiente dueño del historial que se muestra. */
  ownerId: string;
  /** true si el historial es del proyecto (el ambiente no emitió propias). */
  inherited: boolean;
  list: Revision[];
};

export async function loadRevisions(projectId: string): Promise<ProjectRevisions> {
  await ensureRoomBuilderSchema();
  const p = await prisma.roomProject.findUnique({ where: { id: projectId }, select: { revisionsJson: true, parentId: true, parent: { select: { revisionsJson: true } } } });
  if (!p) throw new Error("Proyecto no encontrado");
  const own = parseRevisions(p.revisionsJson);
  if (own.length || !p.parentId) return { ownerId: projectId, inherited: false, list: own };
  const parent = parseRevisions(p.parent?.revisionsJson);
  return parent.length ? { ownerId: p.parentId, inherited: true, list: parent } : { ownerId: projectId, inherited: false, list: [] };
}

async function save(projectId: string, list: Revision[]): Promise<void> {
  const json = JSON.stringify(list);
  await prisma.$executeRaw`UPDATE "RoomProject" SET "revisionsJson" = ${json}::jsonb WHERE "id" = ${projectId}`;
}

/** Emite la revisión siguiente en el proyecto o ambiente (siempre en su propio historial). */
export async function issueRevision(projectId: string, input: { author: string; description: string; status: RevisionStatus }): Promise<Revision[]> {
  await ensureRoomBuilderSchema();
  const p = await prisma.roomProject.findUnique({ where: { id: projectId }, select: { revisionsJson: true } });
  if (!p) throw new Error("Proyecto no encontrado");
  const list = appendRevision(parseRevisions(p.revisionsJson), input);
  await save(projectId, list);
  return list;
}

/** Anula la última emisión (solo la última: el historial no se reescribe por el medio). */
export async function removeLastRevision(projectId: string, code: string): Promise<Revision[]> {
  await ensureRoomBuilderSchema();
  const p = await prisma.roomProject.findUnique({ where: { id: projectId }, select: { revisionsJson: true } });
  if (!p) throw new Error("Proyecto no encontrado");
  const list = parseRevisions(p.revisionsJson);
  if (list[list.length - 1]?.code !== code) throw new Error("Solo se puede anular la última revisión emitida");
  const next = list.slice(0, -1);
  await save(projectId, next);
  return next;
}
