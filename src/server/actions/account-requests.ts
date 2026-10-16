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
import { z } from "zod";
import { ACTIVITY_OPTIONS, accountRequestSchema } from "@/lib/expo/account-request-schema";
import { ACTIVATION_TTL_MS, createActivationToken } from "@/lib/expo/activation-token";
import { cuitVariants, formatCuit, isValidCuit, normalizeCuit } from "@/lib/expo/cuit";
import { textToHtml } from "@/lib/expo/html";
import { LEAD_COOKIE, QR_COOKIE, VISITOR_COOKIE } from "@/lib/expo/visitor-cookies";
import { findLiveQr, recordVisit } from "@/server/expo/visits";
import { accountRequestRecipients, sendMail } from "@/server/mailer";
import { requireStaff } from "@/lib/auth-helpers";
import { replaceClientDiscounts } from "@/server/clients/conditions";

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
  passwordHash: string,
  options: ApproveOptions
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
        source: req.origin === "staff" ? "Alta pedida por el equipo" : "Solicitud web",
        notes: [req.comment, req.staffNote ? `Nota del vendedor: ${req.staffNote}` : null].filter(Boolean).join("\n\n") || null,
        // El vendedor que pidió el alta queda como responsable del cliente.
        ownerId: req.requestedById ?? null,
        lastActivityAt: new Date(),
      },
      select: { id: true, companyName: true },
    }));
  if (options.discountPercent && options.discountPercent > 0 && !existing) {
    await replaceClientDiscounts(tx, client.id, client.companyName, [{ target: "ALL", targetId: null, percent: options.discountPercent }], {
      brands: new Map(),
      categories: new Map(),
    });
  }
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

export type ApproveOptions = { discountPercent?: number | null };

/** Aprobar: crea Client (o vincula el existente por CUIT) + contacto + User + token de activación. */
export async function approveAccountRequest(id: string, options: ApproveOptions = {}): Promise<ApproveResult> {
  const { user: reviewer } = await requireStaff("account_requests.review");
  const discount = options.discountPercent != null && Number.isFinite(options.discountPercent) ? Math.min(90, Math.max(0, options.discountPercent)) : null;
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
    result = await prisma.$transaction((tx) => createAccountFor(tx, current, reviewer.id, activation.tokenHash, unusablePassword, { discountPercent: discount }));
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
  await requireStaff("account_requests.review");
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
  const { user: reviewer } = await requireStaff("account_requests.review");
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

const staffRequestSchema = z.object({
  company: z.string().trim().min(2, "Ingresá la empresa").max(200),
  cuit: z.string().trim().refine(isValidCuit, "CUIT inválido").transform(normalizeCuit),
  fullName: z.string().trim().min(3, "Ingresá nombre y apellido del contacto").max(160),
  email: z.string().trim().toLowerCase().email("Mail inválido").max(200),
  phone: z.string().trim().min(6, "Ingresá un teléfono").max(60),
  activity: z.enum(ACTIVITY_OPTIONS, { errorMap: () => ({ message: "Elegí la actividad" }) }),
  activityOther: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(160).optional().nullable(),
  website: z.string().trim().max(200).optional().nullable(),
  comment: z.string().trim().max(2000).optional().nullable(),
  proposedDiscountPercent: z.number().min(0).max(90).nullable().optional(),
  staffNote: z.string().trim().max(2000).optional().nullable(),
});

export type StaffAccountRequestInput = z.input<typeof staffRequestSchema>;

/**
 * Un vendedor pide el alta de una empresa nueva para un cliente suyo. Queda
 * pendiente hasta que un admin la aprueba (ahí se crea el cliente, a cargo
 * del vendedor, y la persona recibe su acceso al portal).
 */
export async function submitStaffAccountRequest(input: StaffAccountRequestInput): Promise<SubmitResult> {
  const { user } = await requireStaff("account_requests.create");
  const parsed = staffRequestSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: FieldErrors = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los campos", fieldErrors };
  }
  const data = parsed.data;
  if (data.activity === "Otra" && !data.activityOther) return { ok: false, error: "Contanos a qué se dedica la empresa", fieldErrors: { activityOther: "Requerido" } };
  if (await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })) {
    return { ok: false, error: "Ya existe un usuario con ese mail.", fieldErrors: { email: "Ya existe" } };
  }
  const pending = await prisma.accountRequest.findFirst({ where: { status: "PENDING", OR: [{ email: data.email }, { cuit: data.cuit }] }, select: { id: true } });
  if (pending) return { ok: false, error: "Ya hay una solicitud pendiente para esa empresa o ese mail." };

  await prisma.accountRequest.create({
    data: {
      company: data.company,
      cuit: data.cuit,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      activity: data.activity,
      activityOther: data.activityOther || null,
      location: data.location || null,
      website: data.website || null,
      comment: data.comment || null,
      origin: "staff",
      requestedById: user.id,
      proposedDiscountPercent: data.proposedDiscountPercent ?? null,
      staffNote: data.staffNote || null,
    },
  });
  await notifyAdmins({ ...data, activityOther: data.activityOther ?? null }).catch((error) => console.error("[cuentas] no se pudo avisar la solicitud", error));
  revalidatePath("/admin/account-requests");
  return { ok: true };
}
