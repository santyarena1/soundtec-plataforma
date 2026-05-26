import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ShareListForm } from "@/components/admin/share-list-form";

export const metadata = { title: "Admin · Nueva lista compartible" };

export default async function NewShareListPage() {
  await requireAdmin();
  const [clients, brands, categories, families, distributors, products] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true }, orderBy: { companyName: "asc" }, select: { id: true, companyName: true } }),
    prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.productFamily.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.distributor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { normalizedName: "asc" },
      take: 500,
      select: { id: true, normalizedName: true },
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
            products={products.map((p) => ({ id: p.id, name: p.normalizedName }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
