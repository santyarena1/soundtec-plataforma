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
import { getOrCreateActiveDraft } from "@/lib/draft-request";
import { AiContentNotice } from "./ai-content-notice";
import { ProductConfigurator } from "./configurator";
import { CompatibleAccessoriesSection } from "./compatible-accessories";
import { AccessoryInfoBanner } from "@/components/portal/accessory-warning";
import { formatUsd, formatPercent } from "@/lib/utils";
import { ArrowLeft, Sparkles } from "lucide-react";

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
              kind: true,
              accessoryRequiredWithPrimary: true,
              isActive: true,
              images: { where: { isPrimary: true }, take: 1 },
            },
          },
        },
        orderBy: { createdAt: "asc" },
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
      productDiscountPercent: product.discountPercent ? Number(product.discountPercent) : null,
      tariffDutyPercent: product.tariffDutyPercent ? Number(product.tariffDutyPercent) : null,
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

  const activeAccessoriesRaw = product.accessories.filter((r) => r.accessoryProduct.isActive);
  const activeAccessories: typeof activeAccessoriesRaw = [];
  for (const r of activeAccessoriesRaw) {
    if (isAdminViewer) {
      activeAccessories.push(r);
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
    if (vis) activeAccessories.push(r);
  }

  const accessoryPrices =
    activeAccessories.length > 0 && (commercialClientId || isAdminViewer)
      ? await calculatePricesForProducts(
          activeAccessories.map((r) => ({
            productId: r.accessoryProduct.id,
            baseCostUsd: Number(r.accessoryProduct.baseCostUsd),
            brandId: r.accessoryProduct.brandId,
            distributorId: r.accessoryProduct.distributorId,
            categoryId: r.accessoryProduct.categoryId,
            familyId: r.accessoryProduct.familyId,
            productDiscountPercent: r.accessoryProduct.discountPercent
              ? Number(r.accessoryProduct.discountPercent)
              : null,
            tariffDutyPercent: r.accessoryProduct.tariffDutyPercent
              ? Number(r.accessoryProduct.tariffDutyPercent)
              : null,
          })),
          commercialClientId,
          globalMargin
        )
      : new Map();

  const compatibleAccessoryItems = activeAccessories.map((r) => ({
    relationId: r.id,
    productId: r.accessoryProduct.id,
    name: r.accessoryProduct.normalizedName,
    shortDescription: r.accessoryProduct.shortDescription,
    imageUrl: r.accessoryProduct.images[0]?.url ?? null,
    stockStatus: r.accessoryProduct.stockStatus,
    stockQuantity: r.accessoryProduct.stockQuantity,
    isRequired: r.isRequired,
    finalPriceUsd: accessoryPrices.get(r.accessoryProduct.id)?.finalPriceUsd ?? 0,
    kind: r.accessoryProduct.kind as "PRINCIPAL" | "ACCESORIO",
    accessoryRequiredWithPrimary: r.accessoryProduct.accessoryRequiredWithPrimary,
  }));

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

      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        <div className="space-y-3 lg:sticky lg:top-6">
          <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border bg-secondary shadow-sm">
            {product.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.images[0].url} alt={product.normalizedName} className="h-full w-full object-contain p-4" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Producto sin imagen
              </div>
            )}
          </div>
          {product.images.length > 1 ? (
            <div className="grid grid-cols-4 gap-2">
              {product.images.slice(0, 8).map((img) => (
                <div key={img.id} className="aspect-square overflow-hidden rounded-md border border-border bg-secondary">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.alt || ""} className="h-full w-full object-contain p-1" />
                </div>
              ))}
            </div>
          ) : null}
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
            <CardContent className="p-5">
              {pricing.discountPercent > 0 ? (
                <p className="text-sm text-muted-foreground line-through">
                  {formatUsd(pricing.priceBeforeDiscountUsd)}
                </p>
              ) : null}
              <p className="text-3xl font-semibold tracking-tight">{formatUsd(pricing.finalPriceUsd)}</p>
              <p className="muted-text mt-1 text-sm">Precio final en USD · tu lista de precios</p>

              {isAdmin ? (
                <div className="mt-4 rounded-md border border-dashed border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Vista administrativa</p>
                  <ul className="mt-2 space-y-1">
                    <li>Costo base: {formatUsd(pricing.baseCostUsd)}</li>
                    <li>Margen aplicado: {formatPercent(pricing.marginPercent)}{pricing.appliedMarginRule ? ` · ${pricing.appliedMarginRule.name}` : ""}</li>
                    <li>Precio antes de descuento: {formatUsd(pricing.priceBeforeDiscountUsd)}</li>
                    <li>Descuento aplicado: {formatPercent(pricing.discountPercent)}{pricing.appliedDiscountRule ? ` · ${pricing.appliedDiscountRule.name}` : pricing.discountSource === "PRODUCT" ? " · descuento del producto" : ""}</li>
                  </ul>
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <FavoriteButton productId={product.id} isFavorite={!!favItem} label />
                {product.isCustomizable && product.options.length > 0 ? (
                  <a href="#configurador" className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-secondary">
                    Configurar producto
                  </a>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <AddToRequestPanel
            productId={product.id}
            draftRequestId={activeDraft.id}
            draftType={activeDraft.type}
            draftItemCount={activeDraft.itemCount}
            accessoryContext={accessoryContext}
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
        />
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center gap-2">
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
