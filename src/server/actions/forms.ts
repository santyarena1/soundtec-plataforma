"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma, type FormStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { BLOB_NOT_CONFIGURED, BLOB_UPLOAD_FAILED, isBlobConfigured, uploadFile } from "@/lib/blob-storage";
import { BLOCK_LABELS, blockConfigSchema, formSettingsSchema, isBlockType, type BlockConfig, type BlockType } from "@/lib/forms/types";
import { sanitizeFormHtml } from "@/lib/forms/sanitize";

/**
 * Formularios tipo Typeform del panel (Ventas › Formularios). Se comparten por
 * un enlace secreto /f/{token}; las respuestas quedan en FormResponse.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function guard() {
  return requireStaff("forms.manage");
}

/** 24 caracteres URL-safe (144 bits): no se puede adivinar. */
function newToken(): string {
  return randomBytes(18).toString("base64url");
}

function revalidate(formId?: string) {
  revalidatePath("/admin/forms");
  if (formId) {
    revalidatePath(`/admin/forms/${formId}`);
    revalidatePath(`/admin/forms/${formId}/respuestas`);
  }
}

const DEFAULT_CONFIG: Partial<Record<BlockType, BlockConfig>> = {
  single_choice: { options: ["Opción 1", "Opción 2"] },
  multi_choice: { options: ["Opción 1", "Opción 2"] },
  dropdown: { options: ["Opción 1", "Opción 2", "Opción 3"] },
  scale: { min: 1, max: 10, minLabel: "Nada", maxLabel: "Mucho" },
  statement: { buttonLabel: "Continuar" },
  image: { buttonLabel: "Continuar" },
  video: { buttonLabel: "Continuar" },
  map: { buttonLabel: "Continuar" },
};

const DEFAULT_TITLE: Partial<Record<BlockType, string>> = {
  short_text: "¿Cuál es tu nombre y apellido?",
  email: "¿Cuál es tu email?",
  phone: "¿Un teléfono de contacto?",
  consent: "Acepto que Soundtec me contacte por este evento.",
  statement: "Título de la pantalla",
  map: "¿Dónde es?",
};

export async function createForm(input: { title: string }): Promise<Result<{ formId: string }>> {
  const { user } = await guard();
  const title = input.title.trim().slice(0, 200) || "Formulario sin título";
  const form = await prisma.form.create({
    data: {
      title,
      token: newToken(),
      createdById: user.id,
      settings: {
        welcomeTitle: title,
        welcomeButton: "Comenzar",
        endTitle: "¡Gracias!",
        endBody: "<p>Recibimos tus respuestas.</p>",
        theme: "light",
      },
      blocks: {
        create: [
          { type: "short_text", title: "¿Cuál es tu nombre y apellido?", required: true, sortOrder: 0 },
          { type: "email", title: "¿Cuál es tu email?", required: true, sortOrder: 1 },
        ],
      },
    },
    select: { id: true },
  });
  revalidate();
  return { ok: true, formId: form.id };
}

export async function updateForm(input: { formId: string; title?: string; internalNote?: string; settings?: unknown; closesAt?: string | null }): Promise<Result> {
  await guard();
  const form = await prisma.form.findUnique({ where: { id: input.formId }, select: { id: true, settings: true } });
  if (!form) return { ok: false, error: "Ese formulario ya no existe." };
  const data: Prisma.FormUpdateInput = {};
  if (input.title !== undefined) {
    const title = input.title.trim().slice(0, 200);
    if (!title) return { ok: false, error: "El formulario necesita un título." };
    data.title = title;
  }
  if (input.internalNote !== undefined) data.internalNote = input.internalNote.trim().slice(0, 2000) || null;
  if (input.settings !== undefined) {
    const parsed = formSettingsSchema.safeParse({ ...((form.settings as object) ?? {}), ...((input.settings as object) ?? {}) });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    const s = parsed.data;
    data.settings = {
      ...s,
      ...(s.welcomeBody !== undefined ? { welcomeBody: sanitizeFormHtml(s.welcomeBody) } : {}),
      ...(s.endBody !== undefined ? { endBody: sanitizeFormHtml(s.endBody) } : {}),
    } as Prisma.InputJsonValue;
  }
  if (input.closesAt !== undefined) {
    const date = input.closesAt ? new Date(input.closesAt) : null;
    if (date && Number.isNaN(date.getTime())) return { ok: false, error: "La fecha de cierre no es válida." };
    data.closesAt = date;
  }
  await prisma.form.update({ where: { id: form.id }, data });
  revalidate(form.id);
  return { ok: true };
}

