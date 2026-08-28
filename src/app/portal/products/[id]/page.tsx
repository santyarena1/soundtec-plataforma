import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { calculateCustomerPrice, calculatePricesForProducts, isProductVisibleToClient } from "@/lib/pricing";
import { resolveCommercialClientId } from "@/lib/client-context";
import { evaluateAccessoryPolicy } from "@/lib/accessory-context";
import { getGlobalMarginPercent } from "@/lib/settings";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { FavoriteButton } from "../favorite-button";
import { StockBadge } from "../catalog-grid";
import { AddToRequestPanel } from "./add-to-request-panel";
import { ProductBundleProvider, BundleStagingPanel } from "./product-bundle";
import { ProductGallery } from "./product-gallery";
import { getOrCreateActiveDraft } from "@/lib/draft-request";
import { AiContentNotice } from "./ai-content-notice";
import { ProductConfigurator } from "./configurator";
import { CompatibleAccessoriesSection } from "./compatible-accessories";
import { AccessoryInfoBanner } from "@/components/portal/accessory-warning";
import { productCoverImageInclude } from "@/lib/product-cover-image";
import { ProductRichInfo } from "./product-rich-info";
import { formatUsd, formatPercent } from "@/lib/utils";
import { ArrowLeft, Sparkles, FileText } from "lucide-react";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const product = await prisma.product.findFirst({
    where: { id, isActive: true },
    include: {
      brand: true,
      category: true,
      family: true,
      images: { orderBy: { isPrimary: "desc" } },
      options: { orderBy: { sortOrder: "asc" } },
      accessories: {
        include: {
          accessoryProduct: {
            select: {
              id: true,
              normalizedName: true,
              shortDescription: true,
              stockStatus: true,
              stockQuantity: true,
              baseCostUsd: true,
              brandId: true,
              distributorId: true,
              categoryId: true,
              familyId: true,
              discountPercent: true,
              tariffDutyPercent: true,
              coefNac: true,
              coefVta: true,
              coefVtaFob: true,
              ivaPercent: true,
              impIntPercent: true,
              kind: true,
              accessoryRequiredWithPrimary: true,
              isActive: true,
              images: productCoverImageInclude,
            },
          },
        },
        // ACCESSORY primero (más importantes en la UI), luego CROSS_SELL, luego ALSO_PURCHASED
        orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
      },
      accessoryFor: {
        include: {
          product: { select: { id: true, normalizedName: true } },
        },
      },
    },
  });
  if (!product) notFound();

  const isAdminViewer = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const commercialClientId = !isAdminViewer ? await resolveCommercialClientId(user.id) : null;
  if (!isAdminViewer) {
    if (!commercialClientId) notFound();
    const allowed = await isProductVisibleToClient(
      {
        id: product.id,
        brandId: product.brandId,
        categoryId: product.categoryId,
        distributorId: product.distributorId,
        familyId: product.familyId,
      },
      commercialClientId
    );
    if (!allowed) notFound();
  }

  const [favItem, activeDraft, globalMargin] = await Promise.all([
    prisma.wishlistItem.findFirst({
      where: { productId: product.id, wishlist: { userId: user.id } },
    }),
    getOrCreateActiveDraft(user.id, { migrateLegacyCart: true }).then(async (d) => ({
      id: d.id,
      type: d.type,
      itemCount: await prisma.customerRequestItem.count({
        where: { requestId: d.id, isAdminSuggestion: false },
      }),
    })),
    getGlobalMarginPercent(),
  ]);

  const isAdmin = isAdminViewer;
  const pricing = await calculateCustomerPrice({
    product: {
      productId: product.id,
      baseCostUsd: Number(product.baseCostUsd),
      brandId: product.brandId,
      distributorId: product.distributorId,
      categoryId: product.categoryId,
      familyId: product.familyId,
      familia: product.familia ?? null,
      productDiscountPercent: product.discountPercent ? Number(product.discountPercent) : null,
      tariffDutyPercent: product.tariffDutyPercent ? Number(product.tariffDutyPercent) : null,
      coefNac: product.coefNac != null ? Number(product.coefNac) : null,
      coefVta: product.coefVta != null ? Number(product.coefVta) : null,
      coefVtaFob: product.coefVtaFob != null ? Number(product.coefVtaFob) : null,
      ivaPercent: product.ivaPercent != null ? Number(product.ivaPercent) : null,
      impIntPercent: product.impIntPercent != null ? Number(product.impIntPercent) : null,
    },
    clientId: commercialClientId,
    defaultGlobalMarginPercent: globalMargin,
  });

  const aiFeedback = product.aiGeneratedDescription
    ? await prisma.aiContentFeedback.findFirst({
        where: { type: "PRODUCT_DESCRIPTION", refId: product.id, userId: user.id },
      })
    : null;

  const accessoryPolicy = await evaluateAccessoryPolicy({ productId: product.id });
  const accessoryContext =
    accessoryPolicy.needsAcknowledgement && accessoryPolicy.warningMessage
      ? {
          showWarning: true,
          warningMessage: accessoryPolicy.warningMessage,
          compatiblePrimaries: accessoryPolicy.compatiblePrimaries,
        }
      : null;

  // Filtramos por activos y visibilidad del cliente UNA VEZ — luego separamos por kind.
  const activeAccessoriesRaw = product.accessories.filter((r) => r.accessoryProduct.isActive);
  const visibleRelations: typeof activeAccessoriesRaw = [];
  for (const r of activeAccessoriesRaw) {
    if (isAdminViewer) {
      visibleRelations.push(r);
      continue;
    }
    const vis = await isProductVisibleToClient(
      {
        id: r.accessoryProduct.id,
        brandId: r.accessoryProduct.brandId,
        categoryId: r.accessoryProduct.categoryId,
        distributorId: r.accessoryProduct.distributorId,
        familyId: r.accessoryProduct.familyId,
      },
      commercialClientId!
    );
    if (vis) visibleRelations.push(r);
  }
  const activeAccessories = visibleRelations.filter((r) => r.kind === "ACCESSORY");
  const crossSellRelations = visibleRelations.filter((r) => r.kind === "CROSS_SELL");
  const alsoPurchasedRelations = visibleRelations.filter((r) => r.kind === "ALSO_PURCHASED");

  // Precios calculados UNA vez para todas las relaciones visibles
  const allRelationProducts = visibleRelations.map((r) => r.accessoryProduct);
  const relationPrices =
    allRelationProducts.length > 0 && (commercialClientId || isAdminViewer)
      ? await calculatePricesForProducts(
          allRelationProducts.map((p) => ({
            productId: p.id,
            baseCostUsd: Number(p.baseCostUsd),
            brandId: p.brandId,
            distributorId: p.distributorId,
            categoryId: p.categoryId,
            familyId: p.familyId,
            productDiscountPercent: p.discountPercent ? Number(p.discountPercent) : null,
            tariffDutyPercent: p.tariffDutyPercent ? Number(p.tariffDutyPercent) : null,
            coefNac: p.coefNac != null ? Number(p.coefNac) : null,
            coefVta: p.coefVta != null ? Number(p.coefVta) : null,
            coefVtaFob: p.coefVtaFob != null ? Number(p.coefVtaFob) : null,
            ivaPercent: p.ivaPercent != null ? Number(p.ivaPercent) : null,
            impIntPercent: p.impIntPercent != null ? Number(p.impIntPercent) : null,
          })),
          commercialClientId,
          globalMargin
        )
      : new Map();

  function relationToItem(r: (typeof visibleRelations)[number]) {
    return {
      relationId: r.id,
      productId: r.accessoryProduct.id,
      name: r.accessoryProduct.normalizedName,
      shortDescription: r.accessoryProduct.shortDescription,
      imageUrl: r.accessoryProduct.images[0]?.url ?? null,
      stockStatus: r.accessoryProduct.stockStatus,
      stockQuantity: r.accessoryProduct.stockQuantity,
      isRequired: r.isRequired,
      finalPriceUsd: relationPrices.get(r.accessoryProduct.id)?.finalPriceUsd ?? 0,
      kind: r.accessoryProduct.kind as "PRINCIPAL" | "ACCESORIO",
      accessoryRequiredWithPrimary: r.accessoryProduct.accessoryRequiredWithPrimary,
    };
  }
  const compatibleAccessoryItems = activeAccessories.map(relationToItem);
  const crossSellItems = crossSellRelations.map(relationToItem);
  const alsoPurchasedItems = alsoPurchasedRelations.map(relationToItem);

  return (
    <div className="space-y-6">
      <Link
        href="/portal/products"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al catálogo
      </Link>

      {accessoryContext ? (
        <AccessoryInfoBanner
          message={accessoryContext.warningMessage}
          compatiblePrimaries={accessoryContext.compatiblePrimaries}
        />
      ) : null}

      <ProductBundleProvider
        mainProduct={{
          id: product.id,
          name: product.normalizedName,
          unitPriceUsd: pricing.finalPriceUsd,
          imageUrl: product.images[0]?.url ?? null,
        }}
        draftRequestId={activeDraft.id}
      >
      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        <div className="lg:sticky lg:top-6">
          <ProductGallery
            images={product.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt }))}
            productName={product.normalizedName}
          />
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {product.brand?.name || "Marca"}
              {product.category?.name ? ` · ${product.category.name}` : ""}
              {product.family?.name ? ` · ${product.family.name}` : ""}
            </p>
            <h1 className="heading-2 text-2xl leading-tight sm:text-3xl">{product.normalizedName}</h1>
            {product.shortDescription ? (
              <p className="muted-text mt-2">{product.shortDescription}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StockBadge status={product.stockStatus} qty={product.stockQuantity} />
              {product.isCustomizable ? <Badge tone="accent">Configurable</Badge> : null}
              {product.kind === "ACCESORIO" ? <Badge tone="warning">Accesorio</Badge> : <Badge tone="primary">Producto principal</Badge>}
              {pricing.discountPercent > 0 ? (
                <Badge tone="success">Descuento {formatPercent(pricing.discountPercent)}</Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">SKU: {product.internalSku || "—"}</span>
            </div>
          </div>

          <Card className="border-primary/10 bg-gradient-to-br from-card to-primary/5">
            <CardContent className="p-5 space-y-3">
              {pricing.discountPercent > 0 ? (
                <p className="text-sm text-muted-foreground line-through">
                  {formatUsd(pricing.priceBeforeDiscountUsd)}
                </p>
              ) : null}
              <p className="text-3xl font-semibold tracking-tight">{formatUsd(pricing.finalPriceUsd)}</p>
              <p className="muted-text text-sm">Precio final en USD · tu lista de precios</p>

              {isAdmin ? (
                <div className="rounded-md border border-dashed border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Vista administrativa</p>
                  <ul className="mt-2 space-y-1">
                    <li>Costo base: {formatUsd(pricing.baseCostUsd)}</li>
                    <li>Margen aplicado: {formatPercent(pricing.marginPercent)}{pricing.appliedMarginRule ? ` · ${pricing.appliedMarginRule.name}` : ""}</li>
                    <li>Precio antes de descuento: {formatUsd(pricing.priceBeforeDiscountUsd)}</li>
                    <li>Descuento aplicado: {formatPercent(pricing.discountPercent)}{pricing.appliedDiscountRule ? ` · ${pricing.appliedDiscountRule.name}` : pricing.discountSource === "PRODUCT" ? " · descuento del producto" : ""}</li>
                  </ul>
                </div>
              ) : null}

              <div className="pt-2 flex flex-wrap items-center gap-2">
                <FavoriteButton productId={product.id} isFavorite={!!favItem} label />
                {product.isCustomizable && product.options.length > 0 ? (
                  <a href="#configurador" className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-secondary">
                    Configurar producto
                  </a>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <BundleStagingPanel
            draftItemCount={activeDraft.itemCount}
            draftRequestId={activeDraft.id}
          />
        </div>
      </div>

      {product.isCustomizable && product.options.length > 0 ? (
        <div id="configurador">
          <ProductConfigurator
            productId={product.id}
            basePrice={pricing.finalPriceUsd}
            options={product.options.map((o) => ({
              id: o.id,
              name: o.name,
              type: o.type,
              values: o.values,
              priceDeltaUsd: o.priceDeltaUsd != null ? Number(o.priceDeltaUsd) : null,
              isRequired: o.isRequired,
            }))}
            draftRequestId={activeDraft.id}
            accessoryContext={accessoryContext}
          />
        </div>
      ) : null}


      {compatibleAccessoryItems.length > 0 ? (
        <CompatibleAccessoriesSection
          parentProductName={product.normalizedName}
          items={compatibleAccessoryItems}
          variant="ACCESSORY"
        />
      ) : null}

      {crossSellItems.length > 0 ? (
        <CompatibleAccessoriesSection
          parentProductName={product.normalizedName}
          items={crossSellItems}
          variant="CROSS_SELL"
        />
      ) : null}

      {alsoPurchasedItems.length > 0 ? (
        <CompatibleAccessoriesSection
          parentProductName={product.normalizedName}
          items={alsoPurchasedItems}
          variant="ALSO_PURCHASED"
        />
      ) : null}
      </ProductBundleProvider>

      <ProductRichInfo
        /* eslint-disable @typescript-eslint/no-explicit-any */
        specifications={(product as any).specifications ?? null}
        documents={(product as any).documents ?? null}
        badges={(product as any).badges ?? null}
        videoUrl={(product as any).videoUrl ?? null}
        htmlContent={(product as any).htmlContent ?? null}
        widthCm={(product as any).widthCm != null ? Number((product as any).widthCm) : null}
        heightCm={(product as any).heightCm != null ? Number((product as any).heightCm) : null}
        depthCm={(product as any).depthCm != null ? Number((product as any).depthCm) : null}
        weight={(product as any).weight != null ? Number((product as any).weight) : null}
        modelNumber={(product as any).modelNumber ?? null}
        manufacturerItem={(product as any).manufacturerItem ?? null}
        productLine={(product as any).productLine ?? null}
        /* eslint-enable @typescript-eslint/no-explicit-any */
        isCrestronHomeCompatible={product.isCrestronHomeCompatible}
      />

      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-accent" />
            <CardTitle>Descripción técnica</CardTitle>
            {product.aiGeneratedDescription ? (
              <Badge tone="accent">
                <Sparkles className="h-3 w-3" /> Generado con IA
              </Badge>
            ) : null}
          </div>
          {product.longDescription ? (
            <div className="prose prose-sm max-w-none text-foreground">
              {product.longDescription.split("\n").map((line, i) => (
                <p key={i} className="my-2">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="muted-text">Sin descripción detallada cargada.</p>
          )}

          {product.aiGeneratedDescription ? (
            <AiContentNotice
              entity="Product"
              refId={product.id}
              type="PRODUCT_DESCRIPTION"
              existingVerdict={aiFeedback?.verdict ?? null}
              existingComment={aiFeedback?.comment ?? null}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
