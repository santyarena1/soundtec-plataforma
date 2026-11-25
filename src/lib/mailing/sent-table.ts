import type { Prisma } from "@prisma/client";
import { recipientStage, type RecipientLike } from "./stats";

/**
 * «Enviados» de Campañas por mail: todos los mails que salieron por Resend
 * (noreply@) con su estado y último evento. Puro: filtros de la URL → where
 * de Prisma, último evento y la traducción de lo que devuelve Resend.
 */

export const SENT_STAGE_KEYS = ["delivered", "opened", "clicked", "bounced", "complained", "unsubscribed", "failed", "sent", "simulated"] as const;
export type SentStageKey = (typeof SENT_STAGE_KEYS)[number];

export const SENT_STAGE_LABELS: Record<SentStageKey, string> = {
  sent: "Enviado (sin confirmar)",
  delivered: "Entregado",
  opened: "Abrió",
  clicked: "Hizo clic",
  bounced: "Rebotó",
  complained: "Queja de spam",
  unsubscribed: "Se dio de baja",
  failed: "Falló",
  simulated: "Simulado",
};

/** Lo que cuenta como «enviado» (se intentó mandar). */
export const SENT_STATUSES = ["SENT", "SIMULATED", "FAILED"] as const;

export type SentFilters = { campaignId: string | null; stage: SentStageKey | null; q: string; from: string | null; to: string | null; page: number };

function ymd(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}

export function parseSentFilters(sp: Record<string, string | undefined>): SentFilters {
  const stage = SENT_STAGE_KEYS.includes(sp.estado as SentStageKey) ? (sp.estado as SentStageKey) : null;
  const campaignId = sp.campana && /^[a-z0-9]{10,40}$/i.test(sp.campana) ? sp.campana : null;
  let from = ymd(sp.desde);
  let to = ymd(sp.hasta);
  if (from && to && from > to) [from, to] = [to, from];
  const page = Number(sp.pagina);
  return {
    campaignId,
    stage,
    // eslint-disable-next-line no-control-regex
    q: (sp.q ?? "").replace(/[\u0000-\u001f]/g, "").trim().toLowerCase().slice(0, 120),
    from,
    to,
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

type Where = Prisma.MailCampaignRecipientWhereInput;

/** Mismo orden de prioridad que recipientStage: cada destinatario cae en un solo estado. */
export function stageWhere(stage: SentStageKey): Where {
  const noNegative = { unsubscribedAt: null, complainedAt: null, bouncedAt: null };
  const live = { ...noNegative, status: { notIn: ["FAILED", "SKIPPED", "CANCELED"] } };
  switch (stage) {
    case "unsubscribed":
      return { unsubscribedAt: { not: null } };
    case "complained":
      return { unsubscribedAt: null, complainedAt: { not: null } };
    case "bounced":
      return { unsubscribedAt: null, complainedAt: null, bouncedAt: { not: null } };
    case "failed":
      return { ...noNegative, status: "FAILED" };
    case "clicked":
      return { ...live, clickedAt: { not: null } };
    case "opened":
      return { ...live, clickedAt: null, openedAt: { not: null } };
    case "delivered":
      return { ...live, clickedAt: null, openedAt: null, deliveredAt: { not: null } };
    case "simulated":
      return { ...live, clickedAt: null, openedAt: null, deliveredAt: null, status: "SIMULATED" };
    case "sent":
      return { ...live, clickedAt: null, openedAt: null, deliveredAt: null, status: "SENT" };
  }
}

/** where de Prisma (MailCampaignRecipient) sin el estado. */
export function baseWhere(f: Omit<SentFilters, "stage" | "page">): Where {
  const where: Where = { status: { in: [...SENT_STATUSES] } };
  if (f.campaignId) where.campaignId = f.campaignId;
  if (f.q) where.email = { contains: f.q };
  if (f.from || f.to) {
    const sentAt: { gte?: Date; lt?: Date } = {};
    if (f.from) sentAt.gte = new Date(`${f.from}T03:00:00Z`); // 00:00 en Argentina
    if (f.to) {
      const end = new Date(`${f.to}T03:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      sentAt.lt = end;
    }
    where.sentAt = sentAt;
  }
  return where;
}

export function sentWhere(f: SentFilters): Where {
  const base = baseWhere(f);
  return f.stage ? { AND: [base, stageWhere(f.stage)] } : base;
}

export type SentRowLike = RecipientLike & { sentAt?: Date | null; lastError?: string | null };

/** Último evento con fecha (el más reciente entre enviado, entregado, abrió, clic, rebote, queja y baja). */
export function lastEvent(r: SentRowLike): { label: string; at: Date } | null {
  const events: Array<[string, Date | string | null | undefined]> = [
    ["Enviado", r.sentAt],
    ["Entregado", r.deliveredAt],
    ["Abrió", r.openedAt],
    ["Clic", r.clickedAt],
    ["Rebote", r.bouncedAt],
    ["Queja de spam", r.complainedAt],
    ["Baja", r.unsubscribedAt],
  ];
  let best: { label: string; at: Date } | null = null;
  for (const [label, value] of events) {
    if (!value) continue;
    const at = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(at.getTime())) continue;
    if (!best || at.getTime() >= best.at.getTime()) best = { label, at };
  }
  return best;
}

export function stageOf(r: SentRowLike) {
  return recipientStage(r);
}

/** Totales arriba de la tabla: claves en el mismo orden que se muestran. */
export const TOTAL_KEYS: SentStageKey[] = ["delivered", "opened", "clicked", "bounced", "complained", "unsubscribed", "failed", "sent", "simulated"];

export type ResendLastEvent = "sent" | "delivered" | "delivery_delayed" | "opened" | "clicked" | "bounced" | "complained" | "failed" | "canceled" | "scheduled" | "queued" | string;

type RecipientState = { deliveredAt: Date | null; openedAt: Date | null; clickedAt: Date | null; bouncedAt: Date | null; complainedAt: Date | null; status: string };

/**
 * Lo que falta completar según el último evento que informa Resend
 * (GET /emails/{id} → last_event). Nunca pisa fechas que ya están; devuelve
 * null si no hay nada nuevo. La fecha es la de la consulta (Resend no da la
 * del evento en ese endpoint).
 */
export function patchFromResend(current: RecipientState, lastEventName: ResendLastEvent, now: Date): Partial<RecipientState> & { bounceType?: string; lastError?: string } | null {
  const patch: Partial<RecipientState> & { bounceType?: string; lastError?: string } = {};
  switch (lastEventName) {
    case "clicked":
      if (!current.clickedAt) patch.clickedAt = now;
    // falls through
    case "opened":
      if (!current.openedAt) patch.openedAt = now;
    // falls through
    case "delivered":
      if (!current.deliveredAt) patch.deliveredAt = now;
      break;
    case "bounced":
      if (!current.bouncedAt) {
        patch.bouncedAt = now;
        patch.bounceType = "Rebote (informado por Resend)";
      }
      break;
    case "complained":
      if (!current.complainedAt) patch.complainedAt = now;
      if (!current.deliveredAt) patch.deliveredAt = now;
      break;
    case "failed":
      if (current.status !== "FAILED") {
        patch.status = "FAILED";
        patch.lastError = "Resend informa que no lo pudo mandar.";
      }
      break;
    default:
      break;
  }
  return Object.keys(patch).length ? patch : null;
}
