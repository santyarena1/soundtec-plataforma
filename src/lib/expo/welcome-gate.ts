export type WelcomeMode = "REQUIRED" | "OPTIONAL" | "NONE";

/**
 * Regla de la bienvenida del catálogo (ver spec §2). Desde noviembre 2026 solo
 * aparece al llegar por el QR de un evento activo (obligatoria, para captar el
 * contacto en el stand). Quien entra por un enlace o directo va al catálogo sin
 * pantalla de por medio. El dato «skipped» queda por compatibilidad.
 */
export function decideWelcome(input: { hasLead: boolean; skipped: boolean; qrEventLive: boolean }): WelcomeMode {
  if (input.hasLead) return "NONE";
  return input.qrEventLive ? "REQUIRED" : "NONE";
}

const CRAWLER_UA = /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|slurp|bingpreview/i;

/** Buscadores y previews de links: no ven la bienvenida (el catálogo queda indexable). */
export function isCrawlerUserAgent(userAgent: string | null | undefined): boolean {
  return !!userAgent && CRAWLER_UA.test(userAgent);
}
