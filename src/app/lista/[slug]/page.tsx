import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseShareListFilters, resolveShareablePriceListProducts } from "@/lib/shareable-price-list";
import { formatDate, formatUsd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { StockBadge } from "@/app/portal/products/catalog-grid";

export const metadata = { title: "Lista de precios" };

export default async function PublicShareListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const list = await prisma.shareablePriceList.findUnique({
    where: { shareSlug: slug },
    include: { client: { select: { companyName: true } } },
  });

  if (!list || list.status !== "ACTIVE") notFound();
  if (list.expiresAt && list.expiresAt < new Date()) notFound();

  void prisma.shareablePriceList
    .update({ where: { id: list.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

  const filters = parseShareListFilters(list.filters);
  const items = await resolveShareablePriceListProducts({
    filters,
    clientId: list.clientId,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Soundtec · Lista de precios</p>
          <h1 className="heading-2 mt-1 text-2xl sm:text-3xl">{list.name}</h1>
          {list.description ? <p className="muted-text mt-2 max-w-2xl">{list.description}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {list.client ? <Badge tone="primary">Precios: {list.client.companyName}</Badge> : null}
            <Badge tone="muted">{items.length} producto{items.length === 1 ? "" : "s"}</Badge>
            {list.expiresAt ? <span>Válida hasta {formatDate(list.expiresAt)}</span> : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            Esta lista no tiene productos con los filtros actuales.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  {list.showSku ? <th className="px-3 py-2">SKU</th> : null}
                  <th className="px-3 py-2">Marca</th>
                  <th className="px-3 py-2">Categoría</th>
                  {list.showStock ? <th className="px-3 py-2">Stock</th> : null}
                  {!list.hidePrices ? <th className="px-3 py-2 text-right">Precio USD</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border/80 hover:bg-secondary/30">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageUrl} alt="" className="h-10 w-10 rounded object-cover bg-secondary" />
                        ) : null}
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.shortDescription ? (
                            <p className="line-clamp-1 text-xs text-muted-foreground">{item.shortDescription}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    {list.showSku ? (
                      <td className="px-3 py-2.5 text-muted-foreground">{item.sku || "—"}</td>
                    ) : null}
                    <td className="px-3 py-2.5">{item.brandName || "—"}</td>
                    <td className="px-3 py-2.5">{item.categoryName || "—"}</td>
                    {list.showStock ? (
                      <td className="px-3 py-2.5">
                        <StockBadge status={item.stockStatus} qty={item.stockQuantity} />
                      </td>
                    ) : null}
                    {!list.hidePrices ? (
                      <td className="px-3 py-2.5 text-right font-semibold">
                        {item.pricing.discountPercent > 0 ? (
                          <span className="mr-2 text-xs font-normal text-muted-foreground line-through">
                            {formatUsd(item.pricing.priceBeforeDiscountUsd)}
                          </span>
                        ) : null}
                        {formatUsd(item.pricing.finalPriceUsd)}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Precios en USD · referencia comercial Soundtec. Sujetos a confirmación al formalizar pedido.
        </p>
      </main>
    </div>
  );
}
