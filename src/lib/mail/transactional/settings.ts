/**
 * Configuración del envío transaccional (AdminSetting «mail.*»). La casilla y
 * su contraseña viven en src/lib/mail/account.ts; acá lo demás: Reply-To,
 * límite por hora, copia en Enviados, respaldo por Resend, destinatarios de
 * avisos internos y mails opcionales a clientes.
 */
import { getSettingRows, setSetting } from "@/lib/settings";
import { DEFAULT_RESEND_FROM, parseHourlyLimit, parseRecipientList } from "./envelope";
import { NOTICE_KINDS, OPTIONAL_CLIENT_KINDS, type NoticeKind } from "./kinds";

export const TX_KEYS = {
  replyTo: "mail.reply_to",
  hourlyLimit: "mail.hourly_limit",
  sentCopy: "mail.sent_copy",
  resendFallback: "mail.resend_fallback",
  resendKey: "mail.resend_api_key",
  resendFrom: "mail.from",
} as const;

/** Clave vieja de avisos de solicitudes de cuenta (se sigue leyendo si la nueva está vacía). */
const LEGACY_ACCOUNT_REQUEST_KEY = "mail.notify_account_requests";

export const noticeKey = (kind: NoticeKind) => `mail.notify.${kind}`;
export const clientToggleKey = (kind: keyof typeof OPTIONAL_CLIENT_KINDS) => `mail.client.${kind}`;

export type TransactionalSettings = {
  replyTo: string;
  hourlyLimit: number;
  sentCopy: boolean;
  resendFallback: boolean;
  resendAvailable: boolean;
  resendFrom: string;
  recipients: Record<NoticeKind, string>;
  clientToggles: Record<keyof typeof OPTIONAL_CLIENT_KINDS, boolean>;
};

const flag = (value: string | undefined, fallback: boolean) => (value === "1" ? true : value === "0" ? false : fallback);

export async function getTransactionalSettings(): Promise<TransactionalSettings> {
  const keys = [
    ...Object.values(TX_KEYS),
    LEGACY_ACCOUNT_REQUEST_KEY,
    ...NOTICE_KINDS.map(noticeKey),
    ...(Object.keys(OPTIONAL_CLIENT_KINDS) as Array<keyof typeof OPTIONAL_CLIENT_KINDS>).map(clientToggleKey),
  ];
  const rows = await getSettingRows(keys).catch(() => []);
  const value = (key: string) => rows.find((r) => r.key === key)?.value?.trim();
  const recipients = Object.fromEntries(NOTICE_KINDS.map((k) => [k, value(noticeKey(k)) ?? ""])) as Record<NoticeKind, string>;
  if (!recipients.account_request) recipients.account_request = value(LEGACY_ACCOUNT_REQUEST_KEY) ?? "";
  const clientToggles = Object.fromEntries(
    (Object.keys(OPTIONAL_CLIENT_KINDS) as Array<keyof typeof OPTIONAL_CLIENT_KINDS>).map((k) => [k, flag(value(clientToggleKey(k)), OPTIONAL_CLIENT_KINDS[k].defaultOn)])
  ) as TransactionalSettings["clientToggles"];
  return {
    replyTo: value(TX_KEYS.replyTo) ?? "",
    hourlyLimit: parseHourlyLimit(value(TX_KEYS.hourlyLimit)),
    sentCopy: flag(value(TX_KEYS.sentCopy), true),
    resendFallback: flag(value(TX_KEYS.resendFallback), false),
    resendAvailable: Boolean(process.env.RESEND_API_KEY || value(TX_KEYS.resendKey)),
    resendFrom: value(TX_KEYS.resendFrom) || DEFAULT_RESEND_FROM,
    recipients,
    clientToggles,
  };
}

/** Clave de Resend (env primero). Solo para el respaldo: nunca sale a la pantalla. */
export async function getResendKey(): Promise<string> {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  const rows = await getSettingRows([TX_KEYS.resendKey]).catch(() => []);
  return rows[0]?.value?.trim() ?? "";
}

export async function noticeRecipients(kind: NoticeKind): Promise<string[]> {
  const settings = await getTransactionalSettings();
  return parseRecipientList(settings.recipients[kind]);
}

export async function saveTransactionalSettings(input: {
  replyTo: string;
  hourlyLimit: number;
  sentCopy: boolean;
  resendFallback: boolean;
  recipients: Partial<Record<NoticeKind, string>>;
  clientToggles: Partial<Record<keyof typeof OPTIONAL_CLIENT_KINDS, boolean>>;
}) {
  await setSetting(TX_KEYS.replyTo, input.replyTo, { description: "Reply-To de los mails del portal (vacío = responden a la casilla que manda)" });
  await setSetting(TX_KEYS.hourlyLimit, String(parseHourlyLimit(input.hourlyLimit)), { description: "Tope de mails por hora por la casilla del portal" });
  await setSetting(TX_KEYS.sentCopy, input.sentCopy ? "1" : "0", { description: "Guardar copia en Enviados (IMAP)" });
  await setSetting(TX_KEYS.resendFallback, input.resendFallback ? "1" : "0", { description: "Usar Resend si la casilla falla o llega al tope" });
  for (const kind of NOTICE_KINDS) {
    const raw = input.recipients[kind];
    if (raw !== undefined) await setSetting(noticeKey(kind), parseRecipientList(raw).join(", "), { description: `Avisos internos: ${kind}` });
  }
  for (const [kind, on] of Object.entries(input.clientToggles)) {
    if (on !== undefined) await setSetting(clientToggleKey(kind as keyof typeof OPTIONAL_CLIENT_KINDS), on ? "1" : "0");
  }
}
