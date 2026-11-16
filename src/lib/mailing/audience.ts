import { z } from "zod";
import { isEmail, normalizeEmail } from "@/lib/mail/address";
import type { MailContact } from "@/lib/mailing/variables";

/**
 * Audiencias de una campaña: se suman listas (importadas o filtros sobre la
 * base) y se restan otras. Acá vive la parte pura: deduplicar, validar y sacar
 * la lista de supresión. La lectura de la base está en lib/mailing/sources.
 */

export const AUDIENCE_SOURCES = {
  clients: { label: "Clientes (contactos con mail)", help: "El mail de la empresa y el de cada contacto cargado." },
  portal_users: { label: "Usuarios del portal", help: "Personas con usuario para entrar al catálogo con precios." },
  expo_leads: { label: "Interesados (Expo y asistente)", help: "Quienes dejaron sus datos en el stand, por QR o en el asistente." },
  account_requests: { label: "Solicitudes de cuenta", help: "Empresas que pidieron cuenta desde el catálogo." },
} as const;

export type AudienceSource = keyof typeof AUDIENCE_SOURCES;

export const audienceFiltersSchema = z.object({
  /** Rubro del cliente (Integrador, Instalador…). Vacío = todos. */
  segments: z.array(z.string().max(60)).max(30).default([]),
  /** Condición frente al IVA. */
  taxConditions: z.array(z.string().max(60)).max(10).default([]),
  /** Responsable comercial (User.id). */
  ownerIds: z.array(z.string().max(60)).max(50).default([]),
  provinces: z.array(z.string().max(80)).max(30).default([]),
  /** Clientes / usuarios activos, inactivos o todos. */
  status: z.enum(["active", "inactive", "all"]).default("active"),
  /** Solo clientes con (o sin) acceso al portal. */
  portalAccess: z.enum(["any", "with", "without"]).default("any"),
  /** Solicitudes: PENDING | APPROVED | REJECTED. */
  requestStatuses: z.array(z.string().max(20)).max(5).default([]),
  /** Interesados: solo de este evento de Expo. */
  eventIds: z.array(z.string().max(60)).max(20).default([]),
});

export type AudienceFilters = z.infer<typeof audienceFiltersSchema>;

export const audienceQuerySchema = z.object({
  source: z.enum(Object.keys(AUDIENCE_SOURCES) as [AudienceSource, ...AudienceSource[]]),
  filters: audienceFiltersSchema.default({}),
});

export type AudienceQuery = z.infer<typeof audienceQuerySchema>;

export const campaignAudienceSchema = z.object({
  include: z.array(z.string().max(60)).max(30).default([]),
  exclude: z.array(z.string().max(60)).max(30).default([]),
});

export type CampaignAudience = z.infer<typeof campaignAudienceSchema>;

export function readAudience(raw: unknown): CampaignAudience {
  const parsed = campaignAudienceSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { include: [], exclude: [] };
}

export function readAudienceQuery(raw: unknown): AudienceQuery | null {
  const parsed = audienceQuerySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type RecipientStats = {
  /** Filas que llegaron de todas las listas sumadas. */
  raw: number;
  /** Repetidos (mismo mail en una o varias listas). */
  duplicates: number;
  /** Sin mail o con un mail mal escrito. */
  invalid: number;
  /** En la lista de supresión (bajas, rebotes, quejas). */
  suppressed: number;
  /** Sacados por estar en una lista excluida. */
  excluded: number;
  /** Los que reciben el mail. */
  total: number;
};

/**
 * Une las listas: primer dato gana, pero un nombre o empresa vacíos se
 * completan con lo que traiga otra lista para el mismo mail. Saca inválidos,
 * excluidos y suprimidos. El orden de salida es el de llegada.
 */
export function buildRecipients(
  groups: MailContact[][],
  options: { exclude?: Iterable<string>; suppressed?: Iterable<string> } = {}
): { recipients: MailContact[]; stats: RecipientStats } {
  const exclude = new Set([...(options.exclude ?? [])].map(normalizeEmail));
  const suppressed = new Set([...(options.suppressed ?? [])].map(normalizeEmail));
  const byEmail = new Map<string, MailContact>();
  const stats: RecipientStats = { raw: 0, duplicates: 0, invalid: 0, suppressed: 0, excluded: 0, total: 0 };
  const dropped = new Set<string>();

  for (const group of groups) {
    for (const contact of group) {
      stats.raw += 1;
      const email = normalizeEmail(contact.email);
      if (!email || !isEmail(email)) {
        stats.invalid += 1;
        continue;
      }
      const seen = byEmail.get(email);
      if (seen) {
        stats.duplicates += 1;
        if (!seen.name && contact.name) seen.name = contact.name;
        if (!seen.company && contact.company) seen.company = contact.company;
        if (contact.fields) seen.fields = { ...(contact.fields ?? {}), ...(seen.fields ?? {}) };
        continue;
      }
      if (dropped.has(email)) {
        stats.duplicates += 1;
        continue;
      }
      if (suppressed.has(email)) {
        stats.suppressed += 1;
        dropped.add(email);
        continue;
      }
      if (exclude.has(email)) {
        stats.excluded += 1;
        dropped.add(email);
        continue;
      }
      byEmail.set(email, {
        email,
        name: contact.name?.trim() || null,
        company: contact.company?.trim() || null,
        fields: contact.fields ? { ...contact.fields } : null,
      });
    }
  }
  const recipients = [...byEmail.values()];
  stats.total = recipients.length;
  return { recipients, stats };
}
