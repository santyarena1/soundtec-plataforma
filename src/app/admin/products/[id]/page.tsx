import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ProductForm } from "../product-form";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  FileText,
  Sparkles,
  Tags,
  ImageIcon,
  Sliders,
  Package,
  Database,
} from "lucide-react";
import { ProductImagesPanel } from "./images-panel";
import { ProductOptionsPanel } from "./options-panel";
import { AccessoriesPanel } from "./accessories-panel";
import { ProductAiAssist } from "./product-ai-assist";
import { LabelSelector } from "@/components/admin/label-selector";
import { getSetting } from "@/lib/settings";
import { PortalDataPanel } from "./portal-data-panel";

interface SectionRef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: SectionRef[] = [
  { id: "datos", label: "Datos generales", icon: FileText },
  { id: "etiquetas", label: "Etiquetas", icon: Tags },
  { id: "ia", label: "Asistente IA", icon: Sparkles },
  { id: "imagenes", label: "Imágenes", icon: ImageIcon },
  { id: "opciones", label: "Opciones configurables", icon: Sliders },
  { id: "accesorios", label: "Accesorios compatibles", icon: Package },
  { id: "proveedor", label: "Datos del proveedor", icon: Database },
];

function SectionHeader({
  id,
  icon: Icon,
  title,
  description,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div
        id={id}
        className="-mt-20 pt-20 sr-only"
        aria-hidden="true"
      />
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-accent" />
      </div>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

export default async function AdminProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      brand: { select: { name: true } },
      images: true,
      options: true,
      accessories: {
        where: { kind: "ACCESSORY" },
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
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al catálogo
      </Link>

      <PageHeader
        title={product.normalizedName}
        description={`SKU: ${product.internalSku || "—"}${product.supplierSku ? ` · Proveedor: ${product.supplierSku}` : ""}`}
        actions={
          <>
            {product.isActive ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>}
            {product.aiGeneratedDescription ? <Badge tone="accent">Desc. IA</Badge> : null}
            {product.isCustomizable ? <Badge tone="warning">Personalizable</Badge> : null}
            {product.kind === "ACCESORIO" ? <Badge tone="warning">Accesorio</Badge> : <Badge tone="primary">Principal</Badge>}
          </>
        }
      />

      {/* ── Navegación rápida por sección ── */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-1.5">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors"
              >
                <s.icon className="h-3 w-3" />
                {s.label}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── 1. Datos generales (form principal) ── */}
      <Card>
        <CardContent className="p-6">
          <SectionHeader
            id="datos"
            icon={FileText}
            title="Datos generales"
            description="Identificación, clasificación, descripciones, precios, NCM y disponibilidad. Se guardan con el botón al final."
          />
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
              fieldUpdatedAt:
                (product as unknown as { fieldUpdatedAt?: unknown }).fieldUpdatedAt &&
                typeof (product as unknown as { fieldUpdatedAt?: unknown }).fieldUpdatedAt === "object" &&
                !Array.isArray((product as unknown as { fieldUpdatedAt?: unknown }).fieldUpdatedAt)
                  ? (product as unknown as { fieldUpdatedAt: Record<string, string> }).fieldUpdatedAt
                  : null,
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

      {/* ── 2. Etiquetas ── */}
      <Card>
        <CardContent className="p-6">
          <SectionHeader
            id="etiquetas"
            icon={Tags}
            title="Etiquetas"
            description="Asignación de labels para filtros y agrupaciones del catálogo."
          />
          <LabelSelector
            productId={product.id}
            allLabels={allLabels}
            currentLabelIds={product.labels.map((l) => l.labelId)}
          />
        </CardContent>
      </Card>

      {/* ── 3. Asistente IA ── */}
      <div id="ia" className="-mt-20 pt-20 sr-only" aria-hidden="true" />
      <ProductAiAssist
        productId={product.id}
        productName={product.normalizedName}
        brandName={product.brand?.name ?? null}
      />

      {/* ── 4. Imágenes ── */}
      <div id="imagenes" className="-mt-20 pt-20 sr-only" aria-hidden="true" />
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

      {/* ── 5. Opciones configurables ── */}
      <div id="opciones" className="-mt-20 pt-20 sr-only" aria-hidden="true" />
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

      {/* ── 6. Accesorios compatibles ── */}
      <div id="accesorios" className="-mt-20 pt-20 sr-only" aria-hidden="true" />
      <AccessoriesPanel
        productId={product.id}
        relations={product.accessories.map((r) => ({
          id: r.id,
          isRequired: r.isRequired,
          accessoryProduct: r.accessoryProduct,
        }))}
        candidates={accessoryCandidates}
      />

      {/* ── 7. Datos del proveedor (Sonance / portal) ── */}
      <div id="proveedor" className="-mt-20 pt-20 sr-only" aria-hidden="true" />
      <PortalDataPanel
        /* eslint-disable @typescript-eslint/no-explicit-any */
        modelNumber={(product as any).modelNumber ?? null}
        manufacturerItem={(product as any).manufacturerItem ?? null}
        productLine={(product as any).productLine ?? null}
        vendorProductUrl={(product as any).vendorProductUrl ?? null}
        urlSlug={(product as any).urlSlug ?? null}
        metaTitle={(product as any).metaTitle ?? null}
        metaDescription={(product as any).metaDescription ?? null}
        metaKeywords={(product as any).metaKeywords ?? null}
        videoUrl={(product as any).videoUrl ?? null}
        salePriceUsd={(product as any).salePriceUsd != null ? Number((product as any).salePriceUsd) : null}
        salePriceStartsAt={(product as any).salePriceStartsAt ?? null}
        salePriceEndsAt={(product as any).salePriceEndsAt ?? null}
        salePriceLabel={(product as any).salePriceLabel ?? null}
        availabilityMessage={(product as any).availabilityMessage ?? null}
        availabilityType={(product as any).availabilityType ?? null}
        widthCm={(product as any).widthCm != null ? Number((product as any).widthCm) : null}
        heightCm={(product as any).heightCm != null ? Number((product as any).heightCm) : null}
        depthCm={(product as any).depthCm != null ? Number((product as any).depthCm) : null}
        requiresQuote={(product as any).requiresQuote ?? false}
        htmlContent={(product as any).htmlContent ?? null}
        specifications={(product as any).specifications ?? null}
        documents={(product as any).documents ?? null}
        badges={(product as any).badges ?? null}
        sourceMetadata={(product as any).sourceMetadata ?? null}
        enrichedAt={(product as any).enrichedAt ?? null}
        translatedAt={(product as any).translatedAt ?? null}
        /* eslint-enable @typescript-eslint/no-explicit-any */
      />
    </div>
  );
}
