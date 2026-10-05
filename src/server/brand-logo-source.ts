import { isDataUrl, MAX_LOGO_BYTES, parseLogoDataUrl } from "@/lib/brand-logo";

const FETCH_TIMEOUT_MS = 8000;
/** Hosts privados o locales: nunca se piden desde el servidor. */
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1|\[?f[cd])/i;

export interface LogoSource {
  mime: string;
  bytes: Buffer;
}

/** URL http(s) pública, o null si no es segura de pedir desde el servidor. */
export function publicLogoUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    if (!/^https?:$/.test(url.protocol) || PRIVATE_HOST.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

/** Bytes del logo guardado en Brand.logoUrl (subido o URL externa); null si no se pudo obtener. */
export async function loadLogoSource(logoUrl: string | null): Promise<LogoSource | null> {
  if (!logoUrl) return null;
  if (isDataUrl(logoUrl)) return parseLogoDataUrl(logoUrl);
  const url = publicLogoUrl(logoUrl);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!res.ok || !mime.startsWith("image/")) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return bytes.length <= MAX_LOGO_BYTES * 4 ? { mime, bytes } : null;
  } catch {
    return null;
  }
}
