import { brandHref, type CatalogBrand } from "@/lib/catalog-brands";
import { BrandBarClient } from "./brand-bar-client";

/** Barra de marcas arriba del listado (los enlaces se arman acá; el desplazamiento, en el cliente). */
export function BrandBar({
  brands,
  activeBrandId,
  basePath = "/catalogo",
}: {
  brands: CatalogBrand[];
  activeBrandId: string | null;
  basePath?: string;
}) {
  return (
    <BrandBarClient
      brands={brands.map((brand) => ({ id: brand.id, name: brand.name, logoUrl: brand.logoUrl, href: brandHref(brand, basePath) }))}
      activeBrandId={activeBrandId}
      basePath={basePath}
    />
  );
}
