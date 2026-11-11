"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { newInviteCode, parseInviteSheet, parseInviteText, type InviteRow } from "@/lib/forms/invites";
import { checkInviteInbox, sendInviteBatch, type SendMode } from "@/lib/forms/invite-mailer";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_INVITES = 2000;

async function guard() {
  return requireStaff("forms.manage");
}

function revalidate(formId: string) {
  revalidatePath(`/admin/forms/${formId}/invitados`);
}

/** Agrega invitados nuevos (los mails que ya estaban se completan con nombre y empresa si faltaban). */
async function addRows(formId: string, rows: InviteRow[]): Promise<{ added: number; updated: number }> {
  const existing = await prisma.formInvite.findMany({ where: { formId }, select: { id: true, email: true, name: true, company: true } });
  if (existing.length + rows.length > MAX_INVITES) throw new Error(`Hasta ${MAX_INVITES} invitados por formulario.`);
  const byEmail = new Map(existing.map((e) => [e.email, e]));
  let added = 0;
  let updated = 0;
  for (const row of rows) {
    const current = byEmail.get(row.email);
    if (current) {
      const data = { name: current.name || row.name || null, company: current.company || row.company || null };
      if (data.name !== current.name || data.company !== current.company) {
        await prisma.formInvite.update({ where: { id: current.id }, data });
        updated += 1;
      }
      continue;
    }
    await prisma.formInvite.create({ data: { formId, email: row.email, name: row.name?.slice(0, 200) || null, company: row.company?.slice(0, 200) || null, code: newInviteCode() } });
    added += 1;
  }
  return { added, updated };
}

export async function importInvitesFile(formData: FormData): Promise<Result<{ added: number; updated: number; skipped: number }>> {
  await guard();
  const formId = String(formData.get("formId") ?? "");
  const file = formData.get("file");
  if (!formId || !(file instanceof File)) return { ok: false, error: "Elegí el archivo de Excel." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "El archivo es muy grande (máximo 5 MB)." };
  if (!(await prisma.form.findUnique({ where: { id: formId }, select: { id: true } }))) return { ok: false, error: "Ese formulario ya no existe." };
  let parsed: ReturnType<typeof parseInviteSheet>;
  try {
    parsed = parseInviteSheet(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "No pude leer el archivo. Tiene que ser Excel (.xlsx, .xls) o CSV." };
  }
  if (!parsed.rows.length) return { ok: false, error: "No encontré mails en el archivo. ¿Tiene una columna Email o Correo?" };
  try {
    const result = await addRows(formId, parsed.rows);
    revalidate(formId);
    return { ok: true, ...result, skipped: parsed.skipped };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo importar." };
  }
}

export async function addInvitesText(input: { formId: string; text: string }): Promise<Result<{ added: number; updated: number }>> {
  await guard();
  const rows = parseInviteText(input.text.slice(0, 200_000));
  if (!rows.length) return { ok: false, error: "No encontré mails válidos." };
  try {
    const result = await addRows(input.formId, rows);
    revalidate(input.formId);
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo agregar." };
  }
}

export async function removeInvites(input: { formId: string; ids: string[] }): Promise<Result<{ removed: number }>> {
  await guard();
  const { count } = await prisma.formInvite.deleteMany({ where: { formId: input.formId, id: { in: input.ids.slice(0, MAX_INVITES) } } });
  revalidate(input.formId);
  return { ok: true, removed: count };
}

/** Una tanda de envío. La pantalla la llama de nuevo (con pausa) hasta que no quedan pendientes. */
export async function sendInvitesBatch(input: { formId: string; mode: SendMode; startedAt: string }): Promise<Result<{ sent: number; failed: number; remaining: number; warning?: string }>> {
  await guard();
  const startedAt = new Date(input.startedAt);
  if (Number.isNaN(startedAt.getTime())) return { ok: false, error: "Fecha inválida." };
  const form = await prisma.form.findUnique({ where: { id: input.formId }, select: { status: true } });
  if (!form) return { ok: false, error: "Ese formulario ya no existe." };
  if (form.status !== "OPEN") return { ok: false, error: "Pasá el formulario a Abierto antes de mandar las invitaciones: si no, el enlace dice que todavía no está abierto." };
  const result = await sendInviteBatch(input.formId, input.mode, startedAt);
  revalidate(input.formId);
  if (result.error && result.sent === 0 && result.failed === 0) return { ok: false, error: result.error };
  return { ok: true, sent: result.sent, failed: result.failed, remaining: result.error ? 0 : result.remaining, warning: result.error };
}

export async function checkInvitesInbox(input: { formId: string }): Promise<Result<{ replies: number; bounces: number }>> {
  await guard();
  const result = await checkInviteInbox(input.formId);
  revalidate(input.formId);
  if (result.error) return { ok: false, error: result.error };
  return { ok: true, replies: result.replies, bounces: result.bounces };
}
