import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_COOKIE_MAX_AGE,
  IMPERSONATION_TTL_MS,
  impersonationSecret,
  signImpersonation,
  type ImpersonationPayload,
} from "@/lib/impersonation/token";
import { clientIp, hashIp } from "@/services/ai-assistant/rate-limit";

/** Cookie de la vista: httpOnly, mismo sitio, segura en producción. */
export const IMPERSONATION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: IMPERSONATION_COOKIE_MAX_AGE,
};

export async function buildImpersonationToken(payload: ImpersonationPayload): Promise<string> {
  const secret = impersonationSecret();
  if (!secret) throw new Error("Falta AUTH_SECRET: no se puede abrir la vista.");
  return signImpersonation(payload, secret);
}

/** Para Server Actions (en un route handler, setearla sobre la respuesta). */
export async function writeImpersonationCookie(payload: ImpersonationPayload): Promise<void> {
  cookies().set(IMPERSONATION_COOKIE, await buildImpersonationToken(payload), IMPERSONATION_COOKIE_OPTIONS);
}

export function clearImpersonationCookie(): void {
  cookies().delete(IMPERSONATION_COOKIE);
}

export function requestIpHash(): string | null {
  try {
    return hashIp(clientIp(headers()));
  } catch {
    return null;
  }
}

/** Cierra el registro de auditoría (una sola vez). */
export async function closeImpersonationLog(logId: string, adminId: string, reason: string): Promise<void> {
  await prisma.impersonationLog
    .updateMany({ where: { id: logId, adminId, endedAt: null }, data: { endedAt: new Date(), endReason: reason.slice(0, 40) } })
    .catch((error) => console.error("[ver-como] no se pudo cerrar el registro", error));
}

export async function renewImpersonationLog(logId: string, adminId: string): Promise<void> {
  await prisma.impersonationLog
    .updateMany({ where: { id: logId, adminId, endedAt: null }, data: { expiresAt: new Date(Date.now() + IMPERSONATION_TTL_MS), renewals: { increment: 1 } } })
    .catch((error) => console.error("[ver-como] no se pudo renovar el registro", error));
}

export interface ImpersonationLogRow {
  id: string;
  adminEmail: string;
  startedAt: Date;
  endedAt: Date | null;
  expiresAt: Date;
  endReason: string | null;
  renewals: number;
}

/** «Vistas de admin» de la ficha del usuario. */
export async function listImpersonationLogs(targetUserId: string, take = 20): Promise<ImpersonationLogRow[]> {
  return prisma.impersonationLog.findMany({
    where: { targetUserId },
    orderBy: { startedAt: "desc" },
    take,
    select: { id: true, adminEmail: true, startedAt: true, endedAt: true, expiresAt: true, endReason: true, renewals: true },
  });
}
