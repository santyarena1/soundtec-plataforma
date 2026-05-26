/**
 * Interfaz común para todos los scrapers de proveedores.
 *
 * Para agregar un nuevo proveedor:
 *  1. Crear un archivo en src/scrapers/<slug>.ts.
 *  2. Implementar `Scraper` y exportarlo desde src/scrapers/index.ts.
 *  3. (Opcional) Disparar un job desde /admin/scrapers que llame a `searchProducts`
 *     o `fetchProductPage` y persista los resultados como RawImportedProduct para
 *     pasar por el mismo flujo de aprobación que las importaciones Excel.
 *
 * Decisión:
 *  - No se incluyen scrapers reales en el repo hasta tener URLs concretas
 *    autorizadas. Hay un scraper mock para que la UI funcione end-to-end.
 */

export interface ScrapedProduct {
  supplierSku: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  baseCostUsd: number | null;
  currency: string | null;
  stockStatus: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  raw: Record<string, unknown>;
}

export interface Scraper {
  slug: string;
  label: string;
  supportsSearch: boolean;
  supportsProductPage: boolean;
  searchProducts(query: string, options?: { limit?: number }): Promise<ScrapedProduct[]>;
  fetchProductPage(url: string): Promise<ScrapedProduct | null>;
}

export function normalizeScrapedProduct(s: ScrapedProduct) {
  return {
    supplierSku: s.supplierSku?.trim() || null,
    name: s.name.trim(),
    brand: s.brand?.trim() || null,
    category: s.category?.trim() || null,
    baseCostUsd: s.baseCostUsd ?? null,
    currency: s.currency || "USD",
    stockStatus: s.stockStatus || "UNKNOWN",
    shortDescription: s.shortDescription?.trim() || null,
    longDescription: s.longDescription?.trim() || null,
    imageUrl: s.imageUrl || null,
    sourceUrl: s.sourceUrl,
  };
}
