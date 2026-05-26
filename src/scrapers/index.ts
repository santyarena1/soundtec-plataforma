import { Scraper } from "./types";
import { mockScraper } from "./mock";

/**
 * Registro central de scrapers disponibles.
 * Para agregar uno nuevo:
 *   - implementá la interfaz Scraper en src/scrapers/<slug>.ts
 *   - exportá la instancia y agregala a este array.
 */
export const scrapers: Scraper[] = [mockScraper];

export function getScraper(slug: string): Scraper | null {
  return scrapers.find((s) => s.slug === slug) || null;
}

export type { Scraper, ScrapedProduct } from "./types";
