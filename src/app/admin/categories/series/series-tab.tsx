import { prisma } from "@/lib/prisma";
import { SeriesReview, type SeriesBrandGroup } from "./series-review";

/**
 * Pestaña «Series» de Rubros: series del fabricante por marca, con cantidad de
 * productos y de dónde salieron. Componente de servidor: se monta tal cual
 * dentro de /admin/categories (o en /admin/categories/series).
 */
export async function SeriesTab() {
  const [series, brands, withoutByBrand] = await Promise.all([
    prisma.productLine.findMany({
      select: {
        id: true,
        name: true,
        source: true,
        isReviewed: true,
        brandId: true,
        _count: { select: { products: { where: { isActive: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.brand.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.product.groupBy({ by: ["brandId"], where: { isActive: true, lineId: null, brandId: { not: null } }, _count: { _all: true } }),
  ]);
  const without = new Map(withoutByBrand.map((g) => [g.brandId, g._count._all]));
  const groups: SeriesBrandGroup[] = brands
    .map((b) => ({
      brandId: b.id,
      brand: b.name,
      withoutSeries: without.get(b.id) ?? 0,
      series: series
        .filter((s) => s.brandId === b.id)
        .map((s) => ({ id: s.id, name: s.name, source: s.source, isReviewed: s.isReviewed, products: s._count.products }))
        .sort((x, y) => y.products - x.products || x.name.localeCompare(y.name, "es")),
    }))
    .filter((g) => g.series.length > 0)
    .sort((x, y) => x.brand.localeCompare(y.brand, "es"));

  return <SeriesReview groups={groups} brands={brands} />;
}
