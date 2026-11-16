import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeEmail } from "@/lib/mail/address";

/**
 * Enlace de baja: /baja/{token}. El token lleva el mail (y la campaña, para
 * contar la baja en sus resultados) firmado con HMAC: no se puede armar uno
 * para dar de baja a otra persona, y no hace falta guardar nada para cada envío.
 * No vence: un mail viejo tiene que poder seguir dando de baja.
 */

export type UnsubscribePayload = { email: string; campaignId?: string | null };

function secretOrThrow(secret?: string): string {
  const value = secret ?? process.env.MAILING_UNSUBSCRIBE_SECRET ?? process.env.ENCRYPTION_KEY ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  if (!value.trim()) throw new Error("Falta ENCRYPTION_KEY (o AUTH_SECRET) para firmar los enlaces de baja.");
  return value;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", `baja:${secret}`).update(body).digest("base64url").slice(0, 22);
}

export function createUnsubscribeToken(payload: UnsubscribePayload, secret?: string): string {
  const body = Buffer.from(JSON.stringify({ e: normalizeEmail(payload.email), c: payload.campaignId || undefined })).toString("base64url");
  return `${body}.${sign(body, secretOrThrow(secret))}`;
}

/** El mail y la campaña del token, o null si está adulterado o mal copiado. */
export function verifyUnsubscribeToken(token: string, secret?: string): UnsubscribePayload | null {
  const [body, signature, extra] = String(token ?? "").trim().split(".");
  if (!body || !signature || extra !== undefined || body.length > 600) return null;
  const expected = sign(body, secretOrThrow(secret));
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { e?: unknown; c?: unknown };
    if (typeof data.e !== "string" || !data.e.includes("@")) return null;
    return { email: data.e, campaignId: typeof data.c === "string" ? data.c : null };
  } catch {
    return null;
  }
}
