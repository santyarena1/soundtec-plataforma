"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashActivationToken } from "@/lib/expo/activation-token";

const schema = z
  .object({ token: z.string().min(20), password: z.string().min(8, "Mínimo 8 caracteres").max(200), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden", path: ["confirm"] });

const INVALID_LINK = "El link venció o ya se usó. Pedinos uno nuevo.";

class TokenUnavailableError extends Error {}

export async function activateAccount(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos" };
  const tokenHash = hashActivationToken(parsed.data.token);
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      // Marca el token como usado solo si sigue vigente: dos envíos simultáneos no pueden usarlo dos veces.
      const claimed = await tx.accountActivationToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count === 0) throw new TokenUnavailableError();
      const row = await tx.accountActivationToken.findUniqueOrThrow({ where: { tokenHash }, select: { userId: true } });
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash, isActive: true } });
    });
  } catch (error) {
    if (error instanceof TokenUnavailableError) return { ok: false, error: INVALID_LINK };
    console.error("[activar] no se pudo activar la cuenta", error);
    return { ok: false, error: "No pudimos activar la cuenta. Probá de nuevo en unos minutos." };
  }
  return { ok: true };
}
