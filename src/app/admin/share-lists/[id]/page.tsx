import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ShareListForm } from "@/components/admin/share-list-form";
import { parseShareListFilters } from "@/lib/shareable-price-list";

export const metadata = { title: "Admin · Editar lista compartible" };

export default async function EditShareListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();

  const list = await prisma.shareablePriceList.findUnique({ where: { id }, include: { views: { orderBy: { viewedAt: "desc" }, take: 10 } } });
  if (!list) notFound();
  const filters = parseShareListFilters(list.filters);
  const selectedIds = [...new Set([...(filters.productIds || []), ...(filters.excludeProductIds || [])])];

  const [clients, brands, categories, families, distributors, products] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true }, orderBy: { companyName: "asc" }, select: { id: true, companyName: true } }),
    prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.productFamily.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.distributor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.product.findMany({
      where: { id: { in: selectedIds } },
      orderBy: { normalizedName: "asc" },
      select: { id: true, normalizedName: true, internalSku: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={list.name} description="Editá filtros, cliente de precios y opciones del link público." />
      <Card>
        <CardContent className="p-6">
          <ShareListForm
            list={{
              id: list.id,
              name: list.name,
              description: list.description,
              shareSlug: list.shareSlug,
              status: list.status,
              clientId: list.clientId,
              showSku: list.showSku,
              showStock: list.showStock,
              hidePrices: list.hidePrices,
              expiresAt: list.expiresAt?.toISOString() ?? null,
              filters,
            }}
            clients={clients}
            brands={brands}
            categories={categories}
            families={families}
            distributors={distributors}
            products={products.map((p) => ({ id: p.id, name: p.normalizedName, sku: p.internalSku }))}
          />
        </CardContent>
      </Card>
      <Card><CardContent className="p-6"><h2 className="mb-3 font-semibold">Últimas vistas</h2>
        {list.views.length ? <ul className="divide-y divide-border text-sm">{list.views.map((view) => <li key={view.id} className="flex justify-between py-2"><span>{view.userAgent?.match(/Mobile|Android|iPhone/i) ? "Móvil" : "Escritorio"}</span><span className="text-muted-foreground">{view.viewedAt.toLocaleString("es-AR")}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Todavía no hay vistas registradas.</p>}
      </CardContent></Card>
    </div>
  );
}
