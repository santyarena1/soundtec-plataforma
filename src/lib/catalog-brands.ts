import { prisma } from "@/lib/prisma";
import { brandLogoSrc } from "@/lib/brand-logo";

export type CatalogBrand = { id: string; name: string; logoUrl: string | null; count: number };

/**
 * Logos que ya están en el repo (los de la landing). Se usan cuando la marca
 * no tiene logo cargado en Admin → Marcas; el logo cargado siempre gana.
 */
const LOCAL_LOGOS: Record<string, string> = {
  crestron: "/landing/brands/normalized/crestron.png",
  sonance: "/landing/brands/normalized/sonance.png",
  james: "/landing/brands/normalized/james.png",
  iport: "/landing/brands/normalized/iport.png",
  trufig: "/landing/brands/normalized/trufig.png",
  soundtube: "/landing/brands/normalized/soundtube.png",
  "blaze by sonance": "/landing/brands/normalized/blaze.png",
  blaze: "/landing/brands/normalized/blaze.png",
  atlona: "/landing/brands/normalized/atlona.png",
  audinate: "/landing/brands/normalized/dante.png",
  dante: "/landing/brands/normalized/dante.png",
};

function logoFor(id: string, name: string, logoUrl: string | null): string | null {
  return brandLogoSrc({ id, logoUrl }) || LOCAL_LOGOS[name.trim().toLowerCase()] || null;
}

/**
 * Marcas del portal de un cliente: parte de las facetas ya filtradas por su
 * visibilidad (id, nombre, cantidad) y les suma el logo.
 */
export async function brandsWithLogos(facets: Array<{ id: string; name: string; count: number }>): Promise<CatalogBrand[]> {
  if (facets.length === 0) return [];
  const rows = await prisma.brand.findMany({
    where: { id: { in: facets.map((f) => f.id) } },
    select: { id: true, logoUrl: true },
  });
  const logoById = new Map(rows.map((r) => [r.id, r.logoUrl]));
  return facets
    .map((f) => ({ id: f.id, name: f.name, logoUrl: logoFor(f.id, f.name, logoById.get(f.id) ?? null), count: f.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
}

/** Marcas activas con productos activos, para la grilla y la barra del catálogo público. */
export async function getCatalogBrands(): Promise<CatalogBrand[]> {
  const brands = await prisma.brand.findMany({
    where: { isActive: true, hiddenFromCatalog: false, products: { some: { isActive: true } } },
    select: { id: true, name: true, logoUrl: true, _count: { select: { products: { where: { isActive: true } } } } },
  });
  return brands
    .map((b) => ({ id: b.id, name: b.name, logoUrl: logoFor(b.id, b.name, b.logoUrl), count: b._count.products }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
}

/** Marcas de equipos (sin merchandising) para las pantallas de marca: stand y acceso. */
export async function getEquipmentBrands(): Promise<CatalogBrand[]> {
  const brands = await getCatalogBrands();
  return brands.filter((b) => !/apparel/i.test(b.name));
}
