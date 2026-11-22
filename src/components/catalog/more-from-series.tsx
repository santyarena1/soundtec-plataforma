import Link from "next/link";
import { CatalogGrid } from "@/app/portal/products/catalog-grid";
import type { CatalogProduct } from "@/lib/catalog";
import { moreFromSeriesTitle } from "@/lib/product-lines/chip";

/**
 * «Más de la serie X» al pie de la ficha: hasta 8 productos de la misma serie y
 * marca que el cliente puede ver, con enlace a la serie completa en la marca.
 */
export function MoreFromSeries({
  seriesName,
  items,
  seeAllHref,
  basePath,
  publicMode = false,
  internal = false,
}: {
  seriesName: string | null;
  items: CatalogProduct[];
  seeAllHref: string;
  basePath: string;
  publicMode?: boolean;
  internal?: boolean;
}) {
  if (!seriesName || items.length === 0) return null;
  return (
    <section aria-labelledby="mas-de-la-serie" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="mas-de-la-serie" className="heading-3">
          {moreFromSeriesTitle(seriesName)}
        </h2>
        <Link href={seeAllHref} className="text-sm font-medium text-accent hover:underline">
          Ver toda la serie
        </Link>
      </div>
      <CatalogGrid items={items} basePath={basePath} publicMode={publicMode} internal={internal} />
    </section>
  );
}
