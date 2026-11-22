/**
 * Por qué una foto de afuera (Serper, URL pegada, archivo subido) no se pudo
 * guardar. Cada motivo tiene un texto para mostrarle al equipo en la ficha.
 */
export type ImageRejectReason =
  | "invalid-url"
  | "unsupported-scheme"
  | "private-host"
  | "dns-failed"
  | "http-error"
  | "hotlink-blocked"
  | "not-found"
  | "too-many-redirects"
  | "timeout"
  | "network"
  | "too-large"
  | "empty"
  | "not-an-image"
  | "heic-unsupported"
  | "unsupported-format"
  | "decode-failed"
  | "too-small";

const MESSAGES: Record<ImageRejectReason, string> = {
  "invalid-url": "La dirección no es válida.",
  "unsupported-scheme": "Solo se pueden traer imágenes de direcciones http o https.",
  "private-host": "La dirección apunta a una red interna; por seguridad no se descarga.",
  "dns-failed": "El sitio de la imagen no existe o no responde.",
  "http-error": "El sitio de la imagen respondió con error.",
  "hotlink-blocked": "El sitio no deja descargar la imagen desde afuera. Bajala desde el navegador y subila como archivo.",
  "not-found": "La imagen ya no está en ese sitio (404).",
  "too-many-redirects": "La dirección redirige demasiadas veces.",
  timeout: "El sitio de la imagen tardó demasiado en responder.",
  network: "No se pudo conectar con el sitio de la imagen.",
  "too-large": "La imagen pesa demasiado (más de 15 MB).",
  empty: "El archivo está vacío.",
  "not-an-image": "La dirección no devuelve una imagen (probablemente es una página web).",
  "heic-unsupported":
    "Las fotos HEIC (iPhone) no se pueden convertir en el servidor. Abrila en la compu, exportala como JPG o PNG y subila.",
  "unsupported-format": "Formato de imagen no soportado.",
  "decode-failed": "La imagen está dañada o no se pudo leer.",
  "too-small": "La imagen es demasiado chica para usarla como foto de producto.",
};

export function rejectMessage(reason: ImageRejectReason, detail?: string): string {
  const base = MESSAGES[reason];
  return detail ? `${base} (${detail})` : base;
}

export class ImageRejectError extends Error {
  constructor(
    public readonly reason: ImageRejectReason,
    public readonly detail?: string,
  ) {
    super(rejectMessage(reason, detail));
    this.name = "ImageRejectError";
  }
}
