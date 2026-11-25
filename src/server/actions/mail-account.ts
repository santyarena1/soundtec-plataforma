"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth-helpers";
import { getMailAccount, saveFormsMailAccount, saveMailAccount, testMailAccount } from "@/lib/mail/account";
import { invalidRecipients, resolveReplyTo } from "@/lib/mail/transactional/envelope";
import { NOTICE_KINDS, OPTIONAL_CLIENT_KINDS } from "@/lib/mail/transactional/kinds";
import { testMail } from "@/lib/mail/transactional/messages";
import { TX_KEYS, getTransactionalSettings, saveTransactionalSettings } from "@/lib/mail/transactional/settings";
import { setSetting } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { isSimulatedTransport, processMailQueue, retryMailLog, sendRendered } from "@/server/mail/transactional";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const PAGE = "/admin/settings/correo";
const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .refine((v) => !v || z.string().email().safeParse(v).success, "El Reply-To tiene que ser un mail completo (o quedar vacío).");

const accountSchema = z.object({
  host: z.string().trim().min(3).max(200),
  user: z.string().trim().email("El usuario es la dirección de mail completa."),
  password: z.string().max(500).optional(),
  fromName: z.string().trim().min(1).max(80),
  replyTo: optionalEmail.optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  imapPort: z.coerce.number().int().min(1).max(65535),
});

/** Guarda la casilla (la contraseña va cifrada; vacía = no se cambia) y el Reply-To. */
export async function saveMailAccountAction(input: unknown): Promise<Result> {
  await requirePermission("api_keys.manage");
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { replyTo, ...account } = parsed.data;
  await saveMailAccount({ ...account, password: account.password?.trim() || undefined });
  if (replyTo !== undefined) {
    await setSetting(TX_KEYS.replyTo, resolveReplyTo(replyTo, account.user) ?? "", { description: "Reply-To de los mails del portal (vacío = responden a la casilla que manda)" });
  }
  revalidatePath(PAGE);
  return { ok: true };
}

/** Prueba la cuenta guardada: envío (SMTP) y lectura (IMAP). */
export async function testMailAccountAction(): Promise<Result<{ smtp: string | null; imap: string | null }>> {
  await requirePermission("api_keys.manage");
  const account = await getMailAccount();
  if (!account) return { ok: false, error: "Falta cargar el mail y la contraseña." };
  return { ok: true, ...(await testMailAccount(account)) };
}

/** Manda un mail de prueba real por el canal configurado (a quien lo pide, o al mail que escriba). */
export async function sendTestMailAction(input: { to?: string }): Promise<Result<{ to: string; channel: string | null; status: string; error: string | null }>> {
  const { user } = await requirePermission("api_keys.manage");
  const to = (input.to?.trim() || user.email || "").toLowerCase();
  if (!z.string().email().safeParse(to).success) return { ok: false, error: "Escribí un mail válido para la prueba." };
  const [account, settings] = await Promise.all([getMailAccount(), getTransactionalSettings()]);
  const sender = account?.user ?? (isSimulatedTransport() ? "portal@soundtec.com.ar" : "");
  const result = await sendRendered("test", to, (portalUrl) =>
    testMail({ sender: sender || "(sin casilla)", replyTo: resolveReplyTo(settings.replyTo, sender), channel: isSimulatedTransport() ? "Simulado (pruebas locales)" : "Casilla del portal (SMTP)", when: new Date() }, portalUrl)
  );
  revalidatePath(PAGE);
  return { ok: true, to, channel: result.channel, status: result.status, error: result.error };
}

const deliverySchema = z.object({
  hourlyLimit: z.coerce.number().int().min(1, "El tope por hora va de 1 a 5000.").max(5000, "El tope por hora va de 1 a 5000."),
  sentCopy: z.boolean(),
  resendFallback: z.boolean(),
  recipients: z.record(z.enum(NOTICE_KINDS), z.string().max(2000)),
  clientToggles: z.record(z.enum(Object.keys(OPTIONAL_CLIENT_KINDS) as [keyof typeof OPTIONAL_CLIENT_KINDS]), z.boolean()),
});

/** Tope por hora, copia en Enviados, respaldo por Resend, avisos internos y mails opcionales. */
export async function saveMailDeliveryAction(input: unknown): Promise<Result> {
  await requirePermission("api_keys.manage");
  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  for (const [kind, raw] of Object.entries(parsed.data.recipients)) {
    const bad = invalidRecipients(raw);
    if (bad.length) return { ok: false, error: `En «${kind}» hay direcciones que no son mails: ${bad.slice(0, 3).join(", ")}` };
  }
  const settings = await getTransactionalSettings();
  await saveTransactionalSettings({ ...parsed.data, replyTo: settings.replyTo });
  revalidatePath(PAGE);
  return { ok: true };
}

const formsSchema = z.object({
  user: z.union([z.literal(""), z.string().trim().email("El usuario es la dirección de mail completa.")]),
  password: z.string().max(500).optional(),
  fromName: z.string().trim().max(80),
});

/** Casilla propia de Formularios (vacía = usan la del portal). */
export async function saveFormsMailAccountAction(input: unknown): Promise<Result> {
  await requirePermission("api_keys.manage");
  const parsed = formsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  await saveFormsMailAccount({ user: parsed.data.user.trim().toLowerCase(), password: parsed.data.password?.trim() || undefined, fromName: parsed.data.fromName });
  revalidatePath(PAGE);
  return { ok: true };
}

/** Reintenta un envío de «Últimos envíos». */
export async function retryMailAction(id: string): Promise<Result<{ sent: boolean; error: string | null }>> {
  await requirePermission("api_keys.manage");
  if (typeof id !== "string" || id.length > 40) return { ok: false, error: "Envío inválido." };
  const outcome = await retryMailLog(id);
  revalidatePath(PAGE);
  if (!outcome.ok) return { ok: false, error: outcome.error };
  return { ok: true, sent: outcome.result.sent, error: outcome.result.error };
}

/** Reintenta todos los que fallaron, quedaron sin canal o esperan cupo (dentro del tope por hora). */
export async function retryPendingMailsAction(): Promise<Result<{ sent: number; failed: number }>> {
  await requirePermission("api_keys.manage");
  const rows = await prisma.mailLog.findMany({ where: { status: { in: ["FAILED", "SKIPPED"] }, payload: { not: null } }, orderBy: { createdAt: "asc" }, take: 30, select: { id: true } });
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const outcome = await retryMailLog(row.id);
    if (outcome.ok && outcome.result.sent) sent += 1;
    else failed += 1;
  }
  const queue = await processMailQueue(30);
  revalidatePath(PAGE);
  return { ok: true, sent: sent + queue.sent, failed: failed + queue.failed };
}
