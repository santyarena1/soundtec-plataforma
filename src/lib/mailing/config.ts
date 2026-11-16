import { getSettingRows, setSetting } from "@/lib/settings";
import { maskForDisplay } from "@/lib/secret-box";
import type { CampaignFooter } from "@/lib/mailing/template";

/**
 * Configuración de las campañas. La API key de Resend es la misma que usan los
 * avisos del sistema (src/server/mailer.ts): RESEND_API_KEY en Vercel tiene
 * prioridad; si no, la guardada (cifrada) en «mail.resend_api_key».
 */
export const MAILING_KEYS = {
  apiKey: "mail.resend_api_key",
  from: "mailing.from",
  replyTo: "mailing.reply_to",
  footerCompany: "mailing.footer_company",
  footerAddress: "mailing.footer_address",
  footerReason: "mailing.footer_reason",
  dailyLimit: "mailing.daily_limit",
  batchSize: "mailing.batch_size",
  simulate: "mailing.simulate",
  webhookSecret: "mailing.webhook_secret",
  domain: "mailing.domain",
} as const;

export const MAILING_DEFAULTS = {
  from: "Soundtec <noreply@soundtecportal.com.ar>",
  footerCompany: "Soundtec S.R.L.",
  footerReason: "Recibís este mail porque sos cliente de Soundtec o nos dejaste tus datos en el catálogo o en un evento.",
  /** Dominio nuevo: arrancar bajo y subir de a poco (warm-up). */
  dailyLimit: 300,
  batchSize: 50,
  domain: "soundtecportal.com.ar",
};

export type MailingConfig = {
  apiKey: string;
  apiKeySource: "env" | "setting" | "none";
  from: string;
  replyTo: string;
  footer: CampaignFooter;
  dailyLimit: number;
  batchSize: number;
  /** Modo prueba: no sale nada, los envíos quedan registrados como simulados. */
  simulate: boolean;
  simulateReason: "setting" | "no_key" | null;
  webhookSecret: string;
  webhookSecretSource: "env" | "setting" | "none";
  domain: string;
};

function intOr(value: string, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) && value.trim() !== "" ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
}

export async function getMailingConfig(): Promise<MailingConfig> {
  const rows = await getSettingRows(Object.values(MAILING_KEYS));
  const value = (key: string) => rows.find((r) => r.key === key)?.value?.trim() ?? "";
  const envKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const apiKey = envKey || value(MAILING_KEYS.apiKey);
  const envSecret = process.env.RESEND_WEBHOOK_SECRET?.trim() ?? "";
  const webhookSecret = envSecret || value(MAILING_KEYS.webhookSecret);
  const forced = value(MAILING_KEYS.simulate) === "1";
  return {
    apiKey,
    apiKeySource: envKey ? "env" : apiKey ? "setting" : "none",
    from: value(MAILING_KEYS.from) || MAILING_DEFAULTS.from,
    replyTo: value(MAILING_KEYS.replyTo),
    footer: {
      company: value(MAILING_KEYS.footerCompany) || MAILING_DEFAULTS.footerCompany,
      address: value(MAILING_KEYS.footerAddress),
      reason: value(MAILING_KEYS.footerReason) || MAILING_DEFAULTS.footerReason,
    },
    dailyLimit: intOr(value(MAILING_KEYS.dailyLimit), MAILING_DEFAULTS.dailyLimit, 0, 1_000_000),
    batchSize: intOr(value(MAILING_KEYS.batchSize), MAILING_DEFAULTS.batchSize, 1, 100),
    simulate: forced || !apiKey,
    simulateReason: forced ? "setting" : !apiKey ? "no_key" : null,
    webhookSecret,
    webhookSecretSource: envSecret ? "env" : webhookSecret ? "setting" : "none",
    domain: value(MAILING_KEYS.domain) || MAILING_DEFAULTS.domain,
  };
}

/** Para la pantalla: todo menos las claves (solo si están y cómo empiezan). */
export async function getMailingConfigSummary() {
  const config = await getMailingConfig();
  const { apiKey, webhookSecret, ...rest } = config;
  return { ...rest, apiKeyMasked: maskForDisplay(apiKey), webhookSecretMasked: maskForDisplay(webhookSecret), forcedSimulate: config.simulateReason === "setting" };
}

export type MailingConfigInput = {
  from: string;
  replyTo: string;
  footerCompany: string;
  footerAddress: string;
  footerReason: string;
  dailyLimit: number;
  batchSize: number;
  simulate: boolean;
  domain: string;
};

export async function saveMailingConfig(input: MailingConfigInput) {
  await setSetting(MAILING_KEYS.from, input.from, { description: "Remitente de las campañas por mail" });
  await setSetting(MAILING_KEYS.replyTo, input.replyTo, { description: "Responder a (campañas)" });
  await setSetting(MAILING_KEYS.footerCompany, input.footerCompany, { description: "Pie de las campañas: razón social" });
  await setSetting(MAILING_KEYS.footerAddress, input.footerAddress, { description: "Pie de las campañas: dirección postal" });
  await setSetting(MAILING_KEYS.footerReason, input.footerReason, { description: "Pie de las campañas: por qué le llega" });
  await setSetting(MAILING_KEYS.dailyLimit, String(input.dailyLimit), { description: "Máximo de mails de campañas por día (0 = sin límite)" });
  await setSetting(MAILING_KEYS.batchSize, String(input.batchSize), { description: "Mails por tanda (máx. 100)" });
  await setSetting(MAILING_KEYS.simulate, input.simulate ? "1" : "0", { description: "Campañas en modo prueba: no sale nada" });
  await setSetting(MAILING_KEYS.domain, input.domain, { description: "Dominio de envío en Resend" });
}

export async function saveMailingSecrets(input: { apiKey?: string; webhookSecret?: string }) {
  if (input.apiKey !== undefined) await setSetting(MAILING_KEYS.apiKey, input.apiKey, { isSecret: true, description: "API key de Resend (cifrada)" });
  if (input.webhookSecret !== undefined) await setSetting(MAILING_KEYS.webhookSecret, input.webhookSecret, { isSecret: true, description: "Secreto del webhook de Resend (cifrado)" });
}

/** Dirección pelada del remitente: «Soundtec <noreply@x>» → «noreply@x». */
export function addressOf(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1]! : from).trim().toLowerCase();
}
