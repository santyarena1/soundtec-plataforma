import type { CatalogBrand } from "@/lib/catalog-brands";
import { buildBarEntries, groupHref, panelMembers } from "@/lib/brand-layout";
import { groupBrands } from "@/server/catalog/brand-layout";
import { toBrandUiItem, toUiCell } from "./brand-menu";
import { BrandBarClient, type BrandBarEntry } from "./brand-bar-client";

/**
 * Barra de marcas arriba del listado: la principal de cada grupo (al tocarla
 * filtra el grupo entero y despliega sus hermanas para afinar) y, al final, las
 * marcas sin grupo. Los grupos salen de Admin › Marcas. Crestron es un grupo
 * más: «Ver todas» es todo Crestron y Crestron Home (compatibles) se elige adentro.
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
    // «Ver todas»: las marcas reales del grupo juntas (?brand=a&brand=b…). Crestron Home
    // es virtual (filtra por compatibilidad): queda afuera porque ya está dentro de Crestron.
    const all = groupHref(entry.members, basePath);
    const groupIds = all?.ids ?? [];
    return {
      type: "family",
      lead: entry.lead,
      members: panelMembers(entry.members, groupIds).map(toUiCell),
      memberIds: entry.members.flatMap((cell) => (cell.type === "brand" ? [cell.brand.id] : [])),
      groupIds,
      allHref: all?.href ?? entry.lead.href,
    };
  });
  const active = activeBrandIds?.length ? activeBrandIds : activeBrandId ? [activeBrandId] : [];
  return <BrandBarClient entries={entries} activeIds={active} basePath={basePath} />;
}
