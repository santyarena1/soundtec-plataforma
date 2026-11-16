export const CAMPAIGN_STATUS: Record<string, { label: string; tone: "success" | "muted" | "warning" | "primary" | "destructive" }> = {
  DRAFT: { label: "Borrador", tone: "muted" },
  SCHEDULED: { label: "Programada", tone: "primary" },
  SENDING: { label: "Saliendo", tone: "warning" },
  PAUSED: { label: "En pausa", tone: "warning" },
  SENT: { label: "Enviada", tone: "success" },
  CANCELED: { label: "Cancelada", tone: "destructive" },
};
