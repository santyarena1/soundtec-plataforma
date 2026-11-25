import { Readable } from "node:stream";
import { simpleParser, type ParsedMail } from "mailparser";
import { buildImapSearch, type ImapSearch } from "@/lib/mail-viewer/search";
import { folderLabel, resolveSpecialUse, sortFolders } from "@/lib/mail-viewer/folders";
import { normalizeMessageId } from "@/lib/mail-viewer/thread";
import { MailboxError, type FolderInfo, type MessageFilters, type MessageSummary } from "@/lib/mail-viewer/types";
import { attachmentsFromParsed, parseMessage, summaryFromFetch, type FetchedLike } from "./parse";
import type { MailboxProvider } from "./provider";

/**
 * Casilla de ejemplo para desarrollo y capturas (MAIL_VIEWER_DEMO=1 fuera de
 * producción): mensajes armados con nodemailer y leídos con el mismo parser
 * que la casilla real. No se conecta a ningún servidor.
 */

export function demoMailboxEnabled(): boolean {
  return process.env.MAIL_VIEWER_DEMO === "1" && process.env.NODE_ENV !== "production";
}

const OWN = "portal@soundtec.com.ar";
const FOLDERS = ["INBOX", "INBOX.Sent", "INBOX.Junk", "INBOX.Trash", "INBOX.Drafts", "INBOX.Proveedores"];
const SPECIAL: Record<string, string> = { "INBOX.Sent": "\\Sent", "INBOX.Junk": "\\Junk", "INBOX.Trash": "\\Trash", "INBOX.Drafts": "\\Drafts" };

type DemoMessage = { uid: number; folder: string; raw: Buffer; flags: Set<string>; parsed: ParsedMail };

const PIXEL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJ0lEQVR42mNkYPhfz0AEYBxVSF+FjP///ydKIeOoQvoqHA0DigYAAPYfHRGiS8l0AAAAAElFTkSuQmCC", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

type Seed = {
  folder: string;
  daysAgo: number;
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  seen?: boolean;
  messageId: string;
  inReplyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string; cid?: string }>;
  raw?: string;
};

