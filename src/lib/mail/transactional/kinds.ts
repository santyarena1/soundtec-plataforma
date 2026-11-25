/**
 * Tipos de mail que manda el sistema por lo que pasa en el portal. Puro: lo
 * usan el servicio de envío, la pantalla Configuración › Correo y los tests.
 */

export const CLIENT_MAIL_KINDS = [
  "access_invite",
  "account_approved",
  "account_request_received",
  "account_rejected",
  "password_reset",
  "password_changed",
] as const;

export const NOTICE_KINDS = ["account_request", "order", "lead", "form_response", "ticket"] as const;

export type ClientMailKind = (typeof CLIENT_MAIL_KINDS)[number];
export type NoticeKind = (typeof NOTICE_KINDS)[number];
export type NoticeMailKind = `notice_${NoticeKind}`;
export type MailKind = ClientMailKind | NoticeMailKind | "test" | "form_invite";

export const MAIL_KIND_LABELS: Record<MailKind, string> = {
  access_invite: "Invitación de acceso",
  account_approved: "Cuenta aprobada",
  account_request_received: "Solicitud recibida",
  account_rejected: "Solicitud no aprobada",
  password_reset: "Restablecer clave",
  password_changed: "Clave cambiada",
  notice_account_request: "Aviso: solicitud de cuenta",
  notice_order: "Aviso: pedido nuevo",
  notice_lead: "Aviso: lead de Expo",
  notice_form_response: "Aviso: respuesta de formulario",
  notice_ticket: "Aviso: ticket",
  test: "Prueba",
  form_invite: "Invitación de formulario",
};

/** Avisos al equipo: qué los dispara (para la pantalla). */
export const NOTICE_INFO: Record<NoticeKind, { label: string; hint: string }> = {
  account_request: { label: "Solicitudes de cuenta", hint: "Alguien pide cuenta desde la web o un vendedor pide un alta." },
  order: { label: "Pedidos del portal", hint: "Un cliente envía un pedido desde el portal." },
  lead: { label: "Leads de Expo", hint: "Un visitante deja sus datos en el asistente de la Expo." },
  form_response: { label: "Respuestas de formularios", hint: "Llega una respuesta a cualquier formulario (además de los mails propios de cada formulario)." },
  ticket: { label: "Tickets", hint: "Alguien del equipo carga un ticket o reporta un error desde Ayuda." },
};

/** Mails a clientes que se pueden apagar. Los demás salen siempre (son parte del flujo). */
export const OPTIONAL_CLIENT_KINDS: Record<"account_request_received" | "account_rejected", { label: string; hint: string; defaultOn: boolean }> = {
  account_request_received: {
    label: "Confirmar al solicitante que recibimos su pedido de cuenta",
    hint: "Le llega apenas completa el formulario de solicitud.",
    defaultOn: true,
  },
  account_rejected: {
    label: "Avisar al solicitante cuando no se aprueba la cuenta",
    hint: "Mail cordial, sin el motivo que se carga en el panel (ese queda interno).",
    defaultOn: false,
  },
};

/**
 * Contenido que no se guarda para reintentar ni se copia a Enviados: el link
 * para cambiar la clave en la casilla de portal@ permitiría tomar la cuenta.
 */
export function isSensitiveKind(kind: MailKind): boolean {
  return kind === "password_reset";
}

export function mailKindLabel(kind: string): string {
  return (MAIL_KIND_LABELS as Record<string, string>)[kind] ?? kind;
}
