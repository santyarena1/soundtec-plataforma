import { cookies } from "next/headers";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { IMPERSONATION_COOKIE, checkLiveImpersonation, impersonationSecret, verifyImpersonation } from "@/lib/impersonation/token";

export interface ImpersonationActor {
  id: string;
  name: string | null;
  email: string | null;
}

export interface ImpersonatedUser {
  id: string;
  role: UserRole;
  name: string | null;
  email: string | null;
  companyName: string | null;
  clientId: string | null;
  clientName: string | null;
}

export interface ActiveImpersonation {
  actor: ImpersonationActor;
  target: ImpersonatedUser;
  expiresAt: number;
  logId: string;
}

export type ImpersonationResolution =
  | { state: "none" }
  | { state: "active"; view: ActiveImpersonation }
  | { state: "invalid"; reason: string };

/** ¿El pedido trae la cookie de la vista? (sin validar: alcanza para no escribir nada). */
export function hasImpersonationCookie(): boolean {
  try {
    return Boolean(cookies().get(IMPERSONATION_COOKIE)?.value);
  } catch {
    return false;
  }
}

/**
 * Resuelve la vista «Ver como» para el admin real ya validado (activo y con la
 * sesión vigente). Firma, vencimiento y estado en la base se revisan en cada pedido.
 */
export async function resolveImpersonation(real: { id: string; role: UserRole; name: string | null; email: string | null; isActive: boolean; sessionVersion: number }): Promise<ImpersonationResolution> {
  let raw: string | undefined;
  try {
    raw = cookies().get(IMPERSONATION_COOKIE)?.value;
  } catch {
    return { state: "none" };
  }
  if (!raw) return { state: "none" };
  const verified = await verifyImpersonation(raw, impersonationSecret());
  if (!verified.ok) return { state: "invalid", reason: verified.reason };
  const payload = verified.payload;
  const target = await prisma.user.findUnique({
    where: { id: payload.t },
    select: { id: true, role: true, name: true, email: true, companyName: true, clientId: true, isActive: true, client: { select: { companyName: true } } },
  });
  const live = checkLiveImpersonation(payload, real, target);
  if (!live.ok || !target) return { state: "invalid", reason: live.ok ? "objetivo" : live.reason };
  return {
    state: "active",
    view: {
      actor: { id: real.id, name: real.name, email: real.email },
      target: {
        id: target.id,
        role: target.role,
        name: target.name,
        email: target.email,
        companyName: target.companyName,
        clientId: target.clientId,
        clientName: target.client?.companyName ?? null,
      },
      expiresAt: payload.exp,
      logId: payload.lid,
    },
  };
}
