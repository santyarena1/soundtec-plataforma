import Link from "next/link";
import type { CatalogBrand } from "@/lib/catalog-brands";

/** Chips de marca deslizables arriba del listado. */
export function BrandBar({ brands, activeBrandId }: { brands: CatalogBrand[]; activeBrandId: string | null }) {
  const chip = (active: boolean) =>
    `flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition ${
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40"
    }`;
  return (
    <nav aria-label="Marcas" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      <Link href="/catalogo?all=1" className={chip(!activeBrandId)}>Todas</Link>
      {brands.map((brand) => (
        <Link key={brand.id} href={`/catalogo?brand=${brand.id}`} className={chip(brand.id === activeBrandId)}>
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="" className="h-4 w-auto max-w-16 object-contain" />
          ) : null}
          {brand.name}
        </Link>
      ))}
    </nav>
  );
}
