/**
 * Estado que se muestra de cada destinatario y totales de una campaña.
 * Puro: lo usan la pantalla de resultados y el Excel.
 */

export type RecipientLike = {
  status: string;
  sentAt?: Date | string | null;
  deliveredAt?: Date | string | null;
  openedAt?: Date | string | null;
  clickedAt?: Date | string | null;
  bouncedAt?: Date | string | null;
  bounceType?: string | null;
  complainedAt?: Date | string | null;
  unsubscribedAt?: Date | string | null;
};

export type StageTone = "success" | "info" | "muted" | "warning" | "danger";

/** El estado más relevante: baja/queja/rebote > clic > abrió > entregado > enviado > en cola. */
export function recipientStage(r: RecipientLike): { key: string; label: string; tone: StageTone } {
  if (r.unsubscribedAt) return { key: "unsubscribed", label: "Se dio de baja", tone: "warning" };
  if (r.complainedAt) return { key: "complained", label: "Lo marcó como spam", tone: "danger" };
  if (r.bouncedAt) return { key: "bounced", label: /transient/i.test(r.bounceType ?? "") ? "Rebote temporal" : "Rebotó", tone: "danger" };
  if (r.status === "FAILED") return { key: "failed", label: "No salió", tone: "danger" };
  if (r.status === "SKIPPED") return { key: "skipped", label: "Salteado (baja o rebote)", tone: "muted" };
  if (r.status === "CANCELED") return { key: "canceled", label: "Cancelado", tone: "muted" };
  if (r.clickedAt) return { key: "clicked", label: "Hizo clic", tone: "success" };
  if (r.openedAt) return { key: "opened", label: "Abrió", tone: "success" };
  if (r.deliveredAt) return { key: "delivered", label: "Entregado", tone: "info" };
  if (r.status === "SIMULATED") return { key: "simulated", label: "Simulado (no salió)", tone: "muted" };
  if (r.status === "SENT") return { key: "sent", label: "Enviado", tone: "info" };
  if (r.status === "SENDING") return { key: "sending", label: "Saliendo", tone: "warning" };
  return { key: "queued", label: "En cola", tone: "warning" };
}

export type CampaignTotals = {
  total: number;
  queued: number;
  sent: number;
  simulated: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  failed: number;
  skipped: number;
  canceled: number;
};

export function emptyTotals(): CampaignTotals {
  return { total: 0, queued: 0, sent: 0, simulated: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, unsubscribed: 0, failed: 0, skipped: 0, canceled: 0 };
}

/** Porcentaje entero sobre lo enviado (0 si no salió nada). */
export function rate(part: number, base: number): number {
  return base > 0 ? Math.round((part / base) * 1000) / 10 : 0;
}
