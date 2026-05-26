import { Scraper, ScrapedProduct } from "./types";

export const mockScraper: Scraper = {
  slug: "mock",
  label: "Scraper de ejemplo",
  supportsSearch: true,
  supportsProductPage: false,
  async searchProducts(query: string, options) {
    const limit = options?.limit ?? 5;
    const items: ScrapedProduct[] = Array.from({ length: limit }, (_, i) => ({
      supplierSku: `MOCK-${query.slice(0, 3).toUpperCase()}-${i + 1}`,
      name: `${query} resultado ${i + 1} (mock)`,
      brand: null,
      category: null,
      baseCostUsd: Math.round((100 + i * 25 + Math.random() * 50) * 100) / 100,
      currency: "USD",
      stockStatus: "UNKNOWN",
      shortDescription: `Producto generado por el scraper mock para la consulta "${query}".`,
      longDescription: null,
      imageUrl: `https://placehold.co/600x400/1e3553/ffffff/png?text=${encodeURIComponent(query)}`,
      sourceUrl: `https://example.com/mock?q=${encodeURIComponent(query)}&i=${i}`,
      raw: { mock: true, index: i, query },
    }));
    return items;
  },
  async fetchProductPage() {
    return null;
  },
};