function seeds(): Seed[] {
  const list: Seed[] = [
    {
      folder: "INBOX.Sent",
      daysAgo: 3.2,
      from: `Soundtec Portal <${OWN}>`,
      to: "Martín Ferreyra <mferreyra@integradora-sur.com.ar>",
      subject: "Te invitamos a la jornada Crestron 2026",
      html: "<p>Hola Martín,</p><p>Te esperamos el jueves 4 en el showroom. <a href='https://soundtecportal.com.ar/f/abc'>Confirmá tu lugar</a>.</p>",
      seen: true,
      messageId: "<inv-1@soundtec.com.ar>",
    },
    {
      folder: "INBOX",
      daysAgo: 2.9,
      from: "Martín Ferreyra <mferreyra@integradora-sur.com.ar>",
      to: `Soundtec Portal <${OWN}>`,
      subject: "Re: Te invitamos a la jornada Crestron 2026",
      text: "Hola, gracias por la invitación. Vamos dos personas: yo y Lucía Gómez (técnica). ¿Hay estacionamiento?\n\nSaludos,\nMartín\n\nEl mar, 21 nov 2026 a las 10:12, Soundtec Portal escribió:\n> Te esperamos el jueves 4 en el showroom.",
      messageId: "<re-inv-1@integradora-sur.com.ar>",
      inReplyTo: "<inv-1@soundtec.com.ar>",
    },
    {
      folder: "INBOX.Sent",
      daysAgo: 2.5,
      from: `Soundtec Portal <${OWN}>`,
      to: "Martín Ferreyra <mferreyra@integradora-sur.com.ar>",
      subject: "Re: Te invitamos a la jornada Crestron 2026",
      text: "Martín, sí: hay estacionamiento en el subsuelo, avisá en la entrada. ¡Los esperamos!",
      seen: true,
      messageId: "<re-re-inv-1@soundtec.com.ar>",
      inReplyTo: "<re-inv-1@integradora-sur.com.ar>",
    },
    {
      folder: "INBOX",
      daysAgo: 1.4,
      from: "Mail Delivery System <MAILER-DAEMON@soundtec.com.ar>",
      to: OWN,
      subject: "Undelivered Mail Returned to Sender",
      messageId: "<bounce-1@soundtec.com.ar>",
      raw: [
        "From: Mail Delivery System <MAILER-DAEMON@soundtec.com.ar>",
        `To: ${OWN}`,
        "Subject: Undelivered Mail Returned to Sender",
        "Message-ID: <bounce-1@soundtec.com.ar>",
        "MIME-Version: 1.0",
        'Content-Type: multipart/report; report-type=delivery-status; boundary="b1"',
        "",
        "--b1",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "This is the mail system at host soundtec.com.ar.",
        "I'm sorry to have to inform you that your message could not",
        "be delivered to one or more recipients.",
        "",
        "<compras@audiovisual-norte.com>: host mx.audiovisual-norte.com said: 550 5.1.1 User unknown",
        "",
        "--b1",
        "Content-Type: message/delivery-status",
        "",
        "Reporting-MTA: dns; soundtec.com.ar",
        "",
        "Final-Recipient: rfc822; compras@audiovisual-norte.com",
        "Action: failed",
        "Status: 5.1.1",
        "Diagnostic-Code: smtp; 550 5.1.1 <compras@audiovisual-norte.com>: Recipient address rejected: User unknown",
        "",
        "--b1--",
        "",
      ].join("\r\n"),
    },
    {
      folder: "INBOX",
      daysAgo: 0.8,
      from: "Lucía Gómez <lgomez@estudio-acustico.com>",
      to: `Soundtec Portal <${OWN}>`,
      subject: "Pedido de cotización sala de reuniones + planos",
      html: `<div><p>Buenas tardes, adjunto los planos de la sala (8 x 5 m).</p><p><img src="cid:logo-estudio" alt="Logo" width="16" height="16"> Estudio Acústico</p><p><img src="https://tracker.example.com/pixel.gif?id=99" width="1" height="1"><img src="https://estudio-acustico.com/firma.png" alt="Firma"></p><form action="https://evil.example/login"><input name="clave"></form><script>alert(1)</script><a href="javascript:alert(2)">enlace raro</a> · <a href="https://estudio-acustico.com">estudio-acustico.com</a></div>`,
      messageId: "<cot-1@estudio-acustico.com>",
      attachments: [
        { filename: "Plano sala reuniones.pdf", content: PDF, contentType: "application/pdf" },
        { filename: "logo.png", content: PIXEL_PNG, contentType: "image/png", cid: "logo-estudio" },
      ],
    },
    {
      folder: "INBOX.Junk",
      daysAgo: 0.5,
      from: "Ofertas <promo@descuentos-ya.biz>",
      to: OWN,
      subject: "¡Ganaste un premio!",
      html: "<p>Hacé clic <a href='http://descuentos-ya.biz'>acá</a></p><img src='http://descuentos-ya.biz/banner.jpg'>",
      messageId: "<spam-1@descuentos-ya.biz>",
    },
    {
      folder: "INBOX.Trash",
      daysAgo: 9,
      from: "Newsletter AVIXA <news@avixa.org>",
      to: OWN,
      subject: "AVIXA news — November",
      text: "Industry news.",
      seen: true,
      messageId: "<news-1@avixa.org>",
    },
  ];
  const kinds = ["Invitación de acceso al portal", "Tu cuenta en el portal Soundtec fue aprobada", "Restablecer tu clave", "Aviso: pedido nuevo de Integradora Sur"];
  for (let i = 0; i < 28; i++) {
    list.push({
      folder: "INBOX.Sent",
      daysAgo: 0.3 + i * 0.9,
      from: `Soundtec Portal <${OWN}>`,
      to: `cliente${i + 1}@empresa${(i % 5) + 1}.com.ar`,
      subject: kinds[i % kinds.length]!,
      text: "Mail enviado por el sistema.",
      seen: true,
      messageId: `<sys-${i}@soundtec.com.ar>`,
    });
  }
  const senders = ["ventas@proveedor-audio.com", "Carla Ruiz <cruiz@hotel-plaza.com.ar>", "soporte@crestron.com", "Diego Paz <dpaz@municipio.gob.ar>", "administracion@integradora-sur.com.ar"];
  const subjects = ["Consulta stock DM-NVX-360", "Factura A-0003-00012345", "Re: Presupuesto auditorio", "Disponibilidad parlantes de techo", "Consulta por capacitación"];
  for (let i = 0; i < 34; i++) {
    list.push({
      folder: i % 6 === 5 ? "INBOX.Proveedores" : "INBOX",
      daysAgo: 1.6 + i * 0.7,
      from: senders[i % senders.length]!,
      to: OWN,
      subject: `${subjects[i % subjects.length]} (${i + 1})`,
      text: `Hola, les escribo por ${subjects[i % subjects.length]!.toLowerCase()}. Quedo atento.`,
      seen: i % 3 !== 0,
      messageId: `<in-${i}@example.com>`,
    });
  }
  return list;
}

