"use server";

/**
 * Revisiones de las láminas desde el panel: ver el historial, emitir la
 * siguiente (A, B, C…) con estado y descripción, y anular la última si se
 * emitió por error. El autor es quien emite (sesión del panel).
 */

import { z } from "zod";
import { checkRoomProjectAccess, ROOM_PROJECT_NOT_FOUND } from "@/server/room-builder/access";
import { issueRevision, loadRevisions, removeLastRevision } from "@/server/room-builder/revisions";
import { REVISION_STATUSES, type Revision, type RevisionStatus } from "@/services/room-builder/revisions";

export type RevisionsState = { list: Revision[]; inherited: boolean };
type Result = { ok: true; state: RevisionsState } | { ok: false; error: string };

const idSchema = z.string().min(1).max(64);
const issueSchema = z.object({
  projectId: idSchema,
  status: z.enum(REVISION_STATUSES as [RevisionStatus, ...RevisionStatus[]]),
  description: z.string().trim().min(1, "Contá qué cambió en esta emisión.").max(300),
});

export async function getRoomProjectRevisions(projectId: string): Promise<Result> {
  const access = await checkRoomProjectAccess(projectId);
  if (!access.allowed) return { ok: false, error: ROOM_PROJECT_NOT_FOUND };
  const id = idSchema.safeParse(projectId);
  if (!id.success) return { ok: false, error: "Proyecto inválido." };
  try {
    const r = await loadRevisions(id.data);
    return { ok: true, state: { list: r.list, inherited: r.inherited } };
  } catch (error) {
    console.error(`[room-project-revisions] leer ${projectId}`, error);
    return { ok: false, error: "No se pudieron leer las revisiones." };
  }
}

export async function issueRoomProjectRevision(input: { projectId: string; status: string; description: string }): Promise<Result> {
  const access = await checkRoomProjectAccess(input?.projectId);
  if (!access.allowed) return { ok: false, error: ROOM_PROJECT_NOT_FOUND };
  const { user } = access;
  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    const list = await issueRevision(parsed.data.projectId, { author: user.name || user.email || "Soundtec", description: parsed.data.description, status: parsed.data.status });
    return { ok: true, state: { list, inherited: false } };
  } catch (error) {
    console.error(`[room-project-revisions] emitir ${input.projectId}`, error);
    return { ok: false, error: "No se pudo emitir la revisión." };
  }
}

export async function removeRoomProjectRevision(projectId: string, code: string): Promise<Result> {
  const access = await checkRoomProjectAccess(projectId);
  if (!access.allowed) return { ok: false, error: ROOM_PROJECT_NOT_FOUND };
  const id = idSchema.safeParse(projectId);
  if (!id.success || !/^[A-Z]{1,3}$/.test(code)) return { ok: false, error: "Datos inválidos." };
  try {
    await removeLastRevision(id.data, code);
    // Vuelve a leer: sin propias, el ambiente muestra las del proyecto.
    const r = await loadRevisions(id.data);
    return { ok: true, state: { list: r.list, inherited: r.inherited } };
  } catch (error) {
    console.error(`[room-project-revisions] anular ${projectId}`, error);
    return { ok: false, error: error instanceof Error && error.message.startsWith("Solo") ? error.message : "No se pudo anular la revisión." };
  }
}
