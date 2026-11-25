import type { BounceInfo } from "./types";

/**
 * Rebotes del servidor de correo (MAILER-DAEMON, postmaster, «Undelivered Mail
 * Returned to Sender», «Mail delivery failed»…). Puro: lo usan el listado de
 * la bandeja, la vista del mensaje, la actividad y los tests.
 */

const BOUNCE_FROM = /(^|[<\s"])(mailer-daemon|postmaster|mail-daemon)@|mail delivery (subsystem|system)/i;
const BOUNCE_SUBJECT =
  /undeliver|undelivered mail|delivery status notification \((failure|delay)\)|delivery (has )?fail|mail delivery failed|failure notice|returned mail|returned to sender|could not be delivered|no se (pudo|ha podido) entregar|entrega fallida|no entregado|rechazad|non remis|unzustellbar/i;
const EMAIL = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

export function isBounce(input: { fromAddress?: string | null; fromName?: string | null; subject?: string | null; contentType?: string | null }): boolean {
  if (input.contentType && /multipart\/report/i.test(input.contentType) && /delivery-status/i.test(input.contentType)) return true;
  const from = `${input.fromName ?? ""} <${input.fromAddress ?? ""}>`;
  if (BOUNCE_FROM.test(from)) return true;
  return BOUNCE_SUBJECT.test(input.subject ?? "");
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.toLowerCase()))];
}

/**
 * Destinatarios que fallaron, código de estado (5.1.1…) y diagnóstico.
 * Lee los campos estándar (DSN, RFC 3464) y, si no están, el texto que suelen
 * poner Exim, Postfix, Gmail y Outlook. `ownAddresses` se descartan (la casilla
 * propia aparece en el texto del rebote).
 */
export function parseBounce(input: { text: string; headers?: Record<string, string>; ownAddresses?: string[] }): BounceInfo {
  const text = input.text ?? "";
  const own = new Set((input.ownAddresses ?? []).map((a) => a.toLowerCase()));
  const recipients: string[] = [];

  const failedHeader = input.headers?.["x-failed-recipients"];
  if (failedHeader) recipients.push(...(failedHeader.match(EMAIL) ?? []));

  for (const match of text.matchAll(/^(?:Final|Original)-Recipient:\s*(?:rfc822;)?\s*(.+)$/gim)) {
    recipients.push(...(match[1]!.match(EMAIL) ?? []));
  }
  if (!recipients.length) {
    // Exim: «This message was created automatically… failed: \n\n  alguien@dominio.com»
    // Postfix: «<alguien@dominio.com>: host … said: 550 …»
    for (const match of text.matchAll(/^\s*<?([a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,})>?\s*(?::|$)/gim)) recipients.push(match[1]!);
  }
  if (!recipients.length) {
    for (const match of text.matchAll(/(?:to|para|a)\s+<?([a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,})>?\s+(?:failed|could not|no se|wasn'?t|was not)/gi)) recipients.push(match[1]!);
  }

  const status = /^Status:\s*([245]\.\d{1,3}\.\d{1,3})/im.exec(text)?.[1] ?? /\b([45]\.\d{1,3}\.\d{1,3})\b/.exec(text)?.[1] ?? null;
  const diagnostic =
    /^Diagnostic-Code:\s*(?:smtp;\s*)?(.+(?:\n[ \t]+.+)*)/im.exec(text)?.[1]?.replace(/\s+/g, " ").trim() ??
    /\b(5\d\d[ -][^\n]{4,200})/.exec(text)?.[1]?.trim() ??
    null;

  return {
    recipients: unique(recipients).filter((r) => !own.has(r) && !/mailer-daemon|postmaster/i.test(r)),
    status,
    diagnostic: diagnostic ? diagnostic.slice(0, 300) : null,
  };
}

/** Rebote permanente (5.x.x) o temporal (4.x.x). */
export function bounceSeverity(info: BounceInfo): "permanent" | "temporary" | "unknown" {
  if (info.status?.startsWith("5")) return "permanent";
  if (info.status?.startsWith("4")) return "temporary";
  if (info.diagnostic && /^5\d\d/.test(info.diagnostic)) return "permanent";
  return "unknown";
}
