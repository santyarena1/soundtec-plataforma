import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { type CatalogBrand } from "@/lib/catalog-brands";
import { BrandMenu } from "./brand-menu";

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
    <section className="mx-auto max-w-5xl">
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
      <div className="mt-5">
        <BrandMenu brands={brands} basePath={basePath} />
      </div>
    </section>
  );
}

/** Pie de la tarjeta de marca: cantidad, «Próximamente» (Admin → Marcas) o la consulta si no tiene productos. */
export function BrandCardCaption({ brand }: { brand: CatalogBrand }) {
  if (brand.comingSoon) {
    return (
      <span className="text-[11px] font-medium text-muted-foreground">
        Próximamente
      </span>
    );
  }
  if (brand.count > 0 || brand.query) {
    return <span className="text-[11px] text-muted-foreground">{brand.count.toLocaleString("es-AR")} productos</span>;
  }
  return <span className="text-[11px] font-medium text-primary">Consultá disponibilidad</span>;
}
