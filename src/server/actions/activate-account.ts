"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashActivationToken } from "@/lib/expo/activation-token";

export type TokenState = { ok: true; email: string; name: string } | { ok: false; reason: "INVALID" | "USED" | "EXPIRED" };

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

const schema = z
  .object({ token: z.string().min(20), password: z.string().min(8, "Mínimo 8 caracteres").max(200), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden", path: ["confirm"] });

export async function activateAccount(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos" };
  const state = await checkActivationToken(parsed.data.token);
  if (!state.ok) return { ok: false, error: "El link venció o ya se usó. Pedinos uno nuevo." };
  const tokenHash = hashActivationToken(parsed.data.token);
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.$transaction(async (tx) => {
    const row = await tx.accountActivationToken.update({ where: { tokenHash }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash, isActive: true } });
  });
  return { ok: true };
}
