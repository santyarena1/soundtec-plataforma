"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/services/ai-assistant/rate-limit";
import { eventStatus } from "@/lib/expo/event-status";
import {
  LEAD_COOKIE, QR_COOKIE, SKIP_COOKIE, VISITOR_COOKIE, VISITOR_COOKIE_OPTIONS,
} from "@/lib/expo/visitor-cookies";
import { findQrWithEvent, recordVisit } from "@/server/expo/visits";

export type WelcomeResult = { ok: true } | { ok: false; error: string };

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

const leadSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ingresá un mail válido").max(200),
  name: opt(160),
  company: opt(200),
  phone: opt(60),
  interest: opt(1000),
  website: z.string().max(0, "spam").optional(), // honeypot: debe venir vacío
});

export async function submitWelcomeLead(formData: FormData): Promise<WelcomeResult> {
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos" };

  const ipHash = hashIp(clientIp(await headers()));
  const limit = await consumeRateLimit(`welcome:ip:${ipHash}`, 30, 10 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "Demasiados intentos. Probá en unos minutos." };

  const store = await cookies();
  const visitorId = store.get(VISITOR_COOKIE)?.value || randomUUID();
  const qr = await findQrWithEvent(store.get(QR_COOKIE)?.value);
  const { website: _honeypot, ...data } = parsed.data;

  const lead = await prisma.visitorLead.create({
    data: { ...data, visitorId, qrId: qr?.id ?? null, eventId: qr?.eventId ?? null, source: qr ? "QR" : "WEB" },
  });
  await recordVisit({ visitorId, qrId: qr?.id, type: "LEAD" });

  store.set(VISITOR_COOKIE, visitorId, VISITOR_COOKIE_OPTIONS);
  store.set(LEAD_COOKIE, lead.id, VISITOR_COOKIE_OPTIONS);
  return { ok: true };
}

/** "Saltear": solo se permite si no hay un QR de evento vigente. */
export async function skipWelcome(): Promise<WelcomeResult> {
  const store = await cookies();
  const qr = await findQrWithEvent(store.get(QR_COOKIE)?.value);
  if (qr && eventStatus(qr.event) === "LIVE") return { ok: false, error: "Completá tu mail para continuar" };
  store.set(SKIP_COOKIE, "1", VISITOR_COOKIE_OPTIONS);
  return { ok: true };
}
