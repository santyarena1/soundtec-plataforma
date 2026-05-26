import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ProductForm } from "../product-form";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { ProductImagesPanel } from "./images-panel";
import { AiDescriptionPanel } from "./ai-description-panel";
import { ProductOptionsPanel } from "./options-panel";
import { AccessoriesPanel } from "./accessories-panel";
import { AiClassificationPanel } from "./ai-classification-panel";

export default async function AdminProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      images: true,
      options: true,
      accessories: {
        include: {
          accessoryProduct: {
            select: { id: true, normalizedName: true, internalSku: true, kind: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!product) notFound();

  const [brands, distributors, categories, families, accessoryCandidates] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.distributor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.productFamily.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.product.findMany({
      where: { id: { not: id }, isActive: true },
      orderBy: { normalizedName: "asc" },
      select: { id: true, normalizedName: true, internalSku: true, kind: true },
      take: 400,
    }),
  ]);

  return (
    <div className="space-y-6">
      <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver
      </Link>
      <PageHeader
        title={product.normalizedName}
        description={`SKU: ${product.internalSku || "—"}`}
        actions={
          <>
            {product.isActive ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>}
            {product.aiGeneratedDescription ? <Badge tone="accent">Desc. IA</Badge> : null}
            {product.isCustomizable ? <Badge tone="warning">Personalizable</Badge> : null}
            {product.kind === "ACCESORIO" ? <Badge tone="warning">Accesorio</Badge> : <Badge tone="primary">Principal</Badge>}
          </>
        }
      />

      <Card>
        <CardContent className="p-6">
          <ProductForm
            product={{
              id: product.id,
              internalSku: product.internalSku,
              supplierSku: product.supplierSku,
              normalizedName: product.normalizedName,
              originalName: product.originalName,
              brandId: product.brandId,
              distributorId: product.distributorId,
              categoryId: product.categoryId,
              familyId: product.familyId,
              shortDescription: product.shortDescription,
              longDescription: product.longDescription,
              baseCostUsd: Number(product.baseCostUsd),
              discountPercent: product.discountPercent ? Number(product.discountPercent) : null,
              tariffPosition: product.tariffPosition ?? null,
              tariffDutyPercent: product.tariffDutyPercent ? Number(product.tariffDutyPercent) : null,
              stockStatus: product.stockStatus,
              stockQuantity: product.stockQuantity,
              isCustomizable: product.isCustomizable,
              kind: product.kind,
              accessoryRequiredWithPrimary: product.accessoryRequiredWithPrimary,
              isActive: product.isActive,
            }}
            brands={brands}
            distributors={distributors}
            categories={categories}
            families={families}
          />
        </CardContent>
      </Card>

      <AiClassificationPanel productId={product.id} />

      <AiDescriptionPanel
        productId={product.id}
        current={product.longDescription}
        isAi={product.aiGeneratedDescription}
      />

      <ProductImagesPanel
        productId={product.id}
        productName={product.normalizedName}
        images={product.images.map((i) => ({
          id: i.id,
          url: i.url,
          alt: i.alt,
          isPrimary: i.isPrimary,
          source: i.source,
        }))}
      />

      <ProductOptionsPanel
        productId={product.id}
        options={product.options.map((o) => ({
          id: o.id,
          name: o.name,
          type: o.type,
          values: o.values,
          priceDeltaUsd: o.priceDeltaUsd,
          isRequired: o.isRequired,
        }))}
      />

      <AccessoriesPanel
        productId={product.id}
        relations={product.accessories.map((r) => ({
          id: r.id,
          isRequired: r.isRequired,
          accessoryProduct: r.accessoryProduct,
        }))}
        candidates={accessoryCandidates}
      />
    </div>
  );
}
