import { prisma } from "@/lib/prisma";
import { hashResetToken, looksLikeResetToken, resetTokenState } from "@/lib/password-reset";

export type ResetTokenView = { ok: true; email: string } | { ok: false; reason: "INVALID" | "USED" | "EXPIRED" };

/** Estado del link de «Olvidé mi clave» (solo lectura, para la página /restablecer). */
export async function checkResetToken(token: string): Promise<ResetTokenView> {
  if (!looksLikeResetToken(token)) return { ok: false, reason: "INVALID" };
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: { usedAt: true, expiresAt: true, user: { select: { email: true, isActive: true } } },
  });
  const state = resetTokenState(row, new Date());
  if (state !== "OK" || !row) return { ok: false, reason: state === "OK" ? "INVALID" : state };
  if (!row.user.isActive) return { ok: false, reason: "INVALID" };
  return { ok: true, email: row.user.email };
}
