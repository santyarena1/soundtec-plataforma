/**
 * Rate limit genérico sobre RateLimitBucket (sobrevive entre isolates de
 * Vercel). Si la DB falla, cae a memoria del proceso.
 */
import { prisma } from "@/lib/prisma";

export interface RateLimitDecision {
  ok: boolean;
  retryAfterSec?: number;
}

const memory = new Map<string, { count: number; windowStart: number }>();

function memoryLimit(key: string, limit: number, windowMs: number): RateLimitDecision {
  const now = Date.now();
  const row = memory.get(key);
  if (!row || now - row.windowStart >= windowMs) {
    memory.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (row.count >= limit) return { ok: false, retryAfterSec: Math.ceil((row.windowStart + windowMs - now) / 1000) };
  row.count += 1;
  return { ok: true };
}

export async function consumeRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
  const cutoff = new Date(Date.now() - windowMs);
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
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((row.windowStart.getTime() + windowMs - Date.now()) / 1000)) };
    }
    await prisma.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
    return { ok: true };
  } catch {
    return memoryLimit(key, limit, windowMs);
  }
}
