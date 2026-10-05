import { prisma } from "@/lib/prisma";
import { pickShowcase, type ShowcaseCandidate } from "@/lib/expo/showcase";
import { loadProductViewCounts } from "@/server/catalog/product-views";

const SHOWCASE_SELECT = {
  id: true,
  normalizedName: true,
  baseCostUsd: true,
  isCrestronHomeCompatible: true,
  brand: { select: { name: true } },
  images: { orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }], take: 1, select: { url: true } },
};

/**
 * Productos para la vidriera del stand.
 * - Si el evento tiene productos elegidos a mano, esos, en ese orden.
 * - Si no, automático: principales con foto, los más relevantes de cada marca
 *   (más vistos; si no hay datos, Crestron Home y de mayor valor), alternando marcas.
 */
export async function getShowcaseProducts(limit = 30, selectedIds: string[] = []): Promise<ShowcaseCandidate[]> {
  if (selectedIds.length > 0) {
    const rows = await prisma.product.findMany({
      where: { id: { in: selectedIds }, isActive: true, brand: { is: { hiddenFromCatalog: false } } },
      select: SHOWCASE_SELECT,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p && !!p.images[0]?.url)
      .map((p) => ({ id: p.id, name: p.normalizedName, brand: p.brand?.name ?? "", imageUrl: p.images[0].url, score: 0 }));
  }

  const [products, { views }] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, kind: "PRINCIPAL", images: { some: {} }, brand: { isActive: true, hiddenFromCatalog: false } },
      select: SHOWCASE_SELECT,
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

/** Búsqueda para elegir productos de la vidriera (admin). Solo con foto. */
export async function searchShowcaseCandidates(query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      images: { some: {} },
      OR: [
        { normalizedName: { contains: q, mode: "insensitive" } },
        { originalName: { contains: q, mode: "insensitive" } },
        { supplierSku: { contains: q, mode: "insensitive" } },
        { internalSku: { contains: q, mode: "insensitive" } },
        { modelNumber: { contains: q, mode: "insensitive" } },
        { brand: { is: { name: { contains: q, mode: "insensitive" } } } },
      ],
    },
    select: SHOWCASE_SELECT,
    orderBy: [{ kind: "asc" }, { normalizedName: "asc" }],
    take: 24,
  });
  return rows.map((p) => ({ id: p.id, name: p.normalizedName, brand: p.brand?.name ?? "", imageUrl: p.images[0]?.url ?? "" }));
}
