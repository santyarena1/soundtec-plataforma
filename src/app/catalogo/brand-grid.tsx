import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CatalogBrand } from "@/lib/catalog-brands";

/** Primera pantalla del catálogo: elegir marca o ver todo. */
export function BrandGrid({
  brands,
  total,
  basePath = "/catalogo",
}: {
  brands: CatalogBrand[];
  total: number;
  basePath?: string;
}) {
  return (
    <section className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold sm:text-3xl">¿Qué marca buscás?</h1>
      <p className="mt-1 text-sm text-muted-foreground">Elegí una para empezar.</p>
      <Link
        href={`${basePath}?all=1`}
        className="mt-5 flex items-center justify-between rounded-xl bg-primary px-5 py-4 font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
      >
        Ver todos los productos
        <span className="flex items-center gap-1 text-sm font-normal opacity-90">
          {total.toLocaleString("es-AR")} <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {brands.map((brand) => (
          <Link
            key={brand.id}
            href={`${basePath}?brand=${brand.id}`}
            className="flex h-28 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 shadow-sm transition hover:border-primary/40 hover:shadow-md active:scale-[0.98]"
          >
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.name} className="max-h-10 max-w-[80%] object-contain" />
            ) : (
              <span className="text-center text-base font-bold tracking-wide">{brand.name}</span>
            )}
            <span className="text-[11px] text-muted-foreground">{brand.count.toLocaleString("es-AR")} productos</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
