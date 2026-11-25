import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { getSettingRows, setSetting } from "@/lib/settings";

/**
 * Casilla con la que el sistema manda TODOS sus mails (invitaciones, avisos,
 * recuperar clave y, salvo que tengan una propia, los de Formularios):
 * portal@soundtec.com.ar, en el hosting de InMotion. El dominio tiene DMARC en
 * «reject», así que tiene que salir por su propio servidor y con esa misma
 * casilla como remitente.
 */
export const MAIL_KEYS = {
  host: "mail.host",
  user: "mail.user",
  password: "mail.password",
  fromName: "mail.from_name",
  smtpPort: "mail.smtp_port",
  imapPort: "mail.imap_port",
} as const;

export const MAIL_DEFAULTS = { host: "soundtec.com.ar", smtpPort: 465, imapPort: 993, fromName: "Soundtec Portal" };

/** Casilla propia de Formularios (opcional): si falta usuario o contraseña, usan la del portal. */
export const FORMS_MAIL_KEYS = { user: "mail.forms.user", password: "mail.forms.password", fromName: "mail.forms.from_name" } as const;

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
  await setSetting(MAIL_KEYS.host, input.host, { description: "Servidor de correo (SMTP e IMAP) de la casilla del portal" });
  await setSetting(MAIL_KEYS.user, input.user, { description: "Casilla que manda los mails del portal" });
  await setSetting(MAIL_KEYS.fromName, input.fromName, { description: "Nombre que ve quien recibe los mails del portal" });
  await setSetting(MAIL_KEYS.smtpPort, String(input.smtpPort));
  await setSetting(MAIL_KEYS.imapPort, String(input.imapPort));
  if (input.password) await setSetting(MAIL_KEYS.password, input.password, { isSecret: true, description: "Contraseña de la cuenta de correo (cifrada)" });
}

/**
 * Cuenta con la que salen las invitaciones de Formularios (y cuya bandeja se
 * lee para respuestas y rebotes): la propia si está cargada, si no la del portal.
 */
export async function getFormsMailAccount(): Promise<MailAccount | null> {
  const main = await getMailAccount();
  const rows = await getSettingRows(Object.values(FORMS_MAIL_KEYS));
  const value = (key: string) => rows.find((r) => r.key === key)?.value?.trim() ?? "";
  const user = value(FORMS_MAIL_KEYS.user);
  const password = value(FORMS_MAIL_KEYS.password);
  if (!user || !password) return main;
  return {
    host: main?.host ?? MAIL_DEFAULTS.host,
    smtpPort: main?.smtpPort ?? MAIL_DEFAULTS.smtpPort,
    imapPort: main?.imapPort ?? MAIL_DEFAULTS.imapPort,
    user,
    password,
    fromName: value(FORMS_MAIL_KEYS.fromName) || main?.fromName || MAIL_DEFAULTS.fromName,
  };
}

export async function getFormsMailSummary(): Promise<{ user: string; fromName: string; hasPassword: boolean }> {
  const rows = await getSettingRows(Object.values(FORMS_MAIL_KEYS));
  const value = (key: string) => rows.find((r) => r.key === key)?.value?.trim() ?? "";
  return { user: value(FORMS_MAIL_KEYS.user), fromName: value(FORMS_MAIL_KEYS.fromName), hasPassword: Boolean(value(FORMS_MAIL_KEYS.password)) };
}

/** Vacío en usuario = Formularios vuelve a usar la casilla del portal (y se borra la contraseña propia). */
export async function saveFormsMailAccount(input: { user: string; password?: string; fromName: string }) {
  await setSetting(FORMS_MAIL_KEYS.user, input.user, { description: "Casilla propia de Formularios (vacío = usa la del portal)" });
  await setSetting(FORMS_MAIL_KEYS.fromName, input.fromName, { description: "Nombre visible de las invitaciones de Formularios" });
  if (!input.user) await setSetting(FORMS_MAIL_KEYS.password, "", { isSecret: true });
  else if (input.password) await setSetting(FORMS_MAIL_KEYS.password, input.password, { isSecret: true, description: "Contraseña de la casilla de Formularios (cifrada)" });
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

/** `extra` ajusta el cliente (p. ej. el visor de correo, que deja la conexión abierta y la reusa). */
export function createImap(account: MailAccount, extra: Partial<ConstructorParameters<typeof ImapFlow>[0]> = {}) {
  return new ImapFlow({
    host: account.host,
    port: account.imapPort,
    secure: account.imapPort === 993,
    auth: { user: account.user, pass: account.password },
    logger: false,
    socketTimeout: 30_000,
    ...extra,
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
