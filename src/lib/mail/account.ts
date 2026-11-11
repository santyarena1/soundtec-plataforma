import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { getSettingRows, setSetting } from "@/lib/settings";

/**
 * Cuenta de correo propia para mandar invitaciones de formularios (y leer las
 * respuestas que llegan por mail). Hoy es comercial@soundtec.com.ar, en el
 * hosting de InMotion: el dominio tiene DMARC estricto, así que tiene que salir
 * por su propio servidor para no caer en spam.
 */
export const MAIL_KEYS = {
  host: "mail.host",
  user: "mail.user",
  password: "mail.password",
  fromName: "mail.from_name",
  smtpPort: "mail.smtp_port",
  imapPort: "mail.imap_port",
} as const;

export const MAIL_DEFAULTS = { host: "soundtec.com.ar", smtpPort: 465, imapPort: 993, fromName: "Soundtec" };

export type MailAccount = { host: string; user: string; password: string; fromName: string; smtpPort: number; imapPort: number };

/** Cuenta configurada, o null si falta el usuario o la contraseña. */
export async function getMailAccount(): Promise<MailAccount | null> {
  const rows = await getSettingRows(Object.values(MAIL_KEYS));
  const value = (key: string) => rows.find((r) => r.key === key)?.value?.trim() ?? "";
  const user = value(MAIL_KEYS.user);
  const password = value(MAIL_KEYS.password);
  if (!user || !password) return null;
  return {
    host: value(MAIL_KEYS.host) || MAIL_DEFAULTS.host,
    user,
    password,
    fromName: value(MAIL_KEYS.fromName) || MAIL_DEFAULTS.fromName,
    smtpPort: Number(value(MAIL_KEYS.smtpPort)) || MAIL_DEFAULTS.smtpPort,
    imapPort: Number(value(MAIL_KEYS.imapPort)) || MAIL_DEFAULTS.imapPort,
  };
}

/** Datos de la cuenta para la pantalla (nunca la contraseña). */
export async function getMailAccountSummary(): Promise<{ host: string; user: string; fromName: string; smtpPort: number; imapPort: number; hasPassword: boolean }> {
  const rows = await getSettingRows(Object.values(MAIL_KEYS));
  const value = (key: string) => rows.find((r) => r.key === key)?.value?.trim() ?? "";
  return {
    host: value(MAIL_KEYS.host) || MAIL_DEFAULTS.host,
    user: value(MAIL_KEYS.user),
    fromName: value(MAIL_KEYS.fromName) || MAIL_DEFAULTS.fromName,
    smtpPort: Number(value(MAIL_KEYS.smtpPort)) || MAIL_DEFAULTS.smtpPort,
    imapPort: Number(value(MAIL_KEYS.imapPort)) || MAIL_DEFAULTS.imapPort,
    hasPassword: Boolean(value(MAIL_KEYS.password)),
  };
}

export async function saveMailAccount(input: { host: string; user: string; password?: string; fromName: string; smtpPort: number; imapPort: number }) {
  await setSetting(MAIL_KEYS.host, input.host, { description: "Servidor de correo (SMTP e IMAP) para invitaciones de formularios" });
  await setSetting(MAIL_KEYS.user, input.user, { description: "Cuenta que manda las invitaciones de formularios" });
  await setSetting(MAIL_KEYS.fromName, input.fromName, { description: "Nombre que ve quien recibe la invitación" });
  await setSetting(MAIL_KEYS.smtpPort, String(input.smtpPort));
  await setSetting(MAIL_KEYS.imapPort, String(input.imapPort));
  if (input.password) await setSetting(MAIL_KEYS.password, input.password, { isSecret: true, description: "Contraseña de la cuenta de correo (cifrada)" });
}

export function createTransport(account: MailAccount) {
  return nodemailer.createTransport({
    host: account.host,
    port: account.smtpPort,
    secure: account.smtpPort === 465,
    auth: { user: account.user, pass: account.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

export function createImap(account: MailAccount) {
  return new ImapFlow({
    host: account.host,
    port: account.imapPort,
    secure: account.imapPort === 993,
    auth: { user: account.user, pass: account.password },
    logger: false,
    socketTimeout: 30_000,
  });
}

/** Prueba de conexión: entra por SMTP (envío) y por IMAP (lectura). */
export async function testMailAccount(account: MailAccount): Promise<{ smtp: string | null; imap: string | null }> {
  let smtp: string | null = null;
  let imap: string | null = null;
  try {
    await createTransport(account).verify();
  } catch (error) {
    smtp = error instanceof Error ? error.message : "No se pudo conectar.";
  }
  const client = createImap(account);
  try {
    await client.connect();
    await client.logout();
  } catch (error) {
    imap = error instanceof Error ? error.message : "No se pudo conectar.";
    client.close();
  }
  return { smtp, imap };
}

/** Carpeta «Enviados» de la casilla (para dejar una copia de lo que manda el sistema). */
export async function findSentFolder(client: ImapFlow): Promise<string | null> {
  const list = await client.list();
  const special = list.find((f) => f.specialUse === "\\Sent");
  if (special) return special.path;
  const byName = list.find((f) => /(^|\.|\/)(sent|enviados|sent items|sent messages)$/i.test(f.path));
  return byName?.path ?? null;
}
