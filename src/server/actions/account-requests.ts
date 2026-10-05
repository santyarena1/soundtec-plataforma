"use server";

import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/services/ai-assistant/rate-limit";
import { accountRequestSchema } from "@/lib/expo/account-request-schema";
import { formatCuit } from "@/lib/expo/cuit";
import { LEAD_COOKIE, QR_COOKIE, VISITOR_COOKIE } from "@/lib/expo/visitor-cookies";
import { findQrWithEvent, recordVisit } from "@/server/expo/visits";
import { accountRequestRecipients, sendMail } from "@/server/mailer";

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
