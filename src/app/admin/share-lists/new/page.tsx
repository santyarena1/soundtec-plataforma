import { shareListBaseUrl } from "@/lib/share-list-url";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ShareListForm } from "@/components/admin/share-list-form";
import { listCategoryTree } from "@/lib/category-tree";

export const metadata = { title: "Admin · Nueva lista compartible" };

export default async function NewShareListPage({ searchParams }: { searchParams: Promise<{ productIds?: string }> }) {
  await requireStaff("share_lists.manage");
  const requestedIds = (await searchParams).productIds?.split(",").filter(Boolean).slice(0, 200) || [];
  const [clients, brands, categories, families, distributors, products] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true }, orderBy: { companyName: "asc" }, select: { id: true, companyName: true } }),
    prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listCategoryTree(),
    prisma.productFamily.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.distributor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.product.findMany({
      where: { isActive: true, id: { in: requestedIds } },
      orderBy: { normalizedName: "asc" },
      select: { id: true, normalizedName: true, internalSku: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Nueva lista de precios" description="Definí filtros y generá un link único para compartir." />
      <Card>
        <CardContent className="p-6">
          <ShareListForm
            clients={clients}
            brands={brands}
            categories={categories}
            families={families}
            distributors={distributors}
            publicBaseUrl={shareListBaseUrl()}
            products={products.map((p) => ({ id: p.id, name: p.normalizedName, sku: p.internalSku }))}
            initialProductIds={requestedIds}
          />
        </CardContent>
      </Card>
    </div>
  );
}
