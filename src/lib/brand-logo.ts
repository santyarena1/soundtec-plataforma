/**
 * Logos de marca. Se pueden subir como archivo (se guardan como data URL en
 * Brand.logoUrl y se sirven desde /api/brand-logo/<id>) o cargar como URL de
 * una imagen pública.
 */

export const LOGO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export const MAX_LOGO_BYTES = 1024 * 1024;

export function isDataUrl(value: string | null | undefined): value is string {
  return !!value && value.startsWith("data:");
}

/** `src` para un <img>: los logos subidos se sirven por la API (HTML liviano). */
export function brandLogoSrc(brand: { id: string; logoUrl: string | null }): string | null {
  if (!brand.logoUrl?.trim()) return null;
  return isDataUrl(brand.logoUrl) ? `/api/brand-logo/${brand.id}` : brand.logoUrl;
}

/** Separa una data URL en tipo y bytes; null si no es una imagen permitida. */
export function parseLogoDataUrl(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const match = /^data:([a-z0-9.+/-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(mime)) return null;
  return { mime, bytes: Buffer.from(match[2], "base64") };
}
