"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/services/ai-assistant/rate-limit";
import { accountRequestSchema } from "@/lib/expo/account-request-schema";
import { ACTIVATION_TTL_MS, createActivationToken } from "@/lib/expo/activation-token";
import { formatCuit } from "@/lib/expo/cuit";
import { LEAD_COOKIE, QR_COOKIE, VISITOR_COOKIE } from "@/lib/expo/visitor-cookies";
import { findQrWithEvent, recordVisit } from "@/server/expo/visits";
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
  const qr = await findQrWithEvent(store.get(QR_COOKIE)?.value).catch(() => null);

  await prisma.accountRequest.create({
    data: {
      ...data,
      leadId: store.get(LEAD_COOKIE)?.value ?? null,
      qrId: qr?.id ?? null,
      visitorId: visitorId ?? null,
    },
  });
  await recordVisit({ visitorId, qrId: qr?.id, type: "ACCOUNT_REQUEST" });

  const to = await accountRequestRecipients();
  if (to.length) {
    const text = `Nueva solicitud de cuenta\n\n${data.fullName} — ${data.company} (CUIT ${formatCuit(data.cuit)})\n${data.email} · ${data.phone}\nActividad: ${data.activity}${data.activityOther ? ` (${data.activityOther})` : ""}\n\nRevisala en /admin/account-requests`;
    await sendMail({ to, subject: `Nueva solicitud de cuenta: ${data.company}`, text, html: text.replace(/\n/g, "<br>") });
  }
  return { ok: true };
}

/** Datos para precargar el formulario desde el lead de la bienvenida. */
export async function getAccountRequestPrefill(): Promise<{ fullName?: string; email?: string; phone?: string; company?: string }> {
  const store = await cookies();
  const leadId = store.get(LEAD_COOKIE)?.value;
  if (!leadId) return {};
  const lead = await prisma.visitorLead.findUnique({ where: { id: leadId } }).catch(() => null);
  if (!lead) return {};
  return { fullName: lead.name ?? undefined, email: lead.email, phone: lead.phone ?? undefined, company: lead.company ?? undefined };
}

export type ApproveResult = { ok: true; activationUrl: string; mailSent: boolean } | { ok: false; error: string };

function appUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.soundtecportal.com.ar").replace(/\/$/, "");
}

/** Aprobar: crea Client + contacto + User (sin contraseña usable) + token de activación. */
export async function approveAccountRequest(id: string): Promise<ApproveResult> {
  const { user: reviewer } = await requirePermission("clients.manage");
  const req = await prisma.accountRequest.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return { ok: false, error: "La solicitud ya fue revisada." };
  const existing = await prisma.user.findUnique({ where: { email: req.email } });
  if (existing) return { ok: false, error: `Ya existe un usuario con el mail ${req.email}.` };

  const { token, tokenHash } = createActivationToken();
  const unusablePassword = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
  const [city, ...rest] = (req.location ?? "").split(",").map((s) => s.trim());

  await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
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
    });
    await tx.clientContact.create({
      data: { clientId: client.id, name: req.fullName, email: req.email, phone: req.phone, isPrimary: true },
    });
    const user = await tx.user.create({
      data: {
        name: req.fullName, email: req.email, phone: req.phone, passwordHash: unusablePassword,
        role: "CLIENT", clientId: client.id, companyName: client.companyName,
      },
    });
    await tx.accountActivationToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS) },
    });
    await tx.accountRequest.update({
      where: { id },
      data: { status: "APPROVED", reviewedById: reviewer.id, reviewedAt: new Date(), createdClientId: client.id, createdUserId: user.id },
    });
  });

  const activationUrl = `${appUrl()}/activar/${token}`;
  const text = `Hola ${req.fullName}, tu cuenta de cliente de Soundtec está aprobada.\n\nCreá tu contraseña acá (vence en 72 horas):\n${activationUrl}`;
  const mail = await sendMail({ to: req.email, subject: "Activá tu cuenta de Soundtec", text, html: text.replace(/\n/g, "<br>") });

  revalidatePath("/admin/account-requests");
  revalidatePath("/admin/clients");
  return { ok: true, activationUrl, mailSent: mail.sent };
}

export async function rejectAccountRequest(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const { user: reviewer } = await requirePermission("clients.manage");
  const clean = reason.trim();
  if (clean.length < 3) return { ok: false, error: "Indicá el motivo." };
  const updated = await prisma.accountRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REJECTED", rejectionReason: clean.slice(0, 500), reviewedById: reviewer.id, reviewedAt: new Date() },
  });
  if (!updated.count) return { ok: false, error: "La solicitud ya fue revisada." };
  revalidatePath("/admin/account-requests");
  return { ok: true };
}
