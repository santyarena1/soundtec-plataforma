/**
 * Material de entrada para leer los puertos de un producto: la tabla de
 * especificaciones del portal, sus características, el HTML y — lo más
 * completo — el texto de la ficha técnica en PDF del fabricante.
 */

import { createHash } from "node:crypto";
import { htmlToText, parseFeatures, parseSpecs } from "@/services/ai-assistant/profile/source";
import { findOfficialDatasheets, findSecondarySources } from "./official-sources";

export type IoSourceRow = {
  id: string;
  normalizedName: string;
  modelNumber: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  htmlContent: string | null;
  keyFeatures: unknown;
  specifications: unknown;
  documents: unknown;
  vendorProductUrl: string | null;
  brand: { name: string } | null;
};

export type IoSource = {
  text: string;
  /** datasheet | specs | page | secondary (distribuidor, manual subido, foro) | none */
  kind: "datasheet" | "specs" | "page" | "secondary" | "none";
  urls: string[];
  hash: string;
  /** Fichas oficiales encontradas en la web (para guardarlas en el producto). */
  discovered: Array<{ url: string; title: string; isPdf: boolean; secondary?: boolean }>;
};

const MAX_SPECS_CHARS = 14_000;
const MAX_HTML_CHARS = 6_000;
const MAX_PDF_CHARS = 22_000;
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const PDF_TIMEOUT_MS = 20_000;
/** Fichas a leer por producto (la principal y, si hace falta, otra). */
const MAX_PDFS = 2;

type Doc = { name: string; url: string; type: string };

function documentsOf(value: unknown): Doc[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const url = typeof r.url === "string" ? r.url : "";
      const name = [r.name, r.nameEs, r.type, r.fileType].filter((v) => typeof v === "string").join(" ");
      return { name, url, type: typeof r.type === "string" ? r.type : "" };
    })
    .filter((d) => /^https?:\/\//i.test(d.url));
}

/** Fichas técnicas primero; manuales después (traen el panel de conexiones); nada de folletos o certificados. */
function rankDoc(d: Doc): number {
  const s = `${d.name} ${d.url}`.toLowerCase();
  if (!/\.pdf(\?|$)/i.test(d.url) && !/pdf/i.test(d.name)) return -1;
  if (/certif|declaration|conformity|warranty|garant|rohs|reach|weee|brochure|folleto|cad|drawing|dwg|firmware|release note/.test(s)) return -1;
  if (/spec ?sheet|datasheet|data sheet|ficha|product sheet|spec/.test(s)) return 3;
  if (/quick ?start|install|instal|guide|guia/.test(s)) return 2;
  if (/manual|operation|user/.test(s)) return 1;
  return 0;
}

/** Del texto largo de un PDF, primero los tramos que hablan de conexiones. */
function focusConnections(text: string, max: number): string {
  if (text.length <= max) return text;
  const re = /(connect|input|output|\bport|rear panel|front panel|interface|specification|i\/o|rs-?232|hdmi|usb|ethernet|lan|dante|poe|speaker|amplif|channel|conector|entrada|salida)/gi;
  const marks: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) marks.push(m.index);
  if (!marks.length) return text.slice(0, max);
  // Ventanas alrededor de cada mención, fusionadas, hasta llenar el presupuesto.
  const win = 700;
  const spans: Array<[number, number]> = [];
  for (const at of marks) {
    const a = Math.max(0, at - win / 2);
    const b = Math.min(text.length, at + win / 2);
    const last = spans[spans.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else spans.push([a, b]);
  }
  let out = "";
  for (const [a, b] of spans) {
    if (out.length >= max) break;
    out += `${text.slice(a, b)} … `;
  }
  return out.slice(0, max);
}

async function pdfText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(PDF_TIMEOUT_MS), headers: { "User-Agent": "Mozilla/5.0 (Soundtec catalog)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_PDF_BYTES) throw new Error("PDF demasiado grande");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_PDF_BYTES) throw new Error("PDF demasiado grande");
  if (String.fromCharCode(...buf.slice(0, 4)) !== "%PDF") throw new Error("No es un PDF");
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join(" ") : text).replace(/\s+/g, " ").trim();
}

