import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseShareListFilters, resolveShareablePriceListProducts } from "@/lib/shareable-price-list";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ShareListTable } from "./share-list-table";

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
          <ShareListTable
            items={items}
            showSku={list.showSku}
            showStock={list.showStock}
            hidePrices={list.hidePrices}
          />
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Precios en USD · referencia comercial Soundtec. Sujetos a confirmación al formalizar pedido.
        </p>
      </main>
    </div>
  );
}
