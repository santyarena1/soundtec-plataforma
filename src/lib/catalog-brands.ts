import { prisma } from "@/lib/prisma";

export type CatalogBrand = { id: string; name: string; logoUrl: string | null; count: number };

/**
 * Logos que ya están en el repo (los de la landing). Se usan cuando la marca
 * no tiene logo cargado en Admin → Marcas; el logo cargado siempre gana.
 */
const LOCAL_LOGOS: Record<string, string> = {
  crestron: "/landing/brands/crestron.png",
  soundtube: "/landing/brands/soundtube.png",
  "blaze by sonance": "/landing/brands/blaze.png",
  blaze: "/landing/brands/blaze.png",
  atlona: "/landing/brands/atlona.png",
  audinate: "/landing/brands/dante.png",
  dante: "/landing/brands/dante.png",
};

function logoFor(name: string, logoUrl: string | null): string | null {
  return logoUrl?.trim() || LOCAL_LOGOS[name.trim().toLowerCase()] || null;
}

/** Marcas activas con productos activos, para la grilla y la barra del catálogo público. */
export async function getCatalogBrands(): Promise<CatalogBrand[]> {
  const brands = await prisma.brand.findMany({
    where: { isActive: true, products: { some: { isActive: true } } },
    select: { id: true, name: true, logoUrl: true, _count: { select: { products: { where: { isActive: true } } } } },
  });
  return brands
    .map((b) => ({ id: b.id, name: b.name, logoUrl: logoFor(b.name, b.logoUrl), count: b._count.products }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
}