async function pageText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(PDF_TIMEOUT_MS), headers: { "User-Agent": "Mozilla/5.0 (Soundtec catalog)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (/pdf/i.test(type) || /\.pdf(\?|$)/i.test(url)) return pdfText(url);
  if (!/html/i.test(type)) throw new Error("No es una página");
  return htmlToText(await res.text());
}

/** Cuánto texto de conexiones hace falta para no salir a buscar la ficha. */
const ENOUGH_CONNECTION_TEXT = 1500;

/** Arma el texto fuente. `withNetwork` en false evita la red (pruebas). */
export async function buildIoSource(row: IoSourceRow, withNetwork = true, forceSearch = false): Promise<IoSource> {
  const parts: string[] = [];
  const urls: string[] = [];
  let kind: IoSource["kind"] = "none";
  const specs = parseSpecs(row.specifications);
  if (specs.length) {
    parts.push(`TABLA DE ESPECIFICACIONES (portal):\n${specs.map((p) => `${p.label}: ${p.value}`).join("\n").slice(0, MAX_SPECS_CHARS)}`);
    if (specs.length >= 4) kind = "specs";
  }
  const features = parseFeatures(row.keyFeatures);
  if (features.length) parts.push(`CARACTERÍSTICAS:\n${features.slice(0, 30).join("\n")}`);
  const html = htmlToText(row.htmlContent) || [row.shortDescription, row.longDescription].filter(Boolean).join(" ");
  if (html) {
    parts.push(`DESCRIPCIÓN (página del producto):\n${html.slice(0, MAX_HTML_CHARS)}`);
    if (kind === "none") kind = "page";
  }
  if (row.vendorProductUrl) urls.push(row.vendorProductUrl);
  const discovered: IoSource["discovered"] = [];
  if (withNetwork) {
    const docs = documentsOf(row.documents)
      .map((d) => ({ d, r: rankDoc(d) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => b.r - a.r)
      .slice(0, MAX_PDFS);
    let budget = MAX_PDF_CHARS;
    for (const { d } of docs) {
      if (budget < 2000) break;
      try {
        const t = await pdfText(d.url);
        if (t.length < 200) continue;
        const focused = focusConnections(t, budget);
        parts.push(`FICHA DEL FABRICANTE (PDF "${d.name.trim() || "ficha"}"):\n${focused}`);
        urls.push(d.url);
        budget -= focused.length;
        kind = "datasheet";
      } catch {
        // Ficha caída o ilegible: se sigue con lo que hay.
      }
    }
  }
  // Sin ficha en el catálogo (o muy pobre en conexiones): se busca la oficial en la web.
  if (withNetwork && (forceSearch || (kind !== "datasheet" && focusConnections(parts.join(" "), 100_000).length < ENOUGH_CONNECTION_TEXT))) {
    const model = row.modelNumber || row.normalizedName;
    let budget = MAX_PDF_CHARS;
    const readDocs = async (docs: Awaited<ReturnType<typeof findOfficialDatasheets>>) => {
      let read = 0;
      for (const doc of docs) {
        if (budget < 2000) break;
        try {
          const t = await pageText(doc.url);
          if (t.length < 200) continue;
          const focused = focusConnections(t, budget);
          const where = new URL(doc.url).hostname;
          parts.push(`${doc.secondary ? "FUENTE SECUNDARIA" : "FICHA OFICIAL"} ENCONTRADA EN ${where} ("${doc.title.slice(0, 80)}"):\n${focused}`);
          urls.push(doc.url);
          discovered.push(doc);
          budget -= focused.length;
          read++;
          if (doc.secondary) kind = kind === "none" || kind === "page" ? "secondary" : kind;
          else kind = doc.isPdf ? "datasheet" : kind === "none" ? "page" : kind;
        } catch {
          // Sitio caído o bloqueado: se sigue con el próximo.
        }
      }
      return read;
    };
    const official = await readDocs(await findOfficialDatasheets(row.brand?.name ?? null, model).catch(() => []));
    // Sin ficha oficial publicada: distribuidores, manuales y foros técnicos (citados igual).
    if (!official && kind !== "datasheet") await readDocs(await findSecondarySources(row.brand?.name ?? null, model).catch(() => []));
  }
  const text = parts.join("\n\n");
  return { text, kind, urls, hash: createHash("sha256").update(text).digest("hex"), discovered };
}
