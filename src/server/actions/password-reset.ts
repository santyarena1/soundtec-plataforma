"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clearFailedLogins } from "@/lib/login-guard";
import { passwordProblem } from "@/lib/passwords";
import { SOUNDTEC_PHONE, SOUNDTEC_SALES_EMAIL } from "@/lib/company-contact";
import { hashResetToken, looksLikeResetToken, requestPasswordResetCore } from "@/lib/password-reset";
import { passwordChangedMail, passwordResetMail } from "@/lib/mail/transactional/messages";
import { clientIp, hashIp } from "@/services/ai-assistant/rate-limit";
import { sendRendered, transactionalChannelReady } from "@/server/mail/transactional";
import { runAfterResponse } from "@/server/background";

const CONTACT = `${SOUNDTEC_SALES_EMAIL} o al ${SOUNDTEC_PHONE}`;

export type ForgotResult = { ok: true; message: string } | { ok: false; error: string };

const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email("Escribí un mail válido.").max(200) });

/**
 * Pedido de link para cambiar la clave. Sin sesión. Misma respuesta exista o
 * no la cuenta; solo cambia si se pasó el límite o si no hay casilla de envío
 * (dos cosas que no dependen de quién es el mail).
 */
export async function requestPasswordReset(formData: FormData): Promise<ForgotResult> {
  if (String(formData.get("hp") ?? "")) return { ok: true, message: acceptedMessage() }; // campo trampa
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Escribí un mail válido." };
  const ipHash = hashIp(clientIp(await headers()));

  const outcome = await requestPasswordResetCore(
    {
      channelReady: transactionalChannelReady,
      consumeLimit: consumeRateLimit,
      findUser: (email) => prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, isActive: true, twoFactorEnabled: true } }),
      storeToken: async ({ userId, tokenHash, expiresAt, ipHash: ip }) => {
        await prisma.$transaction([
          prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
          prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt, ipHash: ip } }),
        ]);
      },
      sendResetMail: async (user, url) => {
        await sendRendered("password_reset", user.email, (portalUrl) => passwordResetMail({ name: user.name, email: user.email, url, twoFactor: user.twoFactorEnabled }, portalUrl));
      },
      baseUrl: appUrl(),
      now: () => new Date(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      runInBackground: runAfterResponse,
    },
    { email: parsed.data.email, ipHash }
  );

  if (outcome.status === "limited") return { ok: false, error: `Pediste varios links seguidos. Esperá una hora y probá de nuevo, o escribinos a ${CONTACT}.` };
  if (outcome.status === "unavailable") return { ok: false, error: `Ahora no podemos mandar el mail automático. Escribinos a ${CONTACT} y te ayudamos a entrar.` };
  return { ok: true, message: acceptedMessage() };
}

function acceptedMessage(): string {
  return `Si ese mail tiene cuenta en el portal, en unos minutos te llega un link para elegir una clave nueva (vence en 1 hora). Revisá también spam o promociones. Si no te llega, escribinos a ${CONTACT}.`;
}

const resetSchema = z
  .object({ token: z.string(), password: z.string().max(200), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden.", path: ["confirm"] });

export type ResetResult = { ok: true; email: string; twoFactor: boolean } | { ok: false; error: string };

const INVALID_LINK = "El link venció o ya se usó. Pedí uno nuevo desde «¿Olvidaste tu clave?».";

class LinkUnavailable extends Error {}

/** Cambia la clave con el link. Cierra todas las sesiones y anula otros links pendientes. */
export async function resetPassword(formData: FormData): Promise<ResetResult> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  if (!looksLikeResetToken(parsed.data.token)) return { ok: false, error: INVALID_LINK };
  const tokenHash = hashResetToken(parsed.data.token);

  const pending = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, select: { user: { select: { email: true, name: true } } } });
  if (!pending) return { ok: false, error: INVALID_LINK };
  const problem = passwordProblem(parsed.data.password, { email: pending.user.email, name: pending.user.name });
  if (problem) return { ok: false, error: problem };
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  let user: { id: string; email: string; name: string; twoFactorEnabled: boolean };
  const now = new Date();
  try {
    user = await prisma.$transaction(async (tx) => {
      // Se marca usado solo si sigue vigente: dos envíos a la vez no pueden usarlo dos veces.
      const claimed = await tx.passwordResetToken.updateMany({ where: { tokenHash, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claimed.count === 0) throw new LinkUnavailable();
      const row = await tx.passwordResetToken.findUniqueOrThrow({ where: { tokenHash }, select: { user: { select: { id: true, email: true, name: true, isActive: true, twoFactorEnabled: true } } } });
      if (!row.user.isActive) throw new LinkUnavailable();
      await tx.user.update({
        where: { id: row.user.id },
        data: { passwordHash, mustChangePassword: false, passwordChangedAt: now, sessionVersion: { increment: 1 } },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: row.user.id, usedAt: null } });
      await tx.accountActivationToken.deleteMany({ where: { userId: row.user.id, usedAt: null } });
      return row.user;
    });
  } catch (error) {
    if (error instanceof LinkUnavailable) return { ok: false, error: INVALID_LINK };
    console.error("[restablecer] no se pudo cambiar la clave", error);
    return { ok: false, error: `No pudimos guardar la clave. Probá de nuevo en unos minutos o escribinos a ${CONTACT}.` };
  }

  await clearFailedLogins(user.email).catch(() => null);
  await sendRendered("password_changed", user.email, (portalUrl) => passwordChangedMail({ name: user.name, email: user.email, when: now }, portalUrl));
  return { ok: true, email: user.email, twoFactor: user.twoFactorEnabled };
}
