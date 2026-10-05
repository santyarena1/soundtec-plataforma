export type WelcomeMode = "REQUIRED" | "OPTIONAL" | "NONE";

/** Regla de la bienvenida del catálogo (ver spec §2). */
export function decideWelcome(input: { hasLead: boolean; skipped: boolean; qrEventLive: boolean }): WelcomeMode {
  if (input.hasLead) return "NONE";
  if (input.qrEventLive) return "REQUIRED";
  return input.skipped ? "NONE" : "OPTIONAL";
}

const CRAWLER_UA = /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|slurp|bingpreview/i;

/** Buscadores y previews de links: no ven la bienvenida (el catálogo queda indexable). */
export function isCrawlerUserAgent(userAgent: string | null | undefined): boolean {
  return !!userAgent && CRAWLER_UA.test(userAgent);
}
