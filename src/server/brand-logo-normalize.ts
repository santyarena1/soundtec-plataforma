import sharp from "sharp";

/** Lienzo común: todos los logos salen con este tamaño exacto. */
export const LOGO_CANVAS = { width: 960, height: 240 } as const;
/**
 * Área que ocupa el logo dentro del lienzo (≈38%). Igualar el área —no el
 * alto— hace que un logo muy apaisado y uno cuadrado se vean del mismo "peso".
 */
const TARGET_AREA = LOGO_CANVAS.width * LOGO_CANVAS.height * 0.38;
const MARGIN = 8;

/**
 * Recorta el margen vacío (transparente o blanco) del archivo, escala el logo
 * a un área fija y lo centra en un lienzo transparente de tamaño común.
 * Devuelve PNG (los SVG se rasterizan en alta resolución, lo que además
 * elimina cualquier script que traiga el SVG).
 */
export async function normalizeLogo(bytes: Buffer, mime: string): Promise<Buffer> {
  const input = sharp(bytes, { density: mime === "image/svg+xml" ? 600 : 72, animated: false });
  const trimmed = await input.trim({ threshold: 18 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const aspect = (meta.width ?? 1) / (meta.height ?? 1);

  let height = Math.sqrt(TARGET_AREA / aspect);
  let width = height * aspect;
  const maxW = LOGO_CANVAS.width - MARGIN * 2;
  const maxH = LOGO_CANVAS.height - MARGIN * 2;
  const fit = Math.min(1, maxW / width, maxH / height);
  width = Math.round(width * fit);
  height = Math.round(height * fit);

  const logo = await sharp(trimmed).resize({ width, height, fit: "fill" }).png().toBuffer();
  return sharp({
    create: { width: LOGO_CANVAS.width, height: LOGO_CANVAS.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
