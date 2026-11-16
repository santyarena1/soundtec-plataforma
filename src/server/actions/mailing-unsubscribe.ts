"use server";

import { headers } from "next/headers";
import { verifyUnsubscribeToken } from "@/lib/mailing/unsubscribe-token";
import { unsubscribe } from "@/lib/mailing/events";
import { consumeRateLimit } from "@/lib/rate-limit";

/** Confirmación de la página pública /baja/[token]. No pide sesión: el token firmado alcanza. */
export async function confirmUnsubscribe(token: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const ip = (await headers()).get("x-real-ip") ?? (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "sin-ip";
  const limit = await consumeRateLimit(`baja:${ip}`, 30, 10 * 60_000);
  if (!limit.ok) return { ok: false, error: "Demasiados intentos. Probá de nuevo en unos minutos." };
  const payload = verifyUnsubscribeToken(token);
  if (!payload) return { ok: false, error: "El enlace no es válido. Copialo completo desde el mail o respondé el mail pidiendo la baja." };
  await unsubscribe(payload.email, payload.campaignId ?? null);
  return { ok: true, email: payload.email };
}
