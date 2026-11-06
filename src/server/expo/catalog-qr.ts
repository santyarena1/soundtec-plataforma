/**
 * QR permanente del catálogo: no depende de ningún evento, no vence y se puede
 * imprimir sin límite. Apunta a /qr/catalogo, que redirige al catálogo con
 * todas las marcas; si algún día cambia el destino, el QR impreso sigue andando.
 */
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const NAVY = rgb(0x1e / 255, 0x35 / 255, 0x52 / 255);
const GRAY = rgb(0.42, 0.45, 0.5);
const DARK_HEX = "#1E3552";
const MM = 72 / 25.4;

export const CATALOG_QR_PATH = "/qr/catalogo";

/** URL que va dentro del QR (siempre el dominio público de producción). */
export function catalogQrUrl(): string {
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.soundtecportal.com.ar").replace(/\/$/, "");
  return `${base}${CATALOG_QR_PATH}`;
}

/** Filas del QR como tramos horizontales de módulos oscuros (menos objetos en el vector). */
function runs(url: string): { size: number; runs: Array<{ row: number; start: number; length: number }> } {
  // Nivel M: módulos más grandes que con H, se lee mejor impreso chico o de lejos.
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const list: Array<{ row: number; start: number; length: number }> = [];
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!qr.modules.get(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < size && qr.modules.get(r, c)) c++;
      list.push({ row: r, start, length: c - start });
    }
  }
  return { size, runs: list };
}

/** SVG vectorial (módulos como rectángulos, con margen blanco). */
export function catalogQrSvg(url = catalogQrUrl()): string {
  const { size, runs: list } = runs(url);
  const quiet = 4;
  const total = size + quiet * 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">`,
    `<rect width="${total}" height="${total}" fill="#FFFFFF"/>`,
    `<g fill="${DARK_HEX}">`,
    ...list.map((r) => `<rect x="${r.start + quiet}" y="${r.row + quiet}" width="${r.length}" height="1"/>`),
    `</g></svg>`,
  ].join("");
}

/** PNG en alta resolución (para usos donde no sirve el vector). */
export async function catalogQrPng(url = catalogQrUrl()): Promise<Buffer> {
  return QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 4, width: 2400, color: { dark: DARK_HEX, light: "#FFFFFF" } });
}

/**
 * PDF 100 × 130 mm con el QR en vectores (se amplía a cualquier tamaño en
 * imprenta sin perder nitidez) y el texto debajo.
 */
export async function catalogQrPdf(url = catalogQrUrl()): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("QR permanente · Catálogo Soundtec");
  pdf.setAuthor("Soundtec");
  pdf.setSubject(url);
  const pageW = 100 * MM;
  const pageH = 130 * MM;
  const page = pdf.addPage([pageW, pageH]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);

  const { size, runs: list } = runs(url);
  const qrSide = 80 * MM;
  const cell = qrSide / size;
  const left = (pageW - qrSide) / 2;
  const top = pageH - 10 * MM; // borde superior del QR (en PDF la y crece hacia arriba)
  for (const r of list) {
    page.drawRectangle({ x: left + r.start * cell, y: top - (r.row + 1) * cell, width: r.length * cell, height: cell, color: NAVY });
  }

  const center = (text: string, font: typeof bold, sizePt: number, y: number, color = NAVY) => {
    const width = font.widthOfTextAtSize(text, sizePt);
    page.drawText(text, { x: (pageW - width) / 2, y, size: sizePt, font, color });
  };
  const textTop = top - qrSide - 11 * MM;
  center("Catálogo Soundtec", bold, 17, textTop);
  center("Escaneá y conocé todas nuestras marcas", regular, 10.5, textTop - 6.5 * MM, GRAY);
  center(url.replace(/^https?:\/\//, ""), regular, 8, textTop - 12 * MM, GRAY);

  return pdf.save();
}