let loading: Promise<DemoMessage[]> | null = null;

async function load(): Promise<DemoMessage[]> {
  const { default: MailComposer } = await import("nodemailer/lib/mail-composer");
  const now = Date.now();
  const counters = new Map<string, number>();
  const out: DemoMessage[] = [];
  const all = seeds().sort((a, b) => b.daysAgo - a.daysAgo);
  for (const seed of all) {
    const date = new Date(now - seed.daysAgo * 86_400_000);
    const raw = seed.raw
      ? Buffer.from(`Date: ${date.toUTCString()}\r\n${seed.raw}`)
      : await new MailComposer({
          from: seed.from,
          to: seed.to,
          subject: seed.subject,
          text: seed.text,
          html: seed.html,
          date,
          messageId: seed.messageId,
          inReplyTo: seed.inReplyTo,
          references: seed.inReplyTo ? [seed.inReplyTo] : undefined,
          attachments: seed.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType, cid: a.cid })),
        })
          .compile()
          .build();
    const uid = (counters.get(seed.folder) ?? 100) + 1;
    counters.set(seed.folder, uid);
    out.push({ uid, folder: seed.folder, raw, flags: new Set(seed.seen ? ["\\Seen"] : []), parsed: await simpleParser(raw) });
  }
  return out;
}

function messages(): Promise<DemoMessage[]> {
  loading ??= load();
  return loading;
}

function fetchedOf(m: DemoMessage): FetchedLike {
  const first = (v: ParsedMail["to"]) => (Array.isArray(v) ? v[0] : v)?.value ?? [];
  const hasAtt = attachmentsFromParsed(m.parsed).some((a) => !a.inline);
  const isReport = /multipart\/report/i.test(String(m.parsed.headers.get("content-type") ? (m.parsed.headers.get("content-type") as { value?: string }).value : ""));
  return {
    uid: m.uid,
    flags: m.flags,
    size: m.raw.length,
    internalDate: m.parsed.date,
    envelope: {
      date: m.parsed.date,
      subject: m.parsed.subject,
      messageId: m.parsed.messageId,
      inReplyTo: m.parsed.inReplyTo,
      from: first(m.parsed.from).map((a) => ({ name: a.name, address: a.address })),
      to: first(m.parsed.to).map((a) => ({ name: a.name, address: a.address })),
    },
    bodyStructure: hasAtt
      ? { type: "multipart/mixed", childNodes: [{ type: "text/plain" }, { type: "application/octet-stream", disposition: "attachment", dispositionParameters: { filename: "x" } }] }
      : isReport
        ? { type: "multipart/report", parameters: { "report-type": "delivery-status" } }
        : { type: "text/plain" },
  };
}

