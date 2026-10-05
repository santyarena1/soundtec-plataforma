import { prisma } from "@/lib/prisma";
import { hashActivationToken } from "@/lib/expo/activation-token";

export type TokenState = { ok: true; email: string; name: string } | { ok: false; reason: "INVALID" | "USED" | "EXPIRED" };

/** Estado de un link de activación (solo lectura, para la página /activar). */
export async function checkActivationToken(token: string): Promise<TokenState> {
  const row = await prisma.accountActivationToken.findUnique({
    where: { tokenHash: hashActivationToken(token) },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!row) return { ok: false, reason: "INVALID" };
  if (row.usedAt) return { ok: false, reason: "USED" };
  if (row.expiresAt < new Date()) return { ok: false, reason: "EXPIRED" };
  return { ok: true, email: row.user.email, name: row.user.name };
}
