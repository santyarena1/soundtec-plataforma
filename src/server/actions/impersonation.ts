"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { canImpersonate, newPayload } from "@/lib/impersonation/token";
import { hasImpersonationCookie } from "@/lib/impersonation/server";
import { requestIpHash, writeImpersonationCookie } from "@/server/impersonation";

const schema = z.object({ userId: z.string().min(1).max(64) });

/**
 * «Ver como este usuario»: solo un admin, nunca sobre otro admin. No toca la
 * sesión del admin ni la clave del otro: abre una vista de solo lectura por
 * 30 minutos y la deja registrada.
 */
export async function startImpersonation(formData: FormData): Promise<{ ok: false; error: string }> {
  const parsed = schema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { ok: false, error: "Usuario inválido." };
  // Con una vista abierta el middleware ya frena esta acción; por las dudas, acá también.
  if (hasImpersonationCookie()) return { ok: false, error: "Ya estás viendo como otro usuario. Salí de esa vista primero." };

  const me = await requireAdmin();
  const [actor, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: me.id }, select: { id: true, role: true, email: true, isActive: true, sessionVersion: true } }),
    prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, role: true, email: true, isActive: true } }),
  ]);
  if (!actor || !target) return { ok: false, error: "No se encontró el usuario." };
  const allowed = canImpersonate(actor, target);
  if (!allowed.ok) return allowed;

  const payload = newPayload({ adminId: actor.id, targetId: target.id, sessionVersion: actor.sessionVersion, logId: "pendiente", targetRole: target.role });
  const log = await prisma.impersonationLog.create({
    data: {
      adminId: actor.id,
      adminEmail: actor.email,
      targetUserId: target.id,
      targetEmail: target.email,
      targetRole: target.role,
      expiresAt: new Date(payload.exp),
      ipHash: requestIpHash(),
    },
    select: { id: true },
  });
  await writeImpersonationCookie({ ...payload, lid: log.id });
  console.info("[ver-como] inicio", { adminId: actor.id, targetUserId: target.id, logId: log.id });
  redirect(target.role === "CLIENT" ? "/portal" : "/admin");
}
