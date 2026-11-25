import type { StructureNode } from "@/lib/mail-viewer/attachments";

/**
 * Abrir un mail pesado sin bajarlo entero: con la estructura (BODYSTRUCTURE) se
 * eligen solo las partes que se muestran (texto, HTML e imágenes del cuerpo), se
 * piden esas secciones a IMAP y se arma un mensaje MIME chico con ellas para
 * leerlo con el mismo parser de siempre. Los adjuntos quedan en el servidor
 * hasta que alguien los descarga. Puro.
 */

/** Hasta este tamaño conviene traer el mensaje entero de una (una sola ida y vuelta). */
export const FULL_FETCH_MAX_BYTES = 384 * 1024;
const MAX_TEXT_PART_BYTES = 4 * 1024 * 1024;
const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_INLINE_TOTAL_BYTES = 8 * 1024 * 1024;
const INLINE_IMAGE = /^image\/(png|jpe?g|gif|webp|bmp)$/i;
const REPORT = /^(message\/(global-)?delivery-status|text\/rfc822-headers)$/i;
const MAX_REPORT_BYTES = 200 * 1024;

/** `reports`: informe de un rebote (para leer a quién no se entregó). */
export type DisplayParts = { text: string[]; images: string[]; reports: string[] };

function isAttachment(node: StructureNode): boolean {
  return (node.disposition ?? "").toLowerCase() === "attachment";
}

/** Secciones a pedir para mostrar el mensaje, o null si no es multiparte (conviene traerlo entero). */
export function displayParts(root: StructureNode | undefined): DisplayParts | null {
  if (!root?.childNodes?.length) return null;
  const text: string[] = [];
  const images: string[] = [];
  const reports: string[] = [];
  let imageBytes = 0;
  const walk = (node: StructureNode) => {
    if (node.childNodes?.length) {
      // Un mail reenviado adjunto (message/rfc822) no es parte del cuerpo.
      if (node.type.toLowerCase() !== "message/rfc822") node.childNodes.forEach(walk);
      return;
    }
    if (!node.part) return;
    const type = node.type.toLowerCase();
    if ((type === "text/plain" || type === "text/html") && !isAttachment(node) && (node.size ?? 0) <= MAX_TEXT_PART_BYTES) {
      text.push(node.part);
      return;
    }
    const size = node.size ?? 0;
    if (REPORT.test(type) && size <= MAX_REPORT_BYTES) {
      reports.push(node.part);
      return;
    }
    if (node.id && INLINE_IMAGE.test(type) && size <= MAX_INLINE_IMAGE_BYTES && imageBytes + size <= MAX_INLINE_TOTAL_BYTES) {
      imageBytes += size;
      images.push(node.part);
    }
  };
  walk(root);
  return { text, images, reports };
}

/** Campos del encabezado (cada uno con sus líneas de continuación). */
export function splitHeaderFields(header: string): string[] {
  const fields: string[] = [];
  for (const line of header.replace(/\r?\n\r?\n[\s\S]*$/, "").split(/\r?\n/)) {
    if (!line) continue;
    if (/^[ \t]/.test(line) && fields.length) fields[fields.length - 1] += `\r\n${line}`;
    else fields.push(line);
  }
  return fields;
}

/** Como `headerLines` de mailparser: { key en minúscula, línea original }. */
export function headerLinesOf(header: string): Array<{ key: string; line: string }> {
  return splitHeaderFields(header).map((line) => {
    const colon = line.indexOf(":");
    return { key: (colon > 0 ? line.slice(0, colon) : line).trim().toLowerCase(), line };
  });
}

const MIME_FIELDS = /^(content-type|content-transfer-encoding|mime-version)\s*:/i;

function mimeBlock(mime: Buffer | undefined, fallbackType: string): string {
  const fields = splitHeaderFields((mime ?? Buffer.alloc(0)).toString("latin1")).filter((f) => /^content-/i.test(f));
  return `${(fields.length ? fields : [`Content-Type: ${fallbackType}`]).join("\r\n")}\r\n\r\n`;
}

export type FetchedPart = { part: string; type: string; mime: Buffer | undefined; body: Buffer | undefined };

/**
 * Mensaje MIME con el encabezado original y solo las partes pedidas:
 * multipart/mixed { multipart/alternative { textos }, imágenes del cuerpo e informe de rebote }.
 * Las partes viajan tal cual (con su codificación), así el parser decodifica igual.
 */
export function buildDisplayMessage(header: Buffer, text: FetchedPart[], extras: FetchedPart[]): Buffer {
  const mixed = `sv-mixed-${Math.random().toString(36).slice(2)}`;
  const alt = `sv-alt-${Math.random().toString(36).slice(2)}`;
  const top = splitHeaderFields(header.toString("latin1")).filter((f) => !MIME_FIELDS.test(f));
  const chunks: Buffer[] = [Buffer.from(`${top.join("\r\n")}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${mixed}"\r\n\r\n`, "latin1")];
  const add = (s: string) => chunks.push(Buffer.from(s, "latin1"));
  add(`--${mixed}\r\nContent-Type: multipart/alternative; boundary="${alt}"\r\n\r\n`);
  for (const p of text) {
    add(`--${alt}\r\n${mimeBlock(p.mime, p.type)}`);
    chunks.push(p.body ?? Buffer.alloc(0));
    add("\r\n");
  }
  add(`--${alt}--\r\n`);
  for (const p of extras) {
    add(`--${mixed}\r\n${mimeBlock(p.mime, p.type)}`);
    chunks.push(p.body ?? Buffer.alloc(0));
    add("\r\n");
  }
  add(`--${mixed}--\r\n`);
  return Buffer.concat(chunks);
}

/** Nodo de la estructura por número de sección. */
export function findPart(root: StructureNode | undefined, part: string): StructureNode | null {
  if (!root) return null;
  if (root.part === part) return root;
  for (const child of root.childNodes ?? []) {
    const hit = findPart(child, part);
    if (hit) return hit;
  }
  return null;
}
