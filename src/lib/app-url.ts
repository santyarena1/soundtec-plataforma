const FALLBACK_APP_URL = "https://www.soundtecportal.com.ar";

let warned = false;

/** URL pública de la app sin barra final (APP_URL o NEXT_PUBLIC_APP_URL). */
export function appUrl(): string {
  const raw = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (!raw) {
    if (!warned) {
      warned = true;
      console.warn(`[app-url] falta APP_URL / NEXT_PUBLIC_APP_URL; se usa ${FALLBACK_APP_URL}`);
    }
    return FALLBACK_APP_URL;
  }
  return raw.replace(/\/+$/, "");
}
