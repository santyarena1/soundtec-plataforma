"use server";

import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/lib/auth-helpers";
import { consumeRateLimit } from "@/lib/rate-limit";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const TRIES_PER_15_MIN = 10;

async function allowTry(userId: string): Promise<boolean> {
  return (await consumeRateLimit(`2fa:${userId}`, TRIES_PER_15_MIN, 15 * 60 * 1000)).ok;
}

/** Paso 1: genera el secreto (todavía no activo) y el QR para escanear. */
export async function startTwoFactorSetup(): Promise<Result<{ secret: string; qr: string }>> {
  const user = await requireUser();
  const current = await prisma.user.findUnique({ where: { id: user.id }, select: { twoFactorEnabled: true, email: true } });
  if (!current) return { ok: false, error: "Usuario no encontrado." };
  if (current.twoFactorEnabled) return { ok: false, error: "La verificación en dos pasos ya está activa." };
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: encryptSecret(secret) } });
  const qr = await QRCode.toDataURL(totpUri(secret, current.email), { margin: 1, width: 220 });
  return { ok: true, secret, qr };
}

/** Paso 2: con el primer código de la app, queda activa. */
export async function confirmTwoFactor(code: string): Promise<Result> {
  const user = await requireUser();
  if (!(await allowTry(user.id))) return { ok: false, error: "Demasiados intentos. Esperá 15 minutos." };
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { twoFactorSecret: true, twoFactorEnabled: true } });
  if (!row?.twoFactorSecret) return { ok: false, error: "Empezá de nuevo: tocá «Activar»." };
  if (row.twoFactorEnabled) return { ok: true };
  if (!(await verifyTotp(decryptSecret(row.twoFactorSecret), code))) {
    return { ok: false, error: "El código no es correcto. Fijate que el reloj del celular esté en hora y probá con el que muestra ahora." };
  }
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
  console.info("[2fa] activada", { userId: user.id });
  revalidatePath("/cuenta/seguridad");
  return { ok: true };
}

/** Desactivar exige un código vigente: con la sesión sola no alcanza. */
export async function disableTwoFactor(code: string): Promise<Result> {
  const user = await requireUser();
  if (!(await allowTry(user.id))) return { ok: false, error: "Demasiados intentos. Esperá 15 minutos." };
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { twoFactorSecret: true, twoFactorEnabled: true } });
  if (!row?.twoFactorEnabled) return { ok: true };
  if (!(await verifyTotp(decryptSecret(row.twoFactorSecret ?? ""), code))) {
    return { ok: false, error: "El código no es correcto." };
  }
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
  console.info("[2fa] desactivada", { userId: user.id });
  revalidatePath("/cuenta/seguridad");
  return { ok: true };
}

/** Para quien perdió el celular: un administrador le quita la verificación y cierra sus sesiones. */
export async function adminResetTwoFactor(userId: string): Promise<Result> {
  const admin = await requireAdmin();
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return { ok: false, error: "Usuario no encontrado." };
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null, sessionVersion: { increment: 1 } },
  });
  console.info("[2fa] reseteada por admin", { userId, by: admin.id });
  revalidatePath("/admin/users");
  return { ok: true };
}
