"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { audienceQuerySchema, buildRecipients } from "@/lib/mailing/audience";
import { loadQueryContacts, suppressedEmails } from "@/lib/mailing/sources";
import { guessMapping, readSheetMatrix, rowsFromMatrix, type ColumnMapping } from "@/lib/mailing/import";
import { chunk } from "@/lib/mailing/batches";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_MEMBERS = 50_000;

async function guard() {
  return requireStaff("marketing.manage");
}

function revalidate(id?: string) {
  revalidatePath("/admin/mailing/listas");
  if (id) revalidatePath(`/admin/mailing/listas/${id}`);
}

const dynamicSchema = z.object({
  id: z.string().max(60).optional(),
  name: z.string().trim().min(1, "Ponele un nombre a la lista.").max(120),
  description: z.string().max(500).default(""),
  query: audienceQuerySchema,
});

/** Lista desde la base (filtro): se recalcula cada vez que se manda, así incluye a los clientes nuevos. */
export async function saveDynamicList(input: unknown): Promise<Result<{ id: string }>> {
  const { user } = await guard();
  const parsed = dynamicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { id, name, description, query } = parsed.data;
  const data = { name, description: description || null, kind: "DYNAMIC", query: query as unknown as Prisma.InputJsonValue };
  const list = id ? await prisma.mailingList.update({ where: { id }, data }) : await prisma.mailingList.create({ data: { ...data, createdById: user.id } });
  revalidate(list.id);
  return { ok: true, id: list.id };
}

/** Cuántos mails trae un filtro (válidos, sin repetidos) y cuántos están dados de baja. */
export async function previewQuery(input: unknown): Promise<Result<{ total: number; suppressed: number; invalid: number; duplicates: number; sample: Array<{ email: string; name: string | null; company: string | null }> }>> {
  await guard();
  const parsed = audienceQuerySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Filtro inválido." };
  const contacts = await loadQueryContacts(parsed.data);
  const { recipients, stats } = buildRecipients([contacts], { suppressed: await suppressedEmails() });
  return {
    ok: true,
    total: stats.total,
    suppressed: stats.suppressed,
    invalid: stats.invalid,
    duplicates: stats.duplicates,
    sample: recipients.slice(0, 8).map((r) => ({ email: r.email, name: r.name ?? null, company: r.company ?? null })),
  };
}

async function fileFrom(formData: FormData): Promise<{ file: File } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elegí el archivo de Excel o CSV." };
  if (file.size > MAX_FILE_BYTES) return { error: "El archivo es muy grande (máximo 10 MB)." };
  return { file };
}

/** Primer paso de la importación: columnas, primeras filas y la propuesta de qué es cada columna. */
export async function previewImport(formData: FormData): Promise<Result<{ headers: string[]; sample: string[][]; totalRows: number; mapping: ColumnMapping }>> {
  await guard();
  const got = await fileFrom(formData);
  if ("error" in got) return { ok: false, error: got.error };
  try {
    const sheet = readSheetMatrix(await got.file.arrayBuffer(), got.file.name);
    if (!sheet.rows.length) return { ok: false, error: "El archivo no tiene filas." };
    return { ok: true, headers: sheet.headers, sample: sheet.rows.slice(0, 8), totalRows: sheet.rows.length, mapping: guessMapping(sheet) };
  } catch (error) {
    console.error("[mailing import preview]", error);
    return { ok: false, error: "No pude leer el archivo. Tiene que ser Excel (.xlsx, .xls) o CSV." };
  }
}

const mappingSchema = z.object({
  email: z.number().int().min(0),
  name: z.number().int().min(-1),
  lastName: z.number().int().min(-1),
  company: z.number().int().min(-1),
  extras: z.array(z.number().int().min(0)).max(20),
});

/**
 * Importa el archivo a una lista nueva (o suma a una existente). Los mails que
 * ya estaban en la lista se completan con nombre/empresa si les faltaban.
 */
