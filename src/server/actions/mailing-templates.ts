"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { processIncomingHtml, type ProcessedHtml } from "@/lib/mailing/assets";
import { MAX_ZIP_BYTES, readTemplateZip, type IncomingFile, type TemplateWarning } from "@/lib/mailing/html-template";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_HTML_FILE_BYTES = 3 * 1024 * 1024;

async function guard() {
  return requireStaff("marketing.manage");
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Lo que mandó la pantalla: un .html, un .zip (HTML + imágenes) o código pegado. */
async function readInput(formData: FormData): Promise<{ raw: string; files?: IncomingFile[]; htmlPath?: string; fileName?: string }> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".zip")) {
      if (file.size > MAX_ZIP_BYTES) throw new Error("El .zip pesa más de 20 MB.");
      const zip = readTemplateZip(new Uint8Array(await file.arrayBuffer()));
      return { raw: zip.html, files: zip.files, htmlPath: zip.htmlPath, fileName: file.name };
    }
    if (!/\.html?$/.test(lower)) throw new Error("Subí un archivo .html o un .zip con el HTML y sus imágenes.");
    if (file.size > MAX_HTML_FILE_BYTES) throw new Error("El .html pesa más de 3 MB.");
    return { raw: await file.text(), fileName: file.name };
  }
  const code = String(formData.get("code") ?? "");
  if (!code.trim()) throw new Error("Subí un archivo o pegá el código HTML.");
  return { raw: code };
}

async function processForm(formData: FormData): Promise<ProcessedHtml & { fileName?: string }> {
  const input = await readInput(formData);
  const processed = await processIncomingHtml(input.raw, { files: input.files, htmlPath: input.htmlPath });
  return { ...processed, fileName: input.fileName };
}

export async function importTemplate(formData: FormData): Promise<Result<{ id: string; warnings: TemplateWarning[]; uploaded: number }>> {
  const { user } = await guard();
  try {
    const processed = await processForm(formData);
    const name = String(formData.get("name") ?? "").trim().slice(0, 120) || processed.fileName?.replace(/\.(zip|html?)$/i, "") || "Plantilla sin nombre";
    const description = String(formData.get("description") ?? "").trim().slice(0, 500) || null;
    const template = await prisma.mailTemplate.create({
      data: { name, description, html: processed.html, warnings: processed.warnings as unknown as Prisma.InputJsonValue, createdById: user.id },
    });
    revalidatePath("/admin/mailing/plantillas");
    return { ok: true, id: template.id, warnings: processed.warnings, uploaded: processed.uploaded };
  } catch (error) {
    console.error("[importTemplate]", error);
    return { ok: false, error: message(error, "No se pudo importar la plantilla.") };
  }
}

const saveSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().trim().min(1, "Ponele un nombre.").max(120),
  description: z.string().max(500).default(""),
  html: z.string().min(1, "El HTML está vacío.").max(4_000_000),
});

/** Guarda el código editado: se vuelve a sanear y las imágenes nuevas en base64 van a Blob. */
export async function saveTemplate(input: unknown): Promise<Result<{ html: string; warnings: TemplateWarning[] }>> {
  await guard();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    const processed = await processIncomingHtml(parsed.data.html);
    await prisma.mailTemplate.update({
      where: { id: parsed.data.id },
      data: { name: parsed.data.name, description: parsed.data.description.trim() || null, html: processed.html, warnings: processed.warnings as unknown as Prisma.InputJsonValue },
    });
    revalidatePath("/admin/mailing/plantillas");
    revalidatePath(`/admin/mailing/plantillas/${parsed.data.id}`);
    return { ok: true, html: processed.html, warnings: processed.warnings };
  } catch (error) {
    return { ok: false, error: message(error, "No se pudo guardar.") };
  }
}

export async function duplicateTemplate(input: { id: string }): Promise<Result<{ id: string }>> {
  const { user } = await guard();
  const source = await prisma.mailTemplate.findUnique({ where: { id: input.id } });
  if (!source) return { ok: false, error: "La plantilla ya no existe." };
  const copy = await prisma.mailTemplate.create({
    data: { name: `${source.name} (copia)`.slice(0, 120), description: source.description, html: source.html, warnings: (source.warnings ?? undefined) as Prisma.InputJsonValue | undefined, createdById: user.id },
  });
  revalidatePath("/admin/mailing/plantillas");
  return { ok: true, id: copy.id };
}

export async function deleteTemplate(input: { id: string }): Promise<Result> {
  await guard();
  await prisma.mailTemplate.delete({ where: { id: input.id } }).catch(() => null);
  revalidatePath("/admin/mailing/plantillas");
  return { ok: true };
}

/** HTML solo para una campaña (archivo, .zip o código pegado): no queda como plantilla. */
export async function importCampaignHtml(formData: FormData): Promise<Result<{ html: string; warnings: TemplateWarning[]; uploaded: number }>> {
  await guard();
  const campaignId = String(formData.get("campaignId") ?? "");
  const campaign = await prisma.mailCampaign.findUnique({ where: { id: campaignId }, select: { status: true } });
  if (!campaign) return { ok: false, error: "La campaña ya no existe." };
  if (!["DRAFT", "SCHEDULED"].includes(campaign.status)) return { ok: false, error: "Una campaña que ya salió no se edita." };
  try {
    const processed = await processForm(formData);
    await prisma.mailCampaign.update({ where: { id: campaignId }, data: { contentMode: "HTML", customHtml: processed.html, templateId: null } });
    revalidatePath(`/admin/mailing/${campaignId}`);
    return { ok: true, html: processed.html, warnings: processed.warnings, uploaded: processed.uploaded };
  } catch (error) {
    console.error("[importCampaignHtml]", error);
    return { ok: false, error: message(error, "No se pudo importar el HTML.") };
  }
}

/** Copia una plantilla guardada a la campaña (si después se edita la plantilla, la campaña no cambia). */
export async function applyTemplateToCampaign(input: { campaignId: string; templateId: string }): Promise<Result<{ html: string; warnings: TemplateWarning[] }>> {
  await guard();
  const [campaign, template] = await Promise.all([
    prisma.mailCampaign.findUnique({ where: { id: input.campaignId }, select: { status: true } }),
    prisma.mailTemplate.findUnique({ where: { id: input.templateId }, select: { html: true, warnings: true } }),
  ]);
  if (!campaign || !template) return { ok: false, error: "No encontré la campaña o la plantilla." };
  if (!["DRAFT", "SCHEDULED"].includes(campaign.status)) return { ok: false, error: "Una campaña que ya salió no se edita." };
  await prisma.mailCampaign.update({ where: { id: input.campaignId }, data: { contentMode: "HTML", customHtml: template.html, templateId: input.templateId } });
  revalidatePath(`/admin/mailing/${input.campaignId}`);
  return { ok: true, html: template.html, warnings: (Array.isArray(template.warnings) ? template.warnings : []) as unknown as TemplateWarning[] };
}
