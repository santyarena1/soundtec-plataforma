import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { richTextToPlain } from "@/lib/quote-richtext";
import { quoteItemDisplay } from "@/lib/quote-product-line";
import { formatUsd } from "@/lib/utils";

type PdfQuote = {
  number: string;
  reference: string | null;
  contactName: string | null;
  issuedAt: Date | null;
  showDeliveryColumn: boolean;
  client: { companyName: string; tradeName: string | null } | null;
  owner: { quoteSignName: string | null; quoteSignTitle: string | null; name: string | null };
  items: Array<{
    quantity: unknown;
    unit: string;
    description: string;
    unitPriceUsd: unknown;
    lineTotalUsd: unknown;
    optional: boolean;
    excluded: boolean;
    deliveryKey: string | null;
    product?: { normalizedName: string; shortDescription: string | null; brand?: { name: string } | null } | null;
  }>;
  sections: Array<{ type: string; title: string; body: string; included: boolean; sortOrder: number }>;
};

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const BODY = 10;
const LINE = 13;

function wrap(font: PDFFont, text: string, size: number, maxWidth: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function buildQuotePdf(quote: PdfQuote): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const color = rgb(0.12, 0.21, 0.33);
  const ink = rgb(0.09, 0.13, 0.18);
  const muted = rgb(0.35, 0.4, 0.45);
  const maxWidth = PAGE.width - PAGE.margin * 2;

  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;

  const ensure = (needed: number) => {
    if (y - needed < PAGE.margin) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    }
  };

  const write = (text: string, opts?: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number }) => {
    const font = opts?.font ?? regular;
    const size = opts?.size ?? BODY;
    const lines = wrap(font, text, size, maxWidth);
    for (const line of lines) {
      ensure(LINE);
      page.drawText(line, { x: PAGE.margin, y: y - size, size, font, color: opts?.color ?? ink });
      y -= opts?.gap ?? LINE;
    }
  };

  write("SOUNDTEC s.r.l.", { font: bold, size: 16, color });
  write(quote.number, { font: bold, size: 13, color });
  y -= 6;

  const issued = (quote.issuedAt ?? new Date()).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  write(`Buenos Aires, ${issued}`, { size: 10, color: muted });
  y -= 8;
  write(`A ${quote.client?.companyName || "Cliente"}`, { font: bold });
  if (quote.contactName) write(`At.: ${quote.contactName}`);
  write(`Ref: ${quote.reference || "—"}`);
  y -= 10;

  const sections = [...quote.sections]
    .filter((section) => section.included !== false && section.type !== "products_table")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const section of sections) {
    const body = richTextToPlain(section.body || "").trim();
    if (!body && section.type !== "brands" && section.type !== "iso") continue;
    if (section.type !== "letter_open" && section.type !== "closing") {
      write(section.title.toUpperCase(), { font: bold, size: 11, color });
      y -= 2;
    }
    if (body) {
      for (const para of body.split(/\n{2,}/)) {
        write(para.replace(/\n/g, " "));
        y -= 4;
      }
    }
    y -= 6;
  }

  write("PLANILLA DE EQUIPAMIENTO Y SERVICIOS", { font: bold, size: 11, color });
  y -= 4;
  const visible = quote.items.filter((item) => !item.excluded);
  const total = visible.filter((item) => !item.optional).reduce((sum, item) => sum + Number(item.lineTotalUsd), 0);

  for (const [index, item] of visible.entries()) {
    const line = quoteItemDisplay(item);
    const qty = Number(item.quantity);
    write(`${index + 1}. ${qty} ${item.unit}  ${line.name}`, { font: bold, size: 10 });
    if (line.blurb) write(line.blurb, { size: 9, color: muted });
    write(`${formatUsd(Number(item.unitPriceUsd))}  ·  ${formatUsd(Number(item.lineTotalUsd))}${item.optional ? "  (opcional)" : ""}`, {
      size: 9,
    });
    if (quote.showDeliveryColumn && item.deliveryKey) write(`Entrega: ${item.deliveryKey}`, { size: 9, color: muted });
    y -= 6;
  }

  write(`Total neto ${formatUsd(total)}`, { font: bold, size: 12, color });
  write("Precios en dólares estadounidenses. No incluyen IVA.", { size: 8, color: muted });
  y -= 16;

  const sign = quote.owner.quoteSignName || quote.owner.name || "";
  if (sign) write(sign, { font: bold });
  if (quote.owner.quoteSignTitle) write(quote.owner.quoteSignTitle, { size: 10 });
  write("SOUNDTEC s.r.l.", { font: bold, color });

  void page;
  return doc.save();
}
