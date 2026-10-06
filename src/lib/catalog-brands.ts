import { prisma } from "@/lib/prisma";
import { brandLogoSrc } from "@/lib/brand-logo";

export type CatalogBrand = {
  id: string;
  name: string;
  logoUrl: string | null;
  count: number;
  /** Marca virtual: en vez de filtrar por marca, abre el catálogo con este filtro (ej. "crestron=1"). */
  query?: string;
};

/**
 * Crestron Home se muestra como una marca más, pero son los productos de
 * Crestron compatibles con Crestron Home (no se duplican productos).
 */
export const CRESTRON_HOME_ID = "crestron-home";

export function crestronHomeBrand(count: number): CatalogBrand {
  return {
    id: CRESTRON_HOME_ID,
    name: "Crestron Home",
    logoUrl: "/landing/brands/normalized/crestron-home.png",
    count,
    query: "crestron=1",
  };
}

/** Agrega Crestron Home justo después de Crestron (si hay productos). */
export function withCrestronHome(brands: CatalogBrand[], count: number): CatalogBrand[] {
  if (count <= 0) return brands;
  const at = brands.findIndex((b) => b.name.trim().toLowerCase() === "crestron");
  const entry = crestronHomeBrand(count);
  return at < 0 ? [entry, ...brands] : [...brands.slice(0, at + 1), entry, ...brands.slice(at + 1)];
}

/** Query del link de una marca en el catálogo. */
export function brandQuery(brand: CatalogBrand): string {
  return brand.query ?? `brand=${brand.id}`;
}

/** Página de consulta para marcas que todavía no tienen productos cargados. */
export function brandInquiryHref(brandId: string): string {
  return `/consultar?marca=${brandId}`;
}

/** Link de una marca: su listado, o la consulta si todavía no tiene productos. */
export function brandHref(brand: CatalogBrand, basePath: string): string {
  if (!brand.query && brand.count === 0) return brandInquiryHref(brand.id);
  return `${basePath}?${brandQuery(brand)}`;
}

/**
 * Marcas oficiales que todavía no tienen productos activos (ej. recién
 * incorporadas). Se muestran igual y llevan a la consulta.
 */
export async function getBrandsWithoutProducts(): Promise<CatalogBrand[]> {
  const rows = await prisma.brand.findMany({
    where: { isActive: true, hiddenFromCatalog: false, products: { none: { isActive: true } } },
    select: { id: true, name: true, logoUrl: true },
    orderBy: { name: "asc" },
  });
  return rows.map((b) => ({ id: b.id, name: b.name, logoUrl: logoFor(b.id, b.name, b.logoUrl), count: 0 }));
}

/** Total de productos sin contar dos veces los de marcas virtuales. */
export function totalProducts(brands: CatalogBrand[]): number {
  return brands.filter((b) => !b.query).reduce((acc, b) => acc + b.count, 0);
}

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
  javelin: "/landing/brands/normalized/javelin.png",
  "hall tech": "/landing/brands/normalized/hall-tech.png",
  "gain audio": "/landing/brands/normalized/gain-audio.png",
  captivate: "/landing/brands/normalized/captivate.png",
  audinate: "/landing/brands/normalized/dante.png",
  "flatpanel audio": "/landing/brands/normalized/flatpanel-audio.png",
  "flat panel audio": "/landing/brands/normalized/flatpanel-audio.png",
  brightsign: "/landing/brands/normalized/brightsign.png",
  "bluesound professional": "/landing/brands/normalized/bluesound-professional.png",
  bluesound: "/landing/brands/normalized/bluesound-professional.png",
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
  const crestronHomeCount = await prisma.product.count({
    where: { isActive: true, isCrestronHomeCompatible: true, brand: { is: { isActive: true, hiddenFromCatalog: false } } },
  });
  // También las marcas sin productos todavía: van al final y llevan a la consulta.
  const brands = await prisma.brand.findMany({
    where: { isActive: true, hiddenFromCatalog: false },
    select: { id: true, name: true, logoUrl: true, _count: { select: { products: { where: { isActive: true } } } } },
  });
  const list = brands
    .map((b) => ({ id: b.id, name: b.name, logoUrl: logoFor(b.id, b.name, b.logoUrl), count: b._count.products }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
  return withCrestronHome(list, crestronHomeCount);
}

/** Marcas de equipos (sin merchandising) para las pantallas de marca: stand y acceso. */
export async function getEquipmentBrands(): Promise<CatalogBrand[]> {
  const brands = await getCatalogBrands();
  return brands.filter((b) => !/apparel/i.test(b.name));
}
