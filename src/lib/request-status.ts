import {
  CheckCircle2,
  Eye,
  FileEdit,
  Lock,
  MessageSquare,
  Send,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export type RequestStatus =
  | "DRAFT"
  | "SENT"
  | "IN_REVIEW"
  | "ANSWERED"
  | "CONFIRMED"
  | "REJECTED"
  | "CLOSED";

export type RequestType = "QUOTE" | "ORDER" | "CONSULTATION";

export type BadgeTone = "neutral" | "primary" | "accent" | "success" | "warning" | "destructive" | "muted";

interface StatusMeta {
  label: string;
  tone: BadgeTone;
  icon: LucideIcon;
  /** Qué significa el estado desde la vista del equipo Soundtec. */
  adminHint: string;
  /** Verbo para los botones de acción rápida. */
  actionLabel: string;
}

export const REQUEST_STATUS_META: Record<RequestStatus, StatusMeta> = {
  DRAFT: {
    label: "Borrador",
    tone: "muted",
    icon: FileEdit,
    adminHint: "El cliente todavía la está armando. No la envió.",
    actionLabel: "Volver a borrador",
  },
  SENT: {
    label: "Nueva",
    tone: "warning",
    icon: Send,
    adminHint: "Recién llegó y nadie la tomó todavía.",
    actionLabel: "Marcar como nueva",
  },
  IN_REVIEW: {
    label: "En revisión",
    tone: "accent",
    icon: Eye,
    adminHint: "Alguien del equipo la está trabajando.",
    actionLabel: "Tomar y revisar",
  },
  ANSWERED: {
    label: "Respondida",
    tone: "primary",
    icon: MessageSquare,
    adminHint: "Ya enviamos propuesta. La pelota está del lado del cliente.",
    actionLabel: "Marcar respondida",
  },
  CONFIRMED: {
    label: "Confirmada",
    tone: "success",
    icon: CheckCircle2,
    adminHint: "El cliente aceptó la propuesta.",
    actionLabel: "Confirmar",
  },
  REJECTED: {
    label: "Rechazada",
    tone: "destructive",
    icon: XCircle,
    adminHint: "No avanzamos con esta solicitud.",
    actionLabel: "Rechazar",
  },
  CLOSED: {
    label: "Cerrada",
    tone: "muted",
    icon: Lock,
    adminHint: "Archivada, sin acciones pendientes.",
    actionLabel: "Cerrar",
  },
};

export const REQUEST_TYPE_META: Record<RequestType, { label: string; description: string }> = {
  QUOTE: { label: "Cotización", description: "Pide precios y disponibilidad" },
  ORDER: { label: "Pedido", description: "Quiere comprar" },
  CONSULTATION: { label: "Consulta", description: "Duda técnica o comercial" },
};

/** Etapas del recorrido feliz, en orden. REJECTED y CLOSED quedan fuera del stepper. */
export const REQUEST_FLOW: RequestStatus[] = ["SENT", "IN_REVIEW", "ANSWERED", "CONFIRMED"];

/** Estados que el admin puede setear a mano. */
export const ADMIN_ASSIGNABLE_STATUSES = [
  "IN_REVIEW",
  "ANSWERED",
  "CONFIRMED",
  "REJECTED",
  "CLOSED",
] as const;

export type AdminAssignableStatus = (typeof ADMIN_ASSIGNABLE_STATUSES)[number];

/** Estados en los que la solicitud espera algo de nuestro lado. */
export const OPEN_STATUSES: RequestStatus[] = ["SENT", "IN_REVIEW"];

export function statusLabel(status: string) {
  return REQUEST_STATUS_META[status as RequestStatus]?.label ?? status;
}

export function statusTone(status: string): BadgeTone {
  return REQUEST_STATUS_META[status as RequestStatus]?.tone ?? "muted";
}

export function typeLabel(type: string) {
  return REQUEST_TYPE_META[type as RequestType]?.label ?? type;
}

/**
 * Estado que conviene proponer por defecto al abrir el editor de respuesta:
 * si todavía no respondimos, la acción natural es responder.
 */
export function suggestedNextStatus(status: string): AdminAssignableStatus {
  if (status === "DRAFT" || status === "SENT" || status === "IN_REVIEW") return "ANSWERED";
  return (ADMIN_ASSIGNABLE_STATUSES as readonly string[]).includes(status)
    ? (status as AdminAssignableStatus)
    : "ANSWERED";
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

/** "hace 3 h", "hace 2 días". Devuelve "recién" para menos de un minuto. */
export function formatRelative(value: Date | string, now: Date = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 60 * 1000) return "recién";
  const formatter = new Intl.RelativeTimeFormat("es-AR", { numeric: "auto", style: "long" });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms) return formatter.format(Math.round(diff / ms), unit);
  }
  return "recién";
}
