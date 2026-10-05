import { prisma } from "@/lib/prisma";
import { pickShowcase, type ShowcaseCandidate } from "@/lib/expo/showcase";
import { loadProductViewCounts } from "@/server/catalog/product-views";

/**
 * Productos para la vidriera del stand: principales con foto, los más
 * relevantes de cada marca (más vistos; si no hay datos, Crestron Home y de
 * mayor valor), alternando marcas.
 */
export async function getShowcaseProducts(limit = 30): Promise<ShowcaseCandidate[]> {
  const [products, { views }] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, kind: "PRINCIPAL", images: { some: {} }, brand: { isActive: true } },
      select: {
        id: true,
        normalizedName: true,
        baseCostUsd: true,
        isCrestronHomeCompatible: true,
        brand: { select: { name: true } },
        images: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { url: true } },
      },
    }),
    loadProductViewCounts(),
  ]);
  const candidates: ShowcaseCandidate[] = products.map((p) => ({
    id: p.id,
    name: p.normalizedName,
    brand: p.brand?.name ?? "",
    imageUrl: p.images[0]?.url ?? "",
    // Vistas mandan; después Crestron Home; después valor (costo).
    score: (views.get(p.id) ?? 0) * 1e7 + (p.isCrestronHomeCompatible ? 1e6 : 0) + Math.min(Number(p.baseCostUsd), 999_999),
  }));
  return pickShowcase(candidates, { perBrand: 3, limit });
}
