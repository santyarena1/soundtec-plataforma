/**
 * Dirección pública de una lista de precios compartida. Módulo sin base de datos:
 * lo usa también el formulario en el navegador.
 */
export function shareListBaseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    "http://localhost:4010";
  return base.replace(/\/$/, "");
}

/**
 * En el servidor arma la base con las variables de entorno. En el navegador solo existe
 * NEXT_PUBLIC_APP_URL: por eso el formulario recibe la base calculada en el servidor
 * (antes, sin esa variable, el enlace para copiar salía como http://localhost:4010).
 */
export function shareListPublicUrl(shareSlug: string, base: string = shareListBaseUrl()): string {
  return `${base.replace(/\/$/, "")}/lista/${shareSlug}`;
}
