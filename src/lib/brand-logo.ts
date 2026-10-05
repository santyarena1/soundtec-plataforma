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

/** Hash corto (FNV-1a) del logo: versiona la URL para que la caché se renueve al cambiarlo. */
function logoVersion(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * `src` para un <img>. Todo logo (subido o por URL) pasa por la API, que lo
 * recorta y lo lleva al tamaño común, así se ven parejos sin pasos manuales.
 */
export function brandLogoSrc(brand: { id: string; logoUrl: string | null }): string | null {
  const logoUrl = brand.logoUrl?.trim();
  if (!logoUrl) return null;
  return `/api/brand-logo/${brand.id}?v=${logoVersion(logoUrl)}`;
}

/** Separa una data URL en tipo y bytes; null si no es una imagen permitida. */
export function parseLogoDataUrl(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const match = /^data:([a-z0-9.+/-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(mime)) return null;
  return { mime, bytes: Buffer.from(match[2], "base64") };
}