export async function setFormStatus(input: { formId: string; status: FormStatus }): Promise<Result> {
  await guard();
  if (!["DRAFT", "OPEN", "CLOSED"].includes(input.status)) return { ok: false, error: "Estado inválido." };
  if (input.status === "OPEN") {
    const questions = await prisma.formBlock.count({ where: { formId: input.formId } });
    if (questions === 0) return { ok: false, error: "Agregá al menos una pregunta antes de abrirlo." };
  }
  await prisma.form.update({ where: { id: input.formId }, data: { status: input.status } });
  revalidate(input.formId);
  return { ok: true };
}

/** El enlace anterior deja de funcionar. */
export async function regenerateFormToken(input: { formId: string }): Promise<Result<{ token: string }>> {
  await guard();
  const token = newToken();
  await prisma.form.update({ where: { id: input.formId }, data: { token } });
  revalidate(input.formId);
  return { ok: true, token };
}

export async function duplicateForm(input: { formId: string }): Promise<Result<{ formId: string }>> {
  const { user } = await guard();
  const src = await prisma.form.findUnique({ where: { id: input.formId }, include: { blocks: { orderBy: { sortOrder: "asc" } } } });
  if (!src) return { ok: false, error: "Ese formulario ya no existe." };
  const copy = await prisma.form.create({
    data: {
      title: `${src.title} (copia)`,
      internalNote: src.internalNote,
      token: newToken(),
      status: "DRAFT",
      settings: (src.settings ?? undefined) as Prisma.InputJsonValue | undefined,
      createdById: user.id,
      blocks: {
        create: src.blocks.map((b) => ({ type: b.type, title: b.title, body: b.body, required: b.required, config: (b.config ?? undefined) as Prisma.InputJsonValue | undefined, sortOrder: b.sortOrder })),
      },
    },
    select: { id: true },
  });
  revalidate();
  return { ok: true, formId: copy.id };
}

export async function deleteForm(input: { formId: string }): Promise<Result> {
  await guard();
  await prisma.form.delete({ where: { id: input.formId } });
  revalidate();
  return { ok: true };
}

