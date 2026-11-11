import type { Metadata } from "next";
import { appUrl } from "@/lib/app-url";

/** Páginas generales con tarjeta propia (logo de Soundtec + marcas). */
export type SiteCardPage = "home" | "catalogo" | "portal" | "expo" | "consultar" | "solicitar";

/** URL absoluta de una tarjeta (WhatsApp necesita la dirección completa). `v` invalida la caché al cambiar el contenido. */
export function ogImageUrl(path: string, version?: string | number | Date): string {
  const v = version instanceof Date ? version.getTime().toString(36) : version;
  return `${appUrl()}${path}${v != null ? `${path.includes("?") ? "&" : "?"}v=${v}` : ""}`;
}

export function siteCardUrl(page: SiteCardPage): string {
  return ogImageUrl(`/api/og/site/${page}`, "2");
}

/**
 * Lo que leen WhatsApp, Facebook, LinkedIn, X o Slack al pegar un enlace:
 * título, descripción e imagen de 1200 × 630. Next reemplaza (no combina) el
 * openGraph del layout, por eso cada página lo arma completo con esto.
 */
export function ogMeta(input: { title: string; description?: string; image: string; path?: string }): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: "Soundtec",
      locale: "es_AR",
      title: input.title,
      description: input.description,
      ...(input.path ? { url: `${appUrl()}${input.path}` } : {}),
      images: [{ url: input.image, width: 1200, height: 630, alt: input.title }],
    },
    twitter: { card: "summary_large_image", title: input.title, description: input.description, images: [input.image] },
  };
}