function matches(m: DemoMessage, search: ImapSearch): boolean {
  const s = (v: string | undefined) => (v ?? "").toLowerCase();
  const addresses = (v: ParsedMail["to"]) => s((Array.isArray(v) ? v.map((x) => x.text).join(" ") : v?.text) ?? "");
  if (search.or && !search.or.some((sub) => matches(m, sub))) return false;
  if (search.from && !addresses(m.parsed.from).includes(s(search.from))) return false;
  if (search.to && !addresses(m.parsed.to).includes(s(search.to))) return false;
  if (search.subject && !s(m.parsed.subject).includes(s(search.subject))) return false;
  if (search.text && !`${s(m.parsed.subject)} ${s(m.parsed.text)} ${addresses(m.parsed.from)}`.includes(s(search.text))) return false;
  const date = m.parsed.date?.getTime() ?? 0;
  if (search.since && date < search.since.getTime()) return false;
  if (search.before && date >= search.before.getTime()) return false;
  if (search.seen === false && m.flags.has("\\Seen")) return false;
  return true;
}

async function find(folder: string, uid: number): Promise<DemoMessage> {
  const m = (await messages()).find((x) => x.folder === folder && x.uid === uid);
  if (!m) throw new MailboxError("Ese mensaje ya no está en la casilla.", "not_found");
  return m;
}

export function createDemoProvider(): MailboxProvider {
  return {
    accountKey: "demo",
    ownAddress: OWN,
    async listFolders() {
      const all = await messages();
      const folders: FolderInfo[] = FOLDERS.map((path) => {
        const specialUse = resolveSpecialUse(path, SPECIAL[path] ?? null);
        const inFolder = all.filter((m) => m.folder === path);
        return { path, label: folderLabel(path, specialUse), specialUse, total: inFolder.length, unseen: inFolder.filter((m) => !m.flags.has("\\Seen")).length };
      });
      return sortFolders(folders);
    },
    async searchUids(folder: string, filters: MessageFilters) {
      const search = buildImapSearch(filters);
      return (await messages()).filter((m) => m.folder === folder && matches(m, search)).map((m) => m.uid);
    },
    async summaries(folder: string, uids: number[]) {
      const wanted = new Set(uids);
      return (await messages())
        .filter((m) => m.folder === folder && wanted.has(m.uid))
        .map((m) => summaryFromFetch(fetchedOf(m), folder))
        .sort((a, b) => b.uid - a.uid);
    },
    async getMessage(folder: string, uid: number) {
      const m = await find(folder, uid);
      return parseMessage(m.raw, fetchedOf(m), folder, { tooLarge: false, ownAddresses: [OWN], attachments: attachmentsFromParsed(m.parsed) });
    },
    async findThread(folders: string[], ids: string[], ownId: string | null) {
      const wanted = new Set(ids);
      return (await messages())
        .filter((m) => folders.includes(m.folder))
        .filter((m) => {
          const id = normalizeMessageId(m.parsed.messageId);
          const reply = normalizeMessageId(m.parsed.inReplyTo);
          return (id && wanted.has(id)) || (ownId && reply === ownId);
        })
        .map((m) => summaryFromFetch(fetchedOf(m), m.folder));
    },
    async openAttachment(folder: string, uid: number, part: string) {
      const m = await find(folder, uid);
      const index = Number(part) - 2;
      const att = m.parsed.attachments[index];
      const info = attachmentsFromParsed(m.parsed)[index];
      if (!att || !info) throw new MailboxError("Ese adjunto ya no está en el mensaje.", "not_found");
      return { stream: Readable.toWeb(Readable.from([att.content])) as ReadableStream<Uint8Array>, filename: info.filename, contentType: info.contentType, size: info.size };
    },
    async setSeen(folder: string, uid: number, seen: boolean) {
      const m = await find(folder, uid);
      if (seen) m.flags.add("\\Seen");
      else m.flags.delete("\\Seen");
    },
  };
}
