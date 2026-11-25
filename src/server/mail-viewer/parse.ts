import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { isBounce, parseBounce } from "@/lib/mail-viewer/bounce";
import { collectAttachments, hasRealAttachments, type StructureNode } from "@/lib/mail-viewer/attachments";
import { splitReferences } from "@/lib/mail-viewer/thread";
import type { AttachmentInfo, MailAddress, MessageDetail, MessageSummary } from "@/lib/mail-viewer/types";

/**
 * Pasa lo que devuelve IMAP (sobre, banderas, estructura y, para un mensaje
 * abierto, el fuente) a los tipos del visor. Lo usan el proveedor IMAP real y
 * el de prueba, así los dos muestran exactamente lo mismo.
 */

/** Hasta este tamaño se baja el mensaje entero para mostrarlo. */
export const MAX_FULL_MESSAGE_BYTES = 20 * 1024 * 1024;
/** Si es más grande, solo el principio (encabezados y algo de texto). */
export const PARTIAL_SOURCE_BYTES = 256 * 1024;
const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_INLINE_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_HEADER_LINES = 200;

type EnvelopeAddress = { name?: string; address?: string };
export type EnvelopeLike = {
  date?: Date | string;
  subject?: string;
  messageId?: string;
  inReplyTo?: string;
  from?: EnvelopeAddress[];
  to?: EnvelopeAddress[];
  cc?: EnvelopeAddress[];
  replyTo?: EnvelopeAddress[];
};

export type FetchedLike = {
  uid: number;
  flags?: Set<string>;
  size?: number;
  internalDate?: Date | string;
  envelope?: EnvelopeLike;
  bodyStructure?: StructureNode;
};

function addr(a: EnvelopeAddress | undefined): MailAddress | null {
  if (!a?.address && !a?.name) return null;
  return { name: (a.name ?? "").trim(), address: (a.address ?? "").trim().toLowerCase() };
}

function addrs(list: EnvelopeAddress[] | undefined): MailAddress[] {
  return (list ?? []).map(addr).filter((a): a is MailAddress => Boolean(a));
}

function iso(value: Date | string | undefined | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function contentTypeOf(node: StructureNode | undefined): string | null {
  if (!node) return null;
  const report = node.parameters?.["report-type"];
  return report ? `${node.type}; report-type=${report}` : node.type;
}

export function summaryFromFetch(msg: FetchedLike, folder: string): MessageSummary {
  const env = msg.envelope ?? {};
  const from = addr(env.from?.[0]);
  const subject = (env.subject ?? "").trim();
  const flags = msg.flags ?? new Set<string>();
  return {
    uid: msg.uid,
    folder,
    from,
    to: addrs(env.to),
    subject,
    date: iso(env.date) ?? iso(msg.internalDate),
    seen: flags.has("\\Seen"),
    answered: flags.has("\\Answered"),
    flagged: flags.has("\\Flagged"),
    hasAttachments: hasRealAttachments(msg.bodyStructure),
    size: msg.size ?? 0,
    messageId: env.messageId ?? null,
    isBounce: isBounce({ fromAddress: from?.address, fromName: from?.name, subject, contentType: contentTypeOf(msg.bodyStructure) }),
  };
}

function parsedAddrs(value: AddressObject | AddressObject[] | undefined): MailAddress[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.flatMap((group) => group.value).map((a) => ({ name: (a.name ?? "").trim(), address: (a.address ?? "").trim().toLowerCase() }));
}

export type ParsedMessage = {
  detail: MessageDetail;
  /** HTML original (sin sanear: se sanea al servirlo). */
  html: string | null;
  /** cid → data: URI de las imágenes adjuntas al cuerpo. */
  inlineImages: Map<string, string>;
};

function inlineImagesOf(parsed: ParsedMail): Map<string, string> {
  const map = new Map<string, string>();
  let total = 0;
  for (const att of parsed.attachments ?? []) {
    if (!att.cid || !/^image\/(png|jpe?g|gif|webp|bmp)$/i.test(att.contentType)) continue;
    if (att.size > MAX_INLINE_IMAGE_BYTES || total + att.size > MAX_INLINE_TOTAL_BYTES) continue;
    total += att.size;
    map.set(att.cid.replace(/^<|>$/g, "").trim().toLowerCase(), `data:${att.contentType.toLowerCase()};base64,${att.content.toString("base64")}`);
  }
  return map;
}

/** Adjuntos según mailparser (para el proveedor de prueba, que no tiene BODYSTRUCTURE). */
export function attachmentsFromParsed(parsed: ParsedMail): AttachmentInfo[] {
  return (parsed.attachments ?? []).map((att, i) => ({
    part: String(i + 2),
    filename: att.filename ?? (att.contentType.startsWith("image/") ? "imagen" : "adjunto"),
    contentType: att.contentType,
    size: att.size,
    inline: att.contentDisposition === "inline" && Boolean(att.cid),
    cid: att.cid ? att.cid.replace(/^<|>$/g, "").toLowerCase() : null,
  }));
}

export async function parseMessage(
  source: Buffer,
  fetched: FetchedLike,
  folder: string,
  options: { tooLarge: boolean; ownAddresses: string[]; attachments?: AttachmentInfo[] }
): Promise<ParsedMessage> {
  const parsed = await simpleParser(source, { skipTextToHtml: true, skipImageLinks: true, maxHtmlLengthToParse: 3 * 1024 * 1024 });
  const summary = summaryFromFetch(fetched, folder);
  const headers = (parsed.headerLines ?? []).slice(0, MAX_HEADER_LINES).map((h) => {
    const colon = h.line.indexOf(":");
    return { key: colon > 0 ? h.line.slice(0, colon) : h.key, value: (colon > 0 ? h.line.slice(colon + 1) : h.line).replace(/\r?\n[ \t]+/g, " ").trim().slice(0, 2000) };
  });
  const text = (parsed.text ?? "").slice(0, 500_000);
  const html = typeof parsed.html === "string" && parsed.html.trim() ? parsed.html : null;
  const headerMap: Record<string, string> = {};
  const failed = parsed.headers.get("x-failed-recipients");
  if (failed) headerMap["x-failed-recipients"] = String(failed);
  const reportText = summary.isBounce
    ? [text, ...(parsed.attachments ?? []).filter((a) => /delivery-status|rfc822-headers|text\/plain/i.test(a.contentType) && a.size < 200_000).map((a) => a.content.toString("utf8"))].join("\n")
    : "";
  const refs = splitReferences(parsed.references ?? null);
  return {
    detail: {
      ...summary,
      from: summary.from ?? parsedAddrs(parsed.from)[0] ?? null,
      to: summary.to.length ? summary.to : parsedAddrs(parsed.to),
      subject: summary.subject || (parsed.subject ?? ""),
      messageId: summary.messageId ?? parsed.messageId ?? null,
      cc: parsedAddrs(parsed.cc),
      replyTo: parsedAddrs(parsed.replyTo),
      inReplyTo: parsed.inReplyTo ?? fetched.envelope?.inReplyTo ?? null,
      references: refs,
      headers,
      text,
      hasHtml: Boolean(html),
      attachments: options.attachments ?? collectAttachments(fetched.bodyStructure),
      bounce: summary.isBounce ? parseBounce({ text: reportText, headers: headerMap, ownAddresses: options.ownAddresses }) : null,
      tooLarge: options.tooLarge,
    },
    html,
    inlineImages: inlineImagesOf(parsed),
  };
}
