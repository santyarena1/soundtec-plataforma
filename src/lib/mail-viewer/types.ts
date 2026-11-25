/**
 * Tipos del visor de la casilla del portal (Sistema › Correo del portal).
 * Lo que viaja al navegador: nunca credenciales ni el mensaje crudo.
 */

export type MailAddress = { name: string; address: string };

export type FolderInfo = {
  path: string;
  label: string;
  /** \Inbox, \Sent, \Junk, \Trash, \Drafts, \Archive o null. */
  specialUse: string | null;
  total: number | null;
  unseen: number | null;
};

export type MessageSummary = {
  uid: number;
  folder: string;
  from: MailAddress | null;
  to: MailAddress[];
  subject: string;
  /** ISO. Fecha del encabezado; si falta, la de llegada al servidor. */
  date: string | null;
  seen: boolean;
  answered: boolean;
  flagged: boolean;
  hasAttachments: boolean;
  size: number;
  messageId: string | null;
  /** Rebote del servidor (MAILER-DAEMON, «Undelivered…»). */
  isBounce: boolean;
};

export type MessagePage = {
  folder: string;
  total: number;
  page: number;
  pageSize: number;
  messages: MessageSummary[];
};

export type AttachmentInfo = {
  /** Sección IMAP (1, 2.1…): con esto se baja en streaming. */
  part: string;
  filename: string;
  contentType: string;
  size: number;
  inline: boolean;
  cid: string | null;
};

export type BounceInfo = {
  recipients: string[];
  status: string | null;
  diagnostic: string | null;
};

export type MessageDetail = MessageSummary & {
  cc: MailAddress[];
  replyTo: MailAddress[];
  inReplyTo: string | null;
  references: string[];
  headers: Array<{ key: string; value: string }>;
  text: string;
  hasHtml: boolean;
  attachments: AttachmentInfo[];
  bounce: BounceInfo | null;
  /** Demasiado pesado para abrirlo entero: solo encabezados y adjuntos. */
  tooLarge: boolean;
};

export type SearchField = "all" | "from" | "to" | "subject" | "text";

export type MessageFilters = {
  q: string;
  field: SearchField;
  /** YYYY-MM-DD */
  from: string | null;
  /** YYYY-MM-DD (inclusive) */
  to: string | null;
  unread: boolean;
};

export class MailboxError extends Error {
  constructor(
    message: string,
    readonly code: "no_account" | "auth" | "connect" | "timeout" | "not_found" | "invalid"
  ) {
    super(message);
    this.name = "MailboxError";
  }
}
