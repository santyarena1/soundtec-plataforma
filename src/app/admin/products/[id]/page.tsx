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
import { LabelSelector } from "@/components/admin/label-selector";
import { getSetting } from "@/lib/settings";

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
      labels: { select: { labelId: true } },
    },
  });
  if (!product) notFound();

  const [brands, distributors, categories, families, accessoryCandidates, tcVentaStr, globalCoefStr, allLabels] = await Promise.all([
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
    getSetting("pricing.tc_venta", "0"),
    getSetting("app.global_margin_percent", "35"),
    prisma.label.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              familia: (product as any).familia ?? null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              tipo: (product as any).tipo ?? null,
              shortDescription: product.shortDescription,
              longDescription: product.longDescription,
              baseCostUsd: Number(product.baseCostUsd),
              discountPercent: product.discountPercent ? Number(product.discountPercent) : null,
              tariffPosition: product.tariffPosition ?? null,
              tariffDutyPercent: product.tariffDutyPercent ? Number(product.tariffDutyPercent) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              aecPercent: (product as any).aecPercent ? Number((product as any).aecPercent) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              tePercent: (product as any).tePercent ? Number((product as any).tePercent) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              coo: (product as any).coo ?? null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              weight: (product as any).weight ? Number((product as any).weight) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              volume: (product as any).volume ? Number((product as any).volume) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              coefNac: (product as any).coefNac ? Number((product as any).coefNac) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              coefVta: (product as any).coefVta ? Number((product as any).coefVta) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ivaPercent: (product as any).ivaPercent ? Number((product as any).ivaPercent) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              impIntPercent: (product as any).impIntPercent ? Number((product as any).impIntPercent) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              coefVtaFob: (product as any).coefVtaFob ? Number((product as any).coefVtaFob) : null,
              stockStatus: product.stockStatus,
              stockQuantity: product.stockQuantity,
              isCustomizable: product.isCustomizable,
              isCrestronHomeCompatible: product.isCrestronHomeCompatible,
              kind: product.kind,
              accessoryRequiredWithPrimary: product.accessoryRequiredWithPrimary,
              isActive: product.isActive,
            }}
            brands={brands}
            distributors={distributors}
            categories={categories}
            families={families}
            tcVenta={parseFloat(tcVentaStr) || 0}
            globalCoefNac={parseFloat(globalCoefStr) || 35}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Etiquetas</h3>
          <LabelSelector
            productId={product.id}
            allLabels={allLabels}
            currentLabelIds={product.labels.map((l) => l.labelId)}
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
