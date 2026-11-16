"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { isEmail, normalizeEmail } from "@/lib/mail/address";
import { getMailingConfig, saveMailingConfig, saveMailingSecrets } from "@/lib/mailing/config";
import { createDomain, getDomain, listDomains, setDomainTracking, verifyDomain, type ResendDnsRecord } from "@/lib/mailing/resend-client";
import { sendTestEmail } from "@/lib/mailing/sender";
import { starterBlocks } from "@/lib/mailing/blocks";
import { suppress } from "@/lib/mailing/events";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function revalidate() {
  revalidatePath("/admin/mailing/configuracion");
  revalidatePath("/admin/mailing/bajas");
}

const configSchema = z.object({
  from: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .refine((v) => isEmail((v.match(/<([^>]+)>/)?.[1] ?? v).trim()), "El remitente tiene que ser «Nombre <mail@dominio>» o un mail."),
  replyTo: z.string().trim().max(200).refine((v) => !v || isEmail(v), "«Responder a» tiene que ser un mail."),
  footerCompany: z.string().trim().min(1, "Falta la razón social del pie.").max(120),
  footerAddress: z.string().trim().max(300),
  footerReason: z.string().trim().max(400),
  dailyLimit: z.coerce.number().int().min(0).max(1_000_000),
  batchSize: z.coerce.number().int().min(1).max(100),
  simulate: z.boolean(),
  domain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Dominio inválido.").max(200),
});

export async function saveMailingConfigAction(input: unknown): Promise<Result> {
  await requireStaff("marketing.manage");
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  await saveMailingConfig(parsed.data);
  revalidate();
  return { ok: true };
}

/** API key de Resend y secreto del webhook: solo administradores (como el resto de las claves). */
export async function saveMailingSecretsAction(input: { apiKey?: string; webhookSecret?: string }): Promise<Result> {
  await requireStaff("api_keys.manage");
  const apiKey = input.apiKey?.trim();
  const webhookSecret = input.webhookSecret?.trim();
  if (apiKey !== undefined && apiKey && !/^re_[A-Za-z0-9_]{8,}$/.test(apiKey)) return { ok: false, error: "La API key de Resend empieza con «re_»." };
  if (webhookSecret !== undefined && webhookSecret && !/^whsec_[A-Za-z0-9+/=]{10,}$/.test(webhookSecret)) return { ok: false, error: "El secreto del webhook empieza con «whsec_»." };
  await saveMailingSecrets({ apiKey, webhookSecret });
  revalidate();
  return { ok: true };
}

export type DomainStatus =
  | { state: "no_key" }
  | { state: "error"; error: string }
  | { state: "missing"; domain: string; others: string[] }
  | { state: "found"; id: string; domain: string; status: string; region: string | null; records: ResendDnsRecord[]; openTracking: boolean | null; clickTracking: boolean | null };

/** Estado del dominio en Resend y los registros DNS que pide (para cargarlos en Vercel). */
export async function checkDomainAction(): Promise<Result<{ status: DomainStatus }>> {
  await requireStaff("marketing.manage");
  const config = await getMailingConfig();
  if (!config.apiKey) return { ok: true, status: { state: "no_key" } };
  const list = await listDomains({ apiKey: config.apiKey, maxAttempts: 2 });
  if (!list.ok) {
    const hint = list.status === 401 || list.status === 403 ? " Si la clave es de «solo envío», creá una con acceso completo para ver el dominio desde acá." : "";
    return { ok: true, status: { state: "error", error: `${list.error}.${hint}` } };
  }
  const match = list.data.find((d) => d.name.toLowerCase() === config.domain);
  if (!match) return { ok: true, status: { state: "missing", domain: config.domain, others: list.data.map((d) => d.name) } };
  const detail = await getDomain({ apiKey: config.apiKey, maxAttempts: 2 }, match.id);
  if (!detail.ok) return { ok: true, status: { state: "error", error: detail.error } };
  return {
    ok: true,
    status: {
      state: "found",
      id: match.id,
      domain: match.name,
      status: detail.data.status,
      region: detail.data.region ?? null,
      records: detail.data.records ?? [],
      openTracking: detail.data.open_tracking ?? null,
      clickTracking: detail.data.click_tracking ?? null,
    },
  };
}

export async function createDomainAction(): Promise<Result> {
  await requireStaff("api_keys.manage");
  const config = await getMailingConfig();
  if (!config.apiKey) return { ok: false, error: "Falta la API key." };
  const result = await createDomain({ apiKey: config.apiKey, maxAttempts: 2 }, config.domain);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function verifyDomainAction(input: { id: string }): Promise<Result> {
  await requireStaff("marketing.manage");
  const config = await getMailingConfig();
  if (!config.apiKey) return { ok: false, error: "Falta la API key." };
  const result = await verifyDomain({ apiKey: config.apiKey, maxAttempts: 2 }, input.id);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function enableTrackingAction(input: { id: string }): Promise<Result> {
  await requireStaff("api_keys.manage");
  const config = await getMailingConfig();
  if (!config.apiKey) return { ok: false, error: "Falta la API key." };
  const result = await setDomainTracking({ apiKey: config.apiKey, maxAttempts: 2 }, input.id, { open: true, click: true });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** Mail de prueba con un contenido de ejemplo (para probar remitente, dominio y pie). */
export async function sendConfigTestAction(input: { to: string }): Promise<Result<{ simulated: boolean }>> {
  const { user } = await requireStaff("marketing.manage");
  const to = normalizeEmail(input.to);
  if (!isEmail(to)) return { ok: false, error: "Ese mail no es válido." };
  const result = await sendTestEmail(
    { id: "prueba", subject: "Prueba de envío desde el portal", preheader: "Si ves este mail, el envío funciona.", blocks: starterBlocks() as never },
    to,
    { email: to, name: user.name ?? "", company: user.companyName ?? "" }
  );
  return result.ok ? { ok: true, simulated: result.simulated } : { ok: false, error: result.error };
}

/** Carga a mano direcciones a las que no hay que mandar nunca (pedidos por teléfono, competencia…). */
export async function addSuppressionsAction(input: { text: string; detail?: string }): Promise<Result<{ added: number }>> {
  await requireStaff("marketing.manage");
  const emails = [...new Set(input.text.slice(0, 200_000).split(/[\s,;]+/).map(normalizeEmail).filter(isEmail))];
  if (!emails.length) return { ok: false, error: "No encontré mails válidos." };
  for (const email of emails.slice(0, 5000)) await suppress(email, "MANUAL", input.detail?.trim() || "Cargado a mano");
  revalidate();
  return { ok: true, added: emails.length };
}

/**
 * Sacar de la supresión: solo lo cargado a mano o un rebote (ej. la casilla se
 * arregló). Las bajas y las quejas de spam no se tocan: la persona pidió no recibir más.
 */
export async function removeSuppressionAction(input: { id: string }): Promise<Result> {
  await requireStaff("marketing.manage");
  const row = await prisma.mailSuppression.findUnique({ where: { id: input.id }, select: { reason: true } });
  if (!row) return { ok: true };
  if (row.reason === "UNSUBSCRIBE" || row.reason === "COMPLAINT") return { ok: false, error: "Esa persona pidió no recibir más mails: no se puede volver a agregar desde acá." };
  await prisma.mailSuppression.delete({ where: { id: input.id } });
  revalidate();
  return { ok: true };
}
