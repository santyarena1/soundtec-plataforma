import { MAIL_KIND_LABELS, type MailKind } from "@/lib/mail/transactional/kinds";

/**
 * «Actividad» de la casilla del portal: una sola línea de tiempo con lo que
 * mandó el sistema (MailLog), lo que llegó (respuestas, rebotes) y las
 * invitaciones de Formularios con su seguimiento. Puro: arma y filtra; las
 * consultas las hace src/server/mail-viewer/activity.ts.
 */

export type ActivityType = "system" | "received" | "bounce" | "form";
export type ActivityState = "ok" | "error" | "pending" | "info";

export type ActivityItem = {
  id: string;
  at: string;
  type: ActivityType;
  state: ActivityState;
  title: string;
  detail: string | null;
  who: string | null;
  /** Enlace interno (mensaje en la bandeja, formulario…). */
  href: string | null;
  meta?: string | null;
};

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  system: "Enviados por el sistema",
  received: "Recibidos",
  bounce: "Rebotes",
  form: "Formularios",
};

export const ACTIVITY_STATE_LABELS: Record<ActivityState, string> = {
  ok: "Bien",
  error: "Con error",
  pending: "Pendiente",
  info: "Informativo",
};

export type MailLogLike = {
  id: string;
  kind: string;
  to: string;
  subject: string;
  status: string;
  channel: string | null;
  error: string | null;
  attempts: number;
  sentAt: Date | null;
  createdAt: Date;
};

export type InboxLike = {
  uid: number;
  folder: string;
  from: { name: string; address: string } | null;
  subject: string;
  date: string | null;
  isBounce: boolean;
  seen: boolean;
};

export type InviteLike = {
  id: string;
  formId: string;
  formTitle: string;
  email: string;
  status: string;
  sentAt: Date | null;
  sendCount: number;
  lastError: string | null;
  openedAt: Date | null;
  clickedAt: Date | null;
  respondedAt: Date | null;
  repliedAt: Date | null;
  replySnippet: string | null;
  updatedAt: Date;
};

export function kindLabel(kind: string): string {
  return MAIL_KIND_LABELS[kind as MailKind] ?? kind;
}

export function mailLogItem(log: MailLogLike): ActivityItem {
  const state: ActivityState = log.status === "SENT" ? "ok" : log.status === "FAILED" ? "error" : log.status === "QUEUED" ? "pending" : "info";
  const statusText = log.status === "SENT" ? "Enviado" : log.status === "FAILED" ? "No salió" : log.status === "QUEUED" ? "En espera" : log.status === "SKIPPED" ? "Sin canal configurado" : log.status;
  const via = log.channel === "resend" ? "por Resend" : log.channel === "smtp" ? "por la casilla" : "";
  const retries = log.attempts > 1 ? `${log.attempts} intentos` : "";
  return {
    id: `log:${log.id}`,
    at: (log.sentAt ?? log.createdAt).toISOString(),
    type: "system",
    state,
    title: `${kindLabel(log.kind)} — ${statusText}`,
    detail: log.error ? `${log.subject} · ${log.error}` : log.subject,
    who: log.to,
    href: log.channel === "smtp" && log.status === "SENT" ? `/admin/correo?carpeta=__sent&q=${encodeURIComponent(log.to.split(",")[0]!.trim())}&campo=to` : null,
    meta: [via, retries].filter(Boolean).join(" · ") || null,
  };
}

export function inboxItem(msg: InboxLike): ActivityItem {
  const from = msg.from ? (msg.from.name ? `${msg.from.name} <${msg.from.address}>` : msg.from.address) : "(sin remitente)";
  const isReply = /^\s*(re|rv|rta|resp|aw)\s*:/i.test(msg.subject);
  return {
    id: `inbox:${msg.folder}:${msg.uid}`,
    at: msg.date ?? new Date(0).toISOString(),
    type: msg.isBounce ? "bounce" : "received",
    state: msg.isBounce ? "error" : "info",
    title: msg.isBounce ? "Rebote del servidor" : isReply ? "Respuesta recibida" : "Mail recibido",
    detail: msg.subject || "(sin asunto)",
    who: from,
    href: `/admin/correo?carpeta=${encodeURIComponent(msg.folder)}&uid=${msg.uid}`,
    meta: msg.seen ? null : "Sin leer",
  };
}

/** Una invitación genera un evento por cada paso con fecha (envío, apertura, respuesta, rebote). */
export function inviteItems(inv: InviteLike): ActivityItem[] {
  const href = `/admin/forms/${inv.formId}`;
  const base = { type: "form" as const, who: inv.email, href };
  const out: ActivityItem[] = [];
  if (inv.sentAt) {
    out.push({ ...base, id: `inv:${inv.id}:sent`, at: inv.sentAt.toISOString(), state: "ok", title: `Invitación enviada — ${inv.formTitle}`, detail: inv.sendCount > 1 ? `${inv.sendCount} envíos (con recordatorios)` : null });
  }
  if (inv.status === "FAILED") {
    out.push({ ...base, id: `inv:${inv.id}:failed`, at: inv.updatedAt.toISOString(), state: "error", title: `Invitación no salió — ${inv.formTitle}`, detail: inv.lastError });
  }
  if (inv.status === "BOUNCED") {
    out.push({ ...base, id: `inv:${inv.id}:bounced`, at: inv.updatedAt.toISOString(), state: "error", title: `Invitación rebotó — ${inv.formTitle}`, detail: inv.lastError });
  }
  if (inv.openedAt) out.push({ ...base, id: `inv:${inv.id}:opened`, at: inv.openedAt.toISOString(), state: "info", title: `Abrió la invitación — ${inv.formTitle}`, detail: null });
  if (inv.respondedAt) out.push({ ...base, id: `inv:${inv.id}:responded`, at: inv.respondedAt.toISOString(), state: "ok", title: `Respondió el formulario — ${inv.formTitle}`, detail: null });
  if (inv.repliedAt) out.push({ ...base, id: `inv:${inv.id}:replied`, at: inv.repliedAt.toISOString(), state: "info", title: `Contestó la invitación por mail — ${inv.formTitle}`, detail: inv.replySnippet?.slice(0, 200) ?? null });
  return out;
}

export type ActivityFilters = { type: ActivityType | null; state: ActivityState | null; q: string };

export function parseActivityFilters(params: Record<string, string | undefined>): ActivityFilters {
  const type = (Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[]).includes(params.tipo as ActivityType) ? (params.tipo as ActivityType) : null;
  const state = (Object.keys(ACTIVITY_STATE_LABELS) as ActivityState[]).includes(params.estado as ActivityState) ? (params.estado as ActivityState) : null;
  return { type, state, q: (params.q ?? "").trim().toLowerCase().slice(0, 120) };
}

/** Junta, filtra y ordena (lo más nuevo arriba). Saca duplicados por id. */
export function buildTimeline(items: ActivityItem[], filters: ActivityFilters): ActivityItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      if (filters.type && item.type !== filters.type) return false;
      if (filters.state && item.state !== filters.state) return false;
      if (filters.q) {
        const hay = `${item.title} ${item.detail ?? ""} ${item.who ?? ""}`.toLowerCase();
        if (!hay.includes(filters.q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function countByType(items: ActivityItem[]): Record<ActivityType, number> {
  const counts: Record<ActivityType, number> = { system: 0, received: 0, bounce: 0, form: 0 };
  for (const item of items) counts[item.type] += 1;
  return counts;
}
