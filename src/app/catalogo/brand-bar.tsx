import Link from "next/link";
import type { CatalogBrand } from "@/lib/catalog-brands";

/** Chips de marca deslizables arriba del listado. */
export function BrandBar({
  brands,
  activeBrandId,
  basePath = "/catalogo",
}: {
  brands: CatalogBrand[];
  activeBrandId: string | null;
  basePath?: string;
}) {
  const chip = (active: boolean) =>
    `flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition ${
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40"
    }`;
  return (
    <nav aria-label="Marcas" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
      <Link href={`${basePath}?all=1`} className={chip(!activeBrandId)}>Todas</Link>
      {brands.map((brand) => (
        <Link key={brand.id} href={`${basePath}?brand=${brand.id}`} className={chip(brand.id === activeBrandId)}>
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.name} title={brand.name} className="h-7 w-auto max-w-[7rem] object-contain" />
          ) : (
            brand.name
          )}
        </Link>
      ))}
    </nav>
  );
}
