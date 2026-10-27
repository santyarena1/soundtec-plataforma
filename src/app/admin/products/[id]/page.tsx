import { listCategoryTree } from "@/lib/category-tree";
import { getExchangeRate } from "@/lib/exchange-rate";
import { productSubtitle, productTitle, tangoCode } from "@/lib/product-display";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth-helpers";
import { permissionsHave } from "@/lib/permissions";
import { EditPriceButton } from "@/components/pricing/edit-price-button";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ProductForm } from "../product-form";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Tags } from "lucide-react";
import { ProductImagesPanel } from "./images-panel";
import { ProductOptionsPanel } from "./options-panel";
import { AccessoriesPanel } from "./accessories-panel";
import { CompatibilityRulesPanel } from "./compatibility-rules-panel";
import { describeRule, ruleWhere } from "@/lib/compatibility-rules";
import { ProductAiAssist } from "./product-ai-assist";
import { LabelSelector } from "@/components/admin/label-selector";
import { getSetting } from "@/lib/settings";
import { PortalDataPanel } from "./portal-data-panel";
import { calculateCustomerPrice } from "@/lib/pricing";
import { BackToCatalogLink } from "@/components/catalog/catalog-memory";
import { ProductTabsProvider, TabPane } from "../product-tabs";
import { PricingRulesPanel } from "./pricing-rules-panel";
import { loadProductPricingRules } from "@/server/actions/product-pricing-rules";

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
  // La ficha del panel muestra costos, proveedores e importación: sin acceso a costos se ve la ficha comercial.
  const access = await requireStaff("products.view");
  if (!access.seesCosts) redirect(`/portal/products/${id}`);
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      brand: { select: { name: true } },
      images: true,
      options: true,
      accessories: {
        where: { kind: { in: ["ACCESSORY", "INCLUDED"] } },
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
  const canSeeRules = access.permissions.fullAccess || permissionsHave(access.permissions, "margins.manage") || permissionsHave(access.permissions, "discounts.manage");
  const pricingRules = canSeeRules ? await loadProductPricingRules(product.id) : null;

  const [brands, distributors, categories, families, tcVentaStr, globalCoefStr, allLabels, priceBreakdown] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.distributor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listCategoryTree(),
    prisma.productFamily.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getExchangeRate().then(String),
    getSetting("app.global_margin_percent", "35"),
    prisma.label.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
    calculateCustomerPrice({
      clientId: null,
      product: {
        productId: product.id,
        baseCostUsd: Number(product.baseCostUsd),
        brandId: product.brandId,
        distributorId: product.distributorId,
        categoryId: product.categoryId,
        familyId: product.familyId,
        familia: product.familia ?? null,
        productDiscountPercent: product.discountPercent == null ? null : Number(product.discountPercent),
        tariffDutyPercent: product.tariffDutyPercent == null ? null : Number(product.tariffDutyPercent),
        coefNac: product.coefNac == null ? null : Number(product.coefNac),
        coefVta: product.coefVta == null ? null : Number(product.coefVta),
        coefVtaFob: product.coefVtaFob == null ? null : Number(product.coefVtaFob),
        ivaPercent: product.ivaPercent == null ? null : Number(product.ivaPercent),
        impIntPercent: product.impIntPercent == null ? null : Number(product.impIntPercent),
      },
    }),
  ]);
  // «Compatible con»: reglas por rubro, marca o línea, y las líneas conocidas para sugerir.
  const [ruleRows, lineRows] = await Promise.all([
    prisma.compatibilityRule.findMany({ where: { productId: product.id }, orderBy: { createdAt: "asc" }, include: { category: { select: { name: true, tangoPath: true } }, brand: { select: { name: true } } } }),
    prisma.product.findMany({ where: { line: { not: null } }, distinct: ["line"], select: { line: true }, orderBy: { line: "asc" }, take: 500 }),
  ]);
  const compatRules = await Promise.all(ruleRows.map(async (r) => ({ id: r.id, label: describeRule(r), count: await prisma.product.count({ where: await ruleWhere(r, product.id) }) })));
  const knownLines = lineRows.map((l) => l.line!).filter(Boolean);

  return (
    <div className="space-y-6 pb-24">
      <BackToCatalogLink
        memoryKey="admin"
        fallbackHref="/admin/products"
        data-tour="products-back-link"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al catálogo
      </BackToCatalogLink>

      <PageHeader
        title={productTitle(product)}
        description={[
          productSubtitle(product),
          tangoCode(product.internalSku) ? `Código Tango: ${tangoCode(product.internalSku)}` : "Sin código Tango",
          product.supplierSku ? `SKU proveedor: ${product.supplierSku}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {product.isActive ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>}
            {product.aiGeneratedDescription ? <Badge tone="accent">Desc. IA</Badge> : null}
            {product.isCustomizable ? <Badge tone="warning">Personalizable</Badge> : null}
            {product.kind === "ACCESORIO" ? <Badge tone="warning">Accesorio</Badge> : <Badge tone="primary">Principal</Badge>}
            {permissionsHave(access.permissions, "margins.manage") ? <EditPriceButton productId={product.id} /> : null}
          </>
        }
      />

      <ProductTabsProvider
        counts={{
          imagenes: product.images.length,
          relaciones: product.options.length + product.accessories.length + compatRules.length,
        }}
      >
      {/* ── Formulario: sus partes van en General, Precio, Comercio exterior y Contenido. Un solo «Guardar». ── */}
      <div data-tour="product-data">
          <ProductForm
            // Se rearma cuando el producto cambia en otro panel (IA, opciones, accesorios):
            // así guardar el formulario no vuelve a los valores viejos.
            key={product.updatedAt.toISOString()}
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
              listPriceUsd: product.listPriceUsd == null ? null : Number(product.listPriceUsd),
              discountPercent: product.discountPercent != null ? Number(product.discountPercent) : null,
              tariffPosition: product.tariffPosition ?? null,
              tariffDutyPercent: product.tariffDutyPercent != null ? Number(product.tariffDutyPercent) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              aecPercent: (product as any).aecPercent != null ? Number((product as any).aecPercent) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              tePercent: (product as any).tePercent != null ? Number((product as any).tePercent) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              coo: (product as any).coo ?? null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              weight: (product as any).weight != null ? Number((product as any).weight) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              volume: (product as any).volume != null ? Number((product as any).volume) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              coefNac: (product as any).coefNac != null ? Number((product as any).coefNac) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              coefVta: (product as any).coefVta != null ? Number((product as any).coefVta) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ivaPercent: (product as any).ivaPercent != null ? Number((product as any).ivaPercent) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              impIntPercent: (product as any).impIntPercent != null ? Number((product as any).impIntPercent) : null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              coefVtaFob: (product as any).coefVtaFob != null ? Number((product as any).coefVtaFob) : null,
              stockStatus: product.stockStatus,
              stockQuantity: product.stockQuantity,
              isCustomizable: product.isCustomizable,
              requiresQuote: product.requiresQuote,
              isCrestronHomeCompatible: product.isCrestronHomeCompatible,
              kind: product.kind,
              accessoryRequiredWithPrimary: product.accessoryRequiredWithPrimary,
              line: product.line,
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
            enginePricing={{
              priceUsdFinal: priceBreakdown.priceUsdFinal,
              priceFobUsd: priceBreakdown.priceFobUsd,
              priceNacFinalArs: priceBreakdown.priceNacFinalArs,
              markupMultiplier: priceBreakdown.markupMultiplier,
              markupSource: priceBreakdown.markupSource,
              appliedMarginRule: priceBreakdown.appliedMarginRule
                ? {
                    name: priceBreakdown.appliedMarginRule.name,
                    scopeType: priceBreakdown.appliedMarginRule.scopeType,
                  }
                : null,
              costoNacUsd: priceBreakdown.costoNacUsd,
              salePriceUsd: product.salePriceUsd == null ? null : Number(product.salePriceUsd),
            }}
            tcVenta={parseFloat(tcVentaStr) || 0}
            globalCoefNac={parseFloat(globalCoefStr) || 35}
          />
      </div>

      {pricingRules?.ok ? (
      <TabPane tab="precio">
        <PricingRulesPanel productId={product.id} data={pricingRules} />
      </TabPane>
      ) : null}

      <TabPane tab="general" className="space-y-4">
      {/* ── Etiquetas ── */}
      <Card data-tour="product-labels">
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

      {/* ── Asistente IA (clasificación) ── */}
      <ProductAiAssist
        productId={product.id}
        productName={product.normalizedName}
        brandName={product.brand?.name ?? null}
      />
      </TabPane>

      <TabPane tab="imagenes">
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

      </TabPane>

      <TabPane tab="relaciones" className="space-y-4">
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
          kind: r.kind as "ACCESSORY" | "INCLUDED",
          isRequired: r.isRequired,
          quantity: r.quantity,
          accessoryProduct: r.accessoryProduct,
        }))}
      />

      <CompatibilityRulesPanel
        productId={product.id}
        initialRules={compatRules}
        nodes={categories}
        brands={brands}
        lines={knownLines}
      />

      </TabPane>

      <TabPane tab="proveedor">
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
      </TabPane>
      </ProductTabsProvider>
    </div>
  );
}
