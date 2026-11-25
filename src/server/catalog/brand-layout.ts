import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { BRAND_LAYOUT_SETTING_KEY, parseBrandGroups, resolveBrandGroups, type BrandGroupsConfig, type LayoutBrand, type ResolvedBrandGroups } from "@/lib/brand-layout";

/**
 * Grupos de marcas (Admin › Marcas) y los nombres de todas las marcas de la
 * base (para distinguir «no existe → Próximamente» de «existe pero no se ve»).
 */
export async function loadBrandGroups(): Promise<{ config: BrandGroupsConfig; knownBrandNames: string[] }> {
  const [raw, rows] = await Promise.all([
    getSetting(BRAND_LAYOUT_SETTING_KEY, ""),
    prisma.brand.findMany({ select: { name: true, slug: true } }).catch(() => [] as Array<{ name: string; slug: string }>),
  ]);
  return { config: parseBrandGroups(raw), knownBrandNames: rows.flatMap((r) => [r.name, r.slug]) };
}

/** Las marcas que ve quien navega, ubicadas en sus grupos. */
export async function groupBrands<B extends LayoutBrand>(brands: B[]): Promise<ResolvedBrandGroups<B>> {
  const { config, knownBrandNames } = await loadBrandGroups();
  return resolveBrandGroups(config, brands, knownBrandNames);
}
