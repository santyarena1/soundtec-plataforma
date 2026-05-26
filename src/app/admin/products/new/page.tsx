import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ProductForm } from "../product-form";

export const metadata = { title: "Admin · Nuevo producto" };

export default async function NewProductPage() {
  await requireAdmin();
  const [brands, distributors, categories, families] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.distributor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.productFamily.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Nuevo producto" description="Cargá un producto manualmente al catálogo." />
      <Card>
        <CardContent className="p-6">
          <ProductForm brands={brands} distributors={distributors} categories={categories} families={families} />
        </CardContent>
      </Card>
    </div>
  );
}
