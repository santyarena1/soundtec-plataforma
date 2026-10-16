/**
 * Cómo recibe su acceso un usuario nuevo (o uno al que se le resetea):
 *
 * - "invite": se le manda un link por mail para que cree su clave (vence en
 *   72 h). El admin también ve el link para pasarlo por WhatsApp. Es la
 *   opción recomendada: nadie más conoce la clave.
 * - "temporary": se genera una clave temporal fuerte que el admin le pasa;
 *   al entrar por primera vez tiene que elegir una propia.
 *
 * Nunca se usa una clave escrita en un formulario del admin: así el navegador
 * no puede autocompletar con la clave de quien lo está creando.
 * Sin "use server": lo llaman acciones que ya validaron permisos.
 */

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { ACTIVATION_TTL_MS, createActivationToken } from "@/lib/expo/activation-token";
import { textToHtml } from "@/lib/expo/html";
import { generateTemporaryPassword } from "@/lib/passwords";
import { sendMail } from "@/server/mailer";

export type AccessMode = "invite" | "temporary";

export type AccessResult =
  | { mode: "invite"; activationUrl: string; mailSent: boolean }
  | { mode: "temporary"; password: string };

/** Hash de una clave que nadie conoce (usuario creado por invitación, hasta que active). */
export async function unusablePasswordHash(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString("hex"), 12);
}

function inviteText(name: string, url: string, kind: "staff" | "portal"): string {
  const where = kind === "staff" ? "al panel de Soundtec" : "al portal de clientes de Soundtec";
  return `Hola ${name}, te dimos acceso ${where}.\n\nCreá tu contraseña desde este link (vence en 72 horas):\n${url}\n\nSi no esperabas este mail, ignoralo.`;
}

/**
 * Entrega el acceso. Invalida cualquier link de activación sin usar y sube la
 * versión de sesión (si tenía sesiones abiertas, se cierran).
 */
export async function issueAccess(
  user: { id: string; email: string; name: string },
  mode: AccessMode,
  kind: "staff" | "portal"
): Promise<AccessResult> {
  if (mode === "temporary") {
    const password = generateTemporaryPassword();
    await prisma.$transaction([
      prisma.accountActivationToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true, sessionVersion: { increment: 1 } },
      }),
    ]);
    return { mode, password };
  }

  const { token, tokenHash } = createActivationToken();
  await prisma.$transaction([
    prisma.accountActivationToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.accountActivationToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS) } }),
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await unusablePasswordHash(), mustChangePassword: false, sessionVersion: { increment: 1 } },
    }),
  ]);
  const activationUrl = `${appUrl()}/activar/${token}`;
  let mailSent = false;
  try {
    const text = inviteText(user.name, activationUrl, kind);
    mailSent = (await sendMail({ to: user.email, subject: "Tu acceso a Soundtec", text, html: textToHtml(text) })).sent;
  } catch (error) {
    console.error("[accesos] no se pudo mandar la invitación", error);
  }
  return { mode, activationUrl, mailSent };
}

export function parseAccessMode(value: unknown): AccessMode {
  return value === "temporary" ? "temporary" : "invite";
}
