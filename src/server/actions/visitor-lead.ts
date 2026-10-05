"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/services/ai-assistant/rate-limit";
import {
  LEAD_COOKIE, QR_COOKIE, SKIP_COOKIE, VISITOR_COOKIE, VISITOR_COOKIE_OPTIONS,
} from "@/lib/expo/visitor-cookies";
import { findLiveQr, recordVisit } from "@/server/expo/visits";

export type WelcomeResult = { ok: true } | { ok: false; error: string };

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

const leadSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ingresá un mail válido").max(200),
  name: opt(160),
  company: opt(200),
  phone: opt(60),
  interest: opt(1000),
});

/** Campo trampa: invisible para personas; si viene con algo es un bot. */
const HONEYPOT_FIELD = "hp_url";

export async function submitWelcomeLead(formData: FormData): Promise<WelcomeResult> {
  if (String(formData.get(HONEYPOT_FIELD) ?? "")) return { ok: true }; // se descarta en silencio
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos" };

  const ipHash = hashIp(clientIp(await headers()));
  const limit = await consumeRateLimit(`welcome:ip:${ipHash}`, 30, 10 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "Demasiados intentos. Probá en unos minutos." };

  const store = await cookies();
  const visitorId = store.get(VISITOR_COOKIE)?.value || randomUUID();
  // Solo se atribuye al QR/evento si el evento está vigente.
  const qr = await findLiveQr(store.get(QR_COOKIE)?.value);

  const lead = await prisma.visitorLead.create({
    data: { ...parsed.data, visitorId, qrId: qr?.id ?? null, eventId: qr?.eventId ?? null, source: qr ? "QR" : "WEB" },
  });
  await recordVisit({ visitorId, qrId: qr?.id, type: "LEAD" });

  store.set(VISITOR_COOKIE, visitorId, VISITOR_COOKIE_OPTIONS);
  store.set(LEAD_COOKIE, lead.id, VISITOR_COOKIE_OPTIONS);
  return { ok: true };
}

/** "Saltear": solo se permite si no hay un QR de evento vigente. */
export async function skipWelcome(): Promise<WelcomeResult> {
  const store = await cookies();
  const qr = await findLiveQr(store.get(QR_COOKIE)?.value);
  if (qr) return { ok: false, error: "Completá tu mail para continuar" };
  store.set(SKIP_COOKIE, "1", VISITOR_COOKIE_OPTIONS);
  return { ok: true };
}
