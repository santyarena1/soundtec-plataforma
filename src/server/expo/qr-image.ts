/**
 * QR de expo con el isotipo de Soundtec al centro, en el azul del sistema
 * (--primary: hsl(213 47% 22%) = #1E3552).
 * Corrección de errores nivel H (hasta ~30% del código tapado sigue leyendo):
 * el logo ocupa ~22% del ancho, bien dentro del margen.
 */
import QRCode from "qrcode";
import { PNG } from "pngjs";
import { QR_MARK_PNG_BASE64, QR_MARK_SIZE } from "@/lib/expo/qr-mark";

const DARK = "#1E3552";
const LIGHT = "#FFFFFF";
/** Ancho del logo respecto del QR. */
const LOGO_RATIO = 0.22;
/** Margen blanco alrededor del logo, respecto del ancho del QR. */
const LOGO_PAD_RATIO = 0.025;

const QR_OPTIONS = {
  margin: 1,
  errorCorrectionLevel: "H" as const,
  color: { dark: DARK, light: LIGHT },
};

/** SVG para pantallas (escala sin perder calidad). */
export async function qrSvgWithLogo(url: string): Promise<string> {
  const svg = await QRCode.toString(url, { ...QR_OPTIONS, type: "svg" });
  const size = Number(/viewBox="0 0 (\d+(?:\.\d+)?) /.exec(svg)?.[1] ?? 0);
  if (!size) return svg;
  const w = size * LOGO_RATIO;
  const h = (w * QR_MARK_SIZE.height) / QR_MARK_SIZE.width;
  const pad = size * LOGO_PAD_RATIO;
  const x = (size - w) / 2;
  const y = (size - h) / 2;
  const overlay =
    `<rect x="${x - pad}" y="${y - pad}" width="${w + pad * 2}" height="${h + pad * 2}" rx="${pad}" fill="${LIGHT}"/>` +
    `<image href="data:image/png;base64,${QR_MARK_PNG_BASE64}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  return svg.replace("</svg>", `${overlay}</svg>`);
}

/** PNG en alta resolución para imprimir. */
export async function qrPngWithLogo(url: string, width = 2048): Promise<Buffer> {
  const qr = PNG.sync.read(await QRCode.toBuffer(url, { ...QR_OPTIONS, width }));
  const mark = PNG.sync.read(Buffer.from(QR_MARK_PNG_BASE64, "base64"));
  const scale = (qr.width * LOGO_RATIO) / mark.width;
  const mw = Math.round(mark.width * scale);
  const mh = Math.round(mark.height * scale);
  const pad = Math.round(qr.width * LOGO_PAD_RATIO);
  const mx = Math.round((qr.width - mw) / 2);
  const my = Math.round((qr.height - mh) / 2);

  // Fondo blanco detrás del logo.
  for (let y = my - pad; y < my + mh + pad; y++) {
    for (let x = mx - pad; x < mx + mw + pad; x++) {
      const i = (y * qr.width + x) * 4;
      qr.data[i] = qr.data[i + 1] = qr.data[i + 2] = 255;
      qr.data[i + 3] = 255;
    }
  }
  // Logo escalado (vecino más cercano sobre un original más grande) con mezcla alfa.
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const sx = Math.min(mark.width - 1, Math.floor(x / scale));
      const sy = Math.min(mark.height - 1, Math.floor(y / scale));
      const si = (sy * mark.width + sx) * 4;
      const alpha = mark.data[si + 3] / 255;
      if (!alpha) continue;
      const di = ((my + y) * qr.width + (mx + x)) * 4;
      for (let c = 0; c < 3; c++) {
        qr.data[di + c] = Math.round(mark.data[si + c] * alpha + qr.data[di + c] * (1 - alpha));
      }
    }
  }
  return PNG.sync.write(qr);
}
