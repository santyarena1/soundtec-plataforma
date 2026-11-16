import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Firma de los webhooks de Resend (los manda con Svix). Headers:
 * svix-id, svix-timestamp (segundos) y svix-signature («v1,<base64> v1,<base64>»).
 * Se firma «{id}.{timestamp}.{cuerpo crudo}» con HMAC-SHA256 y el secreto
 * «whsec_…» decodificado de base64. Se rechazan los de más de 5 minutos
 * (evita que reenvíen uno viejo capturado).
 */

const TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null };

export type VerifyResult = { ok: true } | { ok: false; reason: string };

function secretBytes(secret: string): Buffer {
  const value = secret.trim();
  return Buffer.from(value.startsWith("whsec_") ? value.slice(6) : value, "base64");
}

export function signSvixPayload(secret: string, id: string, timestamp: number | string, body: string): string {
  return createHmac("sha256", secretBytes(secret)).update(`${id}.${timestamp}.${body}`).digest("base64");
}

export function verifySvixSignature(secret: string, headers: SvixHeaders, body: string, nowSeconds = Math.floor(Date.now() / 1000)): VerifyResult {
  if (!secret.trim()) return { ok: false, reason: "Falta el secreto del webhook." };
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "Faltan los encabezados de firma." };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "Fecha de firma inválida." };
  if (Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) return { ok: false, reason: "Firma vencida." };
  const expected = Buffer.from(signSvixPayload(secret, id, timestamp, body));
  const candidates = signature
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .map((part) => Buffer.from(part.slice(3)));
  const match = candidates.some((candidate) => candidate.length === expected.length && timingSafeEqual(candidate, expected));
  return match ? { ok: true } : { ok: false, reason: "Firma inválida." };
}
