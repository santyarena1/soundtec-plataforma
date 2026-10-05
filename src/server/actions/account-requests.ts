"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, type AccountRequest } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/services/ai-assistant/rate-limit";
import { accountRequestSchema } from "@/lib/expo/account-request-schema";
import { ACTIVATION_TTL_MS, createActivationToken } from "@/lib/expo/activation-token";
import { cuitVariants, formatCuit } from "@/lib/expo/cuit";
import { textToHtml } from "@/lib/expo/html";
import { LEAD_COOKIE, QR_COOKIE, VISITOR_COOKIE } from "@/lib/expo/visitor-cookies";
import { findLiveQr, recordVisit } from "@/server/expo/visits";
import { accountRequestRecipients, sendMail } from "@/server/mailer";
import { requirePermission } from "@/lib/auth-helpers";

export type FieldErrors = Partial<Record<string, string>>;
export type SubmitResult = { ok: true } | { ok: false; error: string; fieldErrors?: FieldErrors };

const WINDOW_MS = 60 * 60 * 1000;

export async function submitAccountRequest(formData: FormData): Promise<SubmitResult> {
  if (String(formData.get("hp") ?? "")) return { ok: true }; // honeypot: se descarta en silencio
  const parsed = accountRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: FieldErrors = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: "Revisá los campos marcados", fieldErrors };
  }
  const data = parsed.data;

  const ipHash = hashIp(clientIp(await headers()));
  const byIp = await consumeRateLimit(`acct:ip:${ipHash}`, 10, WINDOW_MS);
  const byMail = await consumeRateLimit(`acct:mail:${data.email}`, 3, WINDOW_MS);
  if (!byIp.ok || !byMail.ok) return { ok: false, error: "Ya recibimos tu pedido. Si necesitás algo más, escribinos." };

  const store = await cookies();
  const visitorId = store.get(VISITOR_COOKIE)?.value;
  // Solo se atribuye al QR si su evento está vigente.
  const qr = await findLiveQr(store.get(QR_COOKIE)?.value).catch(() => null);

  await prisma.accountRequest.create({
    data: {
      ...data,
      leadId: store.get(LEAD_COOKIE)?.value ?? null,
      qrId: qr?.id ?? null,
      visitorId: visitorId ?? null,
    },
  });
  await recordVisit({ visitorId, qrId: qr?.id, type: "ACCOUNT_REQUEST" });
  await notifyAdmins(data).catch((error) => console.error("[cuentas] no se pudo avisar la solicitud", error));
  return { ok: true };
}

type NotifyData = Pick<AccountRequest, "fullName" | "company" | "cuit" | "email" | "phone" | "activity"> & { activityOther?: string | null };

async function notifyAdmins(data: NotifyData): Promise<void> {
  const to = await accountRequestRecipients();
  if (!to.length) return;
  const text = `Nueva solicitud de cuenta\n\n${data.fullName} — ${data.company} (CUIT ${formatCuit(data.cuit)})\n${data.email} · ${data.phone}\nActividad: ${data.activity}${data.activityOther ? ` (${data.activityOther})` : ""}\n\nRevisala en /admin/account-requests`;
  await sendMail({ to, subject: `Nueva solicitud de cuenta: ${data.company}`, text, html: textToHtml(text) });
}

export type ApproveResult =
  | { ok: true; activationUrl: string; mailSent: boolean; linkedExistingClient: boolean; clientName: string }
  | { ok: false; error: string };

export type LinkResult = { ok: true; activationUrl: string } | { ok: false; error: string };

/** El error que se muestra al admin cuando otra acción ya resolvió la solicitud. */
class AlreadyReviewedError extends Error {}

const ALREADY_REVIEWED = "La solicitud ya fue revisada.";

/**
 * Crea (o reutiliza por CUIT) el cliente, el contacto, el usuario sin
 * contraseña usable y el token. Marca la solicitud solo si sigue PENDING.
 */
async function createAccountFor(
  tx: Prisma.TransactionClient,
  req: AccountRequest,
  reviewerId: string,
  tokenHash: string,
  passwordHash: string
): Promise<{ clientName: string; linkedExistingClient: boolean }> {
  const marked = await tx.accountRequest.updateMany({
    where: { id: req.id, status: "PENDING" },
    data: { status: "APPROVED", reviewedById: reviewerId, reviewedAt: new Date() },
  });
  if (marked.count === 0) throw new AlreadyReviewedError();

  const existing = await tx.client.findFirst({ where: { taxId: { in: cuitVariants(req.cuit) } }, select: { id: true, companyName: true } });
  const [city, ...rest] = (req.location ?? "").split(",").map((s) => s.trim());
  const client =
    existing ??
    (await tx.client.create({
      data: {
        companyName: req.company,
        contactName: req.fullName,
        email: req.email,
        phone: req.phone,
        taxId: req.cuit,
        website: req.website,
        city: city || null,
        province: rest.join(", ") || null,
        segment: req.activity === "Otra" ? req.activityOther : req.activity,
        source: "Solicitud web",
        notes: req.comment,
      },
      select: { id: true, companyName: true },
    }));
  await tx.clientContact.create({
    data: { clientId: client.id, name: req.fullName, email: req.email, phone: req.phone, isPrimary: !existing },
  });
  const user = await tx.user.create({
    data: {
      name: req.fullName, email: req.email, phone: req.phone, passwordHash,
      role: "CLIENT", clientId: client.id, companyName: client.companyName,
    },
  });
  await tx.accountActivationToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS) },
  });
  await tx.accountRequest.update({ where: { id: req.id }, data: { createdClientId: client.id, createdUserId: user.id } });
  return { clientName: client.companyName, linkedExistingClient: !!existing };
}

