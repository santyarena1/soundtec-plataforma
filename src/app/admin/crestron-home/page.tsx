import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CrestronActionsBar } from "./crestron-actions";
import { ProductCompatList } from "./product-compat-list";

export const metadata = { title: "Admin · Crestron Home" };

export default async function CrestronHomePage() {
  await requireAdmin();

  const [products, compatibleCount] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ isCrestronHomeCompatible: "desc" }, { normalizedName: "asc" }],
      select: { id: true, internalSku: true, normalizedName: true, isCrestronHomeCompatible: true },
    }),
    prisma.product.count({ where: { isCrestronHomeCompatible: true } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crestron Home"
        description={`${compatibleCount} de ${products.length} productos marcados como compatibles`}
        actions={<CrestronActionsBar />}
      />

      <Card>
        <CardContent className="p-5">
          <ProductCompatList products={products} />
        </CardContent>
      </Card>
    </div>
  );
}
