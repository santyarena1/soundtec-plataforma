import type { AttachmentInfo } from "./types";

/**
 * Adjuntos a partir de la estructura MIME (BODYSTRUCTURE) y nombre seguro para
 * descargarlos. Puro.
 */

export type StructureNode = {
  part?: string;
  type: string;
  parameters?: Record<string, string>;
  id?: string;
  size?: number;
  disposition?: string;
  dispositionParameters?: Record<string, string>;
  childNodes?: StructureNode[];
};

const MAX_NAME = 120;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

/** Nombre de archivo sin rutas, caracteres de control ni reservados de Windows. */
export function safeFileName(name: string | null | undefined, fallback = "adjunto"): string {
  const base = (name ?? "")
    .normalize("NFC")
    .split(/[\\/]/)
    .pop()!
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .trim();
  const named = base && !WINDOWS_RESERVED.test(base) ? base : fallback;
  if (named.length <= MAX_NAME) return named;
  const dot = named.lastIndexOf(".");
  const ext = dot > 0 && named.length - dot <= 10 ? named.slice(dot) : "";
  return named.slice(0, MAX_NAME - ext.length) + ext;
}

/** Content-Disposition attachment con nombre ASCII de respaldo y el UTF-8 (RFC 6266/5987). */
export function attachmentDisposition(name: string): string {
  const safe = safeFileName(name);
  const ascii = safe.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/["\\%;]/g, "_");
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function nameOf(node: StructureNode): string | null {
  return node.dispositionParameters?.filename ?? node.parameters?.name ?? null;
}

/**
 * Partes descargables: las marcadas como adjunto, las que tienen nombre y las
 * imágenes/archivos inline con Content-ID. No cuenta los cuerpos text/plain y
 * text/html del mensaje ni los contenedores multipart.
 */
export function collectAttachments(root: StructureNode | null | undefined): AttachmentInfo[] {
  const out: AttachmentInfo[] = [];
  const walk = (node: StructureNode, path: string) => {
    const type = (node.type || "").toLowerCase();
    if (type.startsWith("multipart/")) {
      (node.childNodes ?? []).forEach((child, i) => walk(child, path ? `${path}.${i + 1}` : String(i + 1)));
      return;
    }
    const part = node.part || path || "1";
    const disposition = (node.disposition ?? "").toLowerCase();
    const name = nameOf(node);
    const isBody = (type === "text/plain" || type === "text/html") && disposition !== "attachment" && !name;
    if (isBody) return;
    if (type === "message/rfc822" && !name && disposition !== "attachment") {
      out.push({ part, filename: "mensaje-adjunto.eml", contentType: type, size: node.size ?? 0, inline: false, cid: null });
      return;
    }
    if (disposition === "attachment" || name || node.id) {
      const cid = node.id ? node.id.replace(/^<|>$/g, "").trim().toLowerCase() : null;
      out.push({
        part,
        filename: safeFileName(name, type.startsWith("image/") ? `imagen.${type.split("/")[1] ?? "bin"}` : "adjunto"),
        contentType: type || "application/octet-stream",
        size: node.size ?? 0,
        inline: disposition === "inline" || (!disposition && Boolean(cid)),
        cid,
      });
    }
  };
  if (root) walk(root, "");
  return out;
}

/** Tiene adjuntos «de verdad» (sin contar imágenes inline del cuerpo). */
export function hasRealAttachments(root: StructureNode | null | undefined): boolean {
  return collectAttachments(root).some((a) => !a.inline);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
