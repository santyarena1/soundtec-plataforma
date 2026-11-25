import type { CatalogBrand } from "@/lib/catalog-brands";
import { buildBarEntries } from "@/lib/brand-layout";
import { groupBrands } from "@/server/catalog/brand-layout";
import { toBrandUiItem, toUiCell } from "./brand-menu";
import { BrandBarClient, type BrandBarEntry } from "./brand-bar-client";

/**
 * Barra de marcas arriba del listado: la principal de cada grupo (que despliega
 * sus hermanas y «Ver todas»), Crestron y Crestron Home por separado y, al
 * final, las marcas sin grupo. Los grupos salen de Admin › Marcas.
 */
export async function BrandBar({
  brands,
  activeBrandId,
  activeBrandIds,
  basePath = "/catalogo",
}: {
  brands: CatalogBrand[];
  activeBrandId: string | null;
  /** Marcas filtradas en la URL (varias cuando se eligió «Ver todas» de un grupo). */
  activeBrandIds?: string[];
  basePath?: string;
}) {
  const resolved = await groupBrands(brands.map((brand) => toBrandUiItem(brand, basePath)));
  const entries: BrandBarEntry[] = buildBarEntries(resolved).map((entry): BrandBarEntry => {
    if (entry.type !== "family") return entry;
    // «Ver todas»: las marcas reales del grupo juntas (?brand=a&brand=b…).
    const ids = entry.members.flatMap((cell) => (cell.type === "brand" && !cell.brand.query ? [cell.brand.id] : []));
    return {
      type: "family",
      lead: entry.lead,
      members: entry.members.map(toUiCell),
      memberIds: ids,
      allHref: `${basePath}?${ids.map((id) => `brand=${encodeURIComponent(id)}`).join("&")}`,
    };
  });
  const active = activeBrandIds?.length ? activeBrandIds : activeBrandId ? [activeBrandId] : [];
  return <BrandBarClient entries={entries} activeIds={active} basePath={basePath} />;
}
