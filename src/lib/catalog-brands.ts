import { prisma } from "@/lib/prisma";

export type CatalogBrand = { id: string; name: string; logoUrl: string | null; count: number };

/** Marcas activas con productos activos, para la grilla y la barra del catálogo público. */
export async function getCatalogBrands(): Promise<CatalogBrand[]> {
  const brands = await prisma.brand.findMany({
    where: { isActive: true, products: { some: { isActive: true } } },
    select: { id: true, name: true, logoUrl: true, _count: { select: { products: { where: { isActive: true } } } } },
  });
  return brands
    .map((b) => ({ id: b.id, name: b.name, logoUrl: b.logoUrl, count: b._count.products }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
}
