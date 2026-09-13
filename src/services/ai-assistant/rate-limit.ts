/**
 * Límites del asistente. Permisivos para personas reales (una feria comparte
 * el Wi-Fi, así que la IP sola no puede ser el criterio) y estrictos contra
 * abuso por sesión.
 *
 * Usa la tabla RateLimitBucket (ya existente) para que el contador sobreviva
 * entre isolates de Vercel; si la DB falla, cae a memoria del proceso.
 */

import { createHash } from "node:crypto";
// Cliente normal: los modelos del asistente no son datos de cliente, así que
// no dependen del guard de tenant.
import { prisma } from "@/lib/prisma";

export interface LimitDecision {
  ok: boolean;
  retryAfterSec?: number;
}

const WINDOW_MS = 10 * 60 * 1000;
const PER_SESSION = 20;
const PER_IP = 120;

const memory = new Map<string, { count: number; windowStart: number }>();

function memoryLimit(key: string, limit: number): LimitDecision {
  const now = Date.now();
  const row = memory.get(key);
  if (!row || now - row.windowStart >= WINDOW_MS) {
    memory.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (row.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((row.windowStart + WINDOW_MS - now) / 1000) };
  }
  row.count += 1;
  return { ok: true };
}

async function consume(key: string, limit: number): Promise<LimitDecision> {
  const cutoff = new Date(Date.now() - WINDOW_MS);
  try {
    const row = await prisma.rateLimitBucket.findUnique({ where: { key } });
    if (!row || row.windowStart < cutoff) {
      await prisma.rateLimitBucket.upsert({
        where: { key },
        create: { key, count: 1, windowStart: new Date() },
        update: { count: 1, windowStart: new Date() },
      });
      return { ok: true };
    }
    if (row.count >= limit) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((row.windowStart.getTime() + WINDOW_MS - Date.now()) / 1000)),
      };
    }
    await prisma.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
    return { ok: true };
  } catch {
    return memoryLimit(key, limit);
  }
}

/** sha256 de la IP con el secreto de la app: nunca se guarda la IP en claro. */
export function hashIp(ip: string): string {
  const secret = process.env.AUTH_SECRET || "soundtec";
  return createHash("sha256").update(`${ip}|${secret}`).digest("hex").slice(0, 32);
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip") || "unknown";
}

/**
 * Se cobran los dos buckets: el de sesión frena al que abusa, el de IP es
 * un techo alto para no castigar a toda una feria detrás del mismo NAT.
 */
export async function checkAssistantLimits(input: {
  sessionId: string;
  ipHash: string;
}): Promise<LimitDecision> {
  const session = await consume(`ai:sess:${input.sessionId}`, PER_SESSION);
  if (!session.ok) return session;
  const ip = await consume(`ai:ip:${input.ipHash}`, PER_IP);
  if (!ip.ok) return ip;
  return { ok: true };
}

export const RATE_LIMITS = { windowMs: WINDOW_MS, perSession: PER_SESSION, perIp: PER_IP } as const;
