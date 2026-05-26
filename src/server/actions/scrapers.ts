"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { getScraper } from "@/scrapers";

const schema = z.object({
  slug: z.string().min(1),
  query: z.string().min(1).max(200),
});

export async function runScraperSearch(input: z.infer<typeof schema>) {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" } as const;

  const scraper = getScraper(parsed.data.slug);
  if (!scraper) return { ok: false, error: "Scraper no registrado" } as const;
  if (!scraper.supportsSearch) return { ok: false, error: "El scraper no soporta búsqueda" } as const;

  try {
    const items = await scraper.searchProducts(parsed.data.query, { limit: 10 });
    return {
      ok: true,
      items: items.map((i) => ({
        name: i.name,
        supplierSku: i.supplierSku,
        baseCostUsd: i.baseCostUsd,
        sourceUrl: i.sourceUrl,
      })),
    } as const;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Error en scraper" } as const;
  }
}