export async function importList(formData: FormData): Promise<Result<{ id: string; added: number; updated: number; invalid: number; duplicates: number; invalidSamples: string[] }>> {
  const { user } = await guard();
  const got = await fileFrom(formData);
  if ("error" in got) return { ok: false, error: got.error };
  const listId = String(formData.get("listId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  let mapping: ColumnMapping;
  try {
    mapping = mappingSchema.parse(JSON.parse(String(formData.get("mapping") ?? "{}")));
  } catch {
    return { ok: false, error: "Elegí qué columna tiene el mail." };
  }
  if (!listId && !name) return { ok: false, error: "Ponele un nombre a la lista." };

  let parsed: ReturnType<typeof rowsFromMatrix>;
  let headers: string[];
  try {
    const sheet = readSheetMatrix(await got.file.arrayBuffer(), got.file.name);
    headers = sheet.headers;
    parsed = rowsFromMatrix(sheet, mapping);
  } catch {
    return { ok: false, error: "No pude leer el archivo." };
  }
  if (!parsed.contacts.length) return { ok: false, error: "No encontré mails válidos en esa columna." };

  const list = listId
    ? await prisma.mailingList.findUnique({ where: { id: listId }, select: { id: true, kind: true, extraFields: true } })
    : await prisma.mailingList.create({ data: { name, kind: "IMPORTED", createdById: user.id, description: `Importada de ${got.file.name.slice(0, 120)}` }, select: { id: true, kind: true, extraFields: true } });
  if (!list || list.kind !== "IMPORTED") return { ok: false, error: "Esa lista no existe o no es una lista importada." };

  const existing = await prisma.mailingListMember.findMany({ where: { listId: list.id }, select: { id: true, email: true, name: true, company: true } });
  if (existing.length + parsed.contacts.length > MAX_MEMBERS) return { ok: false, error: `Una lista puede tener hasta ${MAX_MEMBERS.toLocaleString("es-AR")} personas.` };
  const byEmail = new Map(existing.map((m) => [m.email, m]));
  const fresh = parsed.contacts.filter((c) => !byEmail.has(c.email));
  let updated = 0;
  for (const c of parsed.contacts) {
    const current = byEmail.get(c.email);
    if (!current) continue;
    const name = current.name || c.name || null;
    const company = current.company || c.company || null;
    if (name !== current.name || company !== current.company) {
      await prisma.mailingListMember.update({ where: { id: current.id }, data: { name, company } });
      updated += 1;
    }
  }
  for (const part of chunk(fresh, 1000)) {
    await prisma.mailingListMember.createMany({
      data: part.map((c) => ({ listId: list.id, email: c.email, name: c.name ?? null, company: c.company ?? null, fields: c.fields ? (c.fields as Prisma.InputJsonValue) : Prisma.JsonNull })),
      skipDuplicates: true,
    });
  }
  const extraFields = [...new Set([...list.extraFields, ...mapping.extras.map((i) => headers[i]).filter((h): h is string => Boolean(h))])].slice(0, 40);
  await prisma.mailingList.update({ where: { id: list.id }, data: { extraFields } });
  revalidate(list.id);
  return { ok: true, id: list.id, added: fresh.length, updated, invalid: parsed.invalid, duplicates: parsed.duplicates, invalidSamples: parsed.invalidSamples };
}

export async function renameList(input: { id: string; name: string; description?: string }): Promise<Result> {
  await guard();
  const name = input.name.trim().slice(0, 120);
  if (!name) return { ok: false, error: "Ponele un nombre." };
  await prisma.mailingList.update({ where: { id: input.id }, data: { name, description: input.description?.trim().slice(0, 500) || null } });
  revalidate(input.id);
  return { ok: true };
}

export async function deleteList(input: { id: string }): Promise<Result> {
  await guard();
  // Campañas en borrador o programadas que la usan: se avisa en vez de dejarlas sin audiencia.
  const pending = await prisma.mailCampaign.findMany({ where: { status: { in: ["DRAFT", "SCHEDULED"] } }, select: { name: true, audience: true } });
  const using = pending.filter((c) => JSON.stringify(c.audience ?? {}).includes(`"${input.id}"`)).map((c) => c.name);
  if (using.length) return { ok: false, error: `La usan estas campañas sin mandar: ${using.slice(0, 3).join(", ")}. Sacala de ahí primero.` };
  await prisma.mailingList.delete({ where: { id: input.id } }).catch(() => null);
  revalidate();
  return { ok: true };
}

export async function removeListMembers(input: { listId: string; ids: string[] }): Promise<Result<{ removed: number }>> {
  await guard();
  const { count } = await prisma.mailingListMember.deleteMany({ where: { listId: input.listId, id: { in: input.ids.slice(0, 5000) } } });
  revalidate(input.listId);
  return { ok: true, removed: count };
}
