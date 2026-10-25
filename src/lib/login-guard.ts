/**
 * Freno a la fuerza bruta en el ingreso.
 *
 * - Por email: 8 intentos fallidos en 15 minutos bloquean esa cuenta 15 minutos
 *   (un ingreso correcto limpia el contador).
 * - Por IP: 40 intentos (buenos o malos) en 15 minutos, techo alto para no
 *   castigar a una oficina entera detrás de la misma conexión.
 *
 * Usa RateLimitBucket (sobrevive entre instancias de Vercel).
 */
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILS_PER_EMAIL = 8;
export const LOGIN_MAX_ATTEMPTS_PER_IP = 40;

/**
 * IP del cliente, hasheada (no se guarda en claro). Web Crypto y no node:crypto:
 * este módulo lo importa auth.ts, que también corre en el middleware (edge).
 */
export async function loginIpHash(headers: Headers): Promise<string> {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
  const data = new TextEncoder().encode(`${ip}|${process.env.AUTH_SECRET || "soundtec"}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

const emailKey = (email: string) => `login:fail:${email.trim().toLowerCase()}`;
const ipKey = (ipHash: string) => `login:ip:${ipHash}`;

/** ¿La cuenta está bloqueada por intentos fallidos? (no cuenta un intento nuevo) */
export async function isEmailLocked(email: string): Promise<boolean> {
  const row = await prisma.rateLimitBucket.findUnique({ where: { key: emailKey(email) } }).catch(() => null);
  if (!row) return false;
  const fresh = row.windowStart.getTime() > Date.now() - LOGIN_WINDOW_MS;
  return fresh && row.count >= LOGIN_MAX_FAILS_PER_EMAIL;
}

/** Cuenta un intento desde esta IP; false = superó el techo. */
export async function allowIpAttempt(ipHash: string): Promise<boolean> {
  const decision = await consumeRateLimit(ipKey(ipHash), LOGIN_MAX_ATTEMPTS_PER_IP, LOGIN_WINDOW_MS);
  return decision.ok;
}

export async function recordFailedLogin(email: string): Promise<void> {
  await consumeRateLimit(emailKey(email), Number.MAX_SAFE_INTEGER, LOGIN_WINDOW_MS);
}

export async function clearFailedLogins(email: string): Promise<void> {
  await prisma.rateLimitBucket.deleteMany({ where: { key: emailKey(email) } }).catch(() => null);
}