/** Manda el mail de activación. Nunca tira: si falla, el admin usa el link. */
async function sendActivationMail(to: string, name: string, activationUrl: string): Promise<boolean> {
  try {
    const text = `Hola ${name}, tu cuenta de cliente de Soundtec está aprobada.\n\nCreá tu contraseña acá (vence en 72 horas):\n${activationUrl}`;
    const mail = await sendMail({ to, subject: "Activá tu cuenta de Soundtec", text, html: textToHtml(text) });
    return mail.sent;
  } catch (error) {
    console.error("[cuentas] no se pudo enviar el mail de activación", error);
    return false;
  }
}

function friendlyApproveError(error: unknown): string {
  if (error instanceof AlreadyReviewedError) return ALREADY_REVIEWED;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = String((error.meta as { target?: unknown } | undefined)?.target ?? "");
    if (target.includes("email")) return "Ya existe un usuario con ese mail";
  }
  console.error("[cuentas] no se pudo aprobar la solicitud", error);
  return "No se pudo aprobar la solicitud. Probá de nuevo.";
}

/** Aprobar: crea Client (o vincula el existente por CUIT) + contacto + User + token de activación. */
export async function approveAccountRequest(id: string): Promise<ApproveResult> {
  const { user: reviewer } = await requirePermission("clients.manage");
  let result: { clientName: string; linkedExistingClient: boolean };
  let req: AccountRequest | null = null;
  let token: string;
  try {
    req = await prisma.accountRequest.findUnique({ where: { id } });
    if (!req || req.status !== "PENDING") return { ok: false, error: ALREADY_REVIEWED };
    const existingUser = await prisma.user.findUnique({ where: { email: req.email }, select: { id: true } });
    if (existingUser) return { ok: false, error: "Ya existe un usuario con ese mail" };
    const activation = createActivationToken();
    token = activation.token;
    const unusablePassword = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
    const current = req;
    result = await prisma.$transaction((tx) => createAccountFor(tx, current, reviewer.id, activation.tokenHash, unusablePassword));
  } catch (error) {
    return { ok: false, error: friendlyApproveError(error) };
  }

  const activationUrl = `${appUrl()}/activar/${token}`;
  const mailSent = await sendActivationMail(req.email, req.fullName, activationUrl);
  revalidatePath("/admin/account-requests");
  revalidatePath("/admin/clients");
  return { ok: true, activationUrl, mailSent, ...result };
}

/**
 * Nuevo link de activación para una solicitud aprobada (por si se perdió el
 * anterior o venció). Invalida los links sin usar de ese usuario.
 */
export async function regenerateActivationLink(requestId: string): Promise<LinkResult> {
  await requirePermission("clients.manage");
  try {
    const req = await prisma.accountRequest.findUnique({ where: { id: requestId }, select: { status: true, createdUserId: true } });
    if (!req || req.status !== "APPROVED" || !req.createdUserId) return { ok: false, error: "La solicitud no está aprobada." };
    const userId = req.createdUserId;
    const used = await prisma.accountActivationToken.findFirst({ where: { userId, usedAt: { not: null } }, select: { id: true } });
    if (used) return { ok: false, error: "El cliente ya activó su cuenta" };
    const { token, tokenHash } = createActivationToken();
    await prisma.$transaction([
      prisma.accountActivationToken.deleteMany({ where: { userId, usedAt: null } }),
      prisma.accountActivationToken.create({ data: { userId, tokenHash, expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS) } }),
    ]);
    return { ok: true, activationUrl: `${appUrl()}/activar/${token}` };
  } catch (error) {
    console.error("[cuentas] no se pudo regenerar el link de activación", error);
    return { ok: false, error: "No se pudo generar el link. Probá de nuevo." };
  }
}

export async function rejectAccountRequest(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const { user: reviewer } = await requirePermission("clients.manage");
  const clean = reason.trim();
  if (clean.length < 3) return { ok: false, error: "Indicá el motivo." };
  try {
    const updated = await prisma.accountRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED", rejectionReason: clean.slice(0, 500), reviewedById: reviewer.id, reviewedAt: new Date() },
    });
    if (!updated.count) return { ok: false, error: ALREADY_REVIEWED };
  } catch (error) {
    console.error("[cuentas] no se pudo rechazar la solicitud", error);
    return { ok: false, error: "No se pudo rechazar la solicitud. Probá de nuevo." };
  }
  revalidatePath("/admin/account-requests");
  return { ok: true };
}
