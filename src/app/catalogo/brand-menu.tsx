import { CRESTRON_HOME_ID, brandHref, type CatalogBrand } from "@/lib/catalog-brands";
import { groupAriaLabel, groupHref, packMenuRows, type LayoutCell } from "@/lib/brand-layout";
import { groupBrands } from "@/server/catalog/brand-layout";
import type { BrandUiCell, BrandUiItem } from "./brand-ui";
import { BrandMenuClient, type BrandMenuBox } from "./brand-menu-client";

/** Marca del catálogo → lo que dibuja el cliente (enlace ya armado). */
export function toBrandUiItem(brand: CatalogBrand, basePath: string): BrandUiItem & { query?: string } {
  return {
    id: brand.id,
    name: brand.name,
    logoUrl: brand.logoUrl,
    href: brandHref(brand, basePath),
    comingSoon: brand.comingSoon ?? false,
    inquiry: !brand.comingSoon && !brand.query && brand.count === 0,
    // Crestron Home lleva su nombre escrito al lado del isotipo (sin rótulo extra) para que no se confunda con Crestron.
    caption: brand.id === CRESTRON_HOME_ID ? "" : undefined,
    query: brand.query,
  };
}

export function toUiCell(cell: LayoutCell<BrandUiItem>): BrandUiCell {
  return cell.type === "brand" ? { type: "brand", brand: cell.brand } : cell;
}

/**
 * Menú de marcas para elegir por dónde entrar (catálogo público, portal sin
 * filtros e inicio del portal). Los grupos y su orden salen de Admin › Marcas.
 */
export async function BrandMenu({ brands, basePath }: { brands: CatalogBrand[]; basePath: string }) {
  const resolved = await groupBrands(brands.map((brand) => toBrandUiItem(brand, basePath)));
  const rows: BrandMenuBox[][] = packMenuRows(resolved.groups).map((row) =>
    row.map((box): BrandMenuBox => {
      // Un grupo (salvo «separadas», como Crestron | Crestron Home) es un solo enlace: lleva a todas sus marcas juntas.
      const link = box.cells.length > 1 && !box.separate ? groupHref(box.cells, basePath) : null;
      return { kind: box.kind, cells: box.cells.map(toUiCell), group: link ? { href: link.href, label: groupAriaLabel(box.cells) } : undefined };
    })
  );
  return <BrandMenuClient rows={rows} extras={resolved.extras} />;
}
