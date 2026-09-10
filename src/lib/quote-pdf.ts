import { buildQuoteDocumentHtml, type QuoteDocumentHtmlInput } from "@/lib/quote-document-html";
import { htmlToPdf } from "@/lib/html-to-pdf";

export type PdfQuote = QuoteDocumentHtmlInput;

/**
 * PDF oficial de la cotización.
 * Usa el mismo HTML tipográfico que Vista PDF / Word (logo, tablas, secciones).
 */
export async function buildQuotePdf(quote: PdfQuote, origin?: string): Promise<Uint8Array> {
  const html = await buildQuoteDocumentHtml(quote, { origin, forWord: false });
  return htmlToPdf(html);
}