export async function addFormBlock(input: { formId: string; type: string; afterBlockId?: string | null }): Promise<Result<{ blockId: string }>> {
  await guard();
  if (!isBlockType(input.type)) return { ok: false, error: "Tipo de bloque desconocido." };
  const blocks = await prisma.formBlock.findMany({ where: { formId: input.formId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
  const index = input.afterBlockId ? blocks.findIndex((b) => b.id === input.afterBlockId) + 1 : blocks.length;
  const block = await prisma.$transaction(async (tx) => {
    const created = await tx.formBlock.create({
      data: {
        formId: input.formId,
        type: input.type,
        title: DEFAULT_TITLE[input.type as BlockType] ?? BLOCK_LABELS[input.type as BlockType].label,
        config: (DEFAULT_CONFIG[input.type as BlockType] ?? {}) as Prisma.InputJsonValue,
        sortOrder: index,
      },
      select: { id: true },
    });
    const order = [...blocks.slice(0, index).map((b) => b.id), created.id, ...blocks.slice(index).map((b) => b.id)];
    await Promise.all(order.map((id, i) => tx.formBlock.update({ where: { id }, data: { sortOrder: i } })));
    return created;
  });
  revalidate(input.formId);
  return { ok: true, blockId: block.id };
}

export async function updateFormBlock(input: { blockId: string; title?: string; body?: string; required?: boolean; config?: unknown; type?: string }): Promise<Result> {
  await guard();
  const block = await prisma.formBlock.findUnique({ where: { id: input.blockId }, select: { id: true, formId: true, config: true } });
  if (!block) return { ok: false, error: "Ese bloque ya no existe." };
  const data: Prisma.FormBlockUpdateInput = {};
  if (input.title !== undefined) data.title = input.title.slice(0, 500);
  if (input.body !== undefined) data.body = sanitizeFormHtml(input.body).slice(0, 20000);
  if (input.required !== undefined) data.required = input.required;
  if (input.type !== undefined) {
    if (!isBlockType(input.type)) return { ok: false, error: "Tipo de bloque desconocido." };
    data.type = input.type;
  }
  if (input.config !== undefined) {
    const parsed = blockConfigSchema.safeParse({ ...((block.config as object) ?? {}), ...((input.config as object) ?? {}) });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    const config = parsed.data;
    if (config.options) config.options = config.options.map((o) => o.trim()).filter(Boolean);
    data.config = config as Prisma.InputJsonValue;
  }
  await prisma.formBlock.update({ where: { id: block.id }, data });
  revalidate(block.formId);
  return { ok: true };
}

export async function reorderFormBlocks(input: { formId: string; blockIds: string[] }): Promise<Result> {
  await guard();
  const existing = await prisma.formBlock.findMany({ where: { formId: input.formId }, select: { id: true } });
  const ids = new Set(existing.map((b) => b.id));
  if (input.blockIds.length !== ids.size || input.blockIds.some((id) => !ids.has(id))) return { ok: false, error: "El orden no coincide con los bloques del formulario." };
  await prisma.$transaction(input.blockIds.map((id, i) => prisma.formBlock.update({ where: { id }, data: { sortOrder: i } })));
  revalidate(input.formId);
  return { ok: true };
}

export async function duplicateFormBlock(input: { blockId: string }): Promise<Result<{ blockId: string }>> {
  await guard();
  const src = await prisma.formBlock.findUnique({ where: { id: input.blockId } });
  if (!src) return { ok: false, error: "Ese bloque ya no existe." };
  const added = await addFormBlock({ formId: src.formId, type: src.type, afterBlockId: src.id });
  if (!added.ok) return added;
  await prisma.formBlock.update({
    where: { id: added.blockId },
    data: { title: src.title, body: src.body, required: src.required, config: (src.config ?? undefined) as Prisma.InputJsonValue | undefined },
  });
  revalidate(src.formId);
  return added;
}

export async function deleteFormBlock(input: { blockId: string }): Promise<Result> {
  await guard();
  const block = await prisma.formBlock.findUnique({ where: { id: input.blockId }, select: { formId: true } });
  if (!block) return { ok: true };
  await prisma.formBlock.delete({ where: { id: input.blockId } });
  revalidate(block.formId);
  return { ok: true };
}

export async function deleteFormResponse(input: { responseId: string }): Promise<Result> {
  await guard();
  const r = await prisma.formResponse.findUnique({ where: { id: input.responseId }, select: { formId: true } });
  if (!r) return { ok: true };
  await prisma.formResponse.delete({ where: { id: input.responseId } });
  revalidate(r.formId);
  return { ok: true };
}

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 45 * 1024 * 1024;

/** Sube una imagen o un video para un formulario. Devuelve la URL pública. */
export async function uploadFormMedia(formData: FormData): Promise<Result<{ url: string; kind: "image" | "video" }>> {
  await guard();
  const formId = String(formData.get("formId") || "");
  const file = formData.get("file");
  if (!formId || !(file instanceof File) || file.size === 0) return { ok: false, error: "Elegí un archivo." };
  const isImage = IMAGE_TYPES.has(file.type);
  const isVideo = VIDEO_TYPES.has(file.type);
  if (!isImage && !isVideo) return { ok: false, error: "Formato no admitido: imágenes PNG, JPG, WebP, GIF o SVG; videos MP4 o WebM." };
  if (isImage && file.size > MAX_IMAGE_BYTES) return { ok: false, error: "La imagen pesa más de 8 MB." };
  if (isVideo && file.size > MAX_VIDEO_BYTES) return { ok: false, error: "El video pesa más de 45 MB. Para videos largos, subilo a YouTube o Vimeo y pegá el enlace." };
  if (!isBlobConfigured()) return { ok: false, error: BLOB_NOT_CONFIGURED };
  const ext = (file.name.split(".").pop() || (isImage ? "png" : "mp4")).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  try {
    const url = await uploadFile(`forms/${formId}/${Date.now()}.${ext}`, Buffer.from(await file.arrayBuffer()), file.type);
    return { ok: true, url, kind: isImage ? "image" : "video" };
  } catch (error) {
    console.error("[uploadFormMedia]", error);
    return { ok: false, error: BLOB_UPLOAD_FAILED };
  }
}
