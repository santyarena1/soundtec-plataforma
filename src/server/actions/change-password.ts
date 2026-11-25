"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { passwordProblem } from "@/lib/passwords";
import { consumeRateLimit } from "@/lib/rate-limit";

type Result = { ok: true } | { ok: false; error: string };

/**
 * El usuario elige su clave (obligatorio si la actual es temporal). Pide la
 * actual, aplica las reglas mínimas y sube la versión de sesión: todas las
 * sesiones abiertas (incluida esta) se cierran y hay que entrar con la nueva.
 */
export async function changeOwnPassword(formData: FormData): Promise<Result> {
  const user = await requireUser({ allowPasswordChange: true });
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!current) return { ok: false, error: "Ingresá tu clave actual." };
  if (next !== confirm) return { ok: false, error: "Las dos claves nuevas no coinciden." };

  // Tope de intentos sobre la clave actual (una sesión robada no puede probar claves sin fin).
  const rate = await consumeRateLimit(`change-password:${user.id}`, 8, 15 * 60_000);
  if (!rate.ok) return { ok: false, error: "Demasiados intentos. Esperá 15 minutos y probá de nuevo." };

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, email: true, name: true } });
  if (!dbUser) return { ok: false, error: "Usuario inexistente." };
  if (!(await bcrypt.compare(current, dbUser.passwordHash))) return { ok: false, error: "La clave actual no es correcta." };
  if (await bcrypt.compare(next, dbUser.passwordHash)) return { ok: false, error: "La nueva clave tiene que ser distinta de la actual." };
  const problem = passwordProblem(next, { email: dbUser.email, name: dbUser.name });
  if (problem) return { ok: false, error: problem };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(next, 12),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      sessionVersion: { increment: 1 },
    },
  });
  return { ok: true };
}
