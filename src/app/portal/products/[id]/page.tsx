import { GALLERY_IMAGE_ORDER, GALLERY_VIDEO_ORDER } from "@/lib/product-media";
import { hasConfigurator, productSubtitle, productTitle, tangoCode } from "@/lib/product-display";
import { notFound } from "next/navigation";
import Link from "next/link";
import { describeRule } from "@/lib/compatibility-rules";
import { getCurrentPermissions, requireUser } from "@/lib/auth-helpers";
import { canSeeCosts, isPanelRole, permissionsHave } from "@/lib/permissions";
import { EditPriceButton } from "@/components/pricing/edit-price-button";
import { prisma } from "@/lib/prisma";
import { calculateCustomerPrice, calculatePricesForProducts, isProductVisibleToClient } from "@/lib/pricing";
import { resolveCommercialClientId } from "@/lib/client-context";
import { evaluateAccessoryPolicy } from "@/lib/accessory-context";
import { getGlobalMarginPercent } from "@/lib/settings";
import { Badge } from "@/components/ui/badge";
import { commercialTagFor } from "@/lib/commercial-tags";
import { CommercialTagBadge, ProductLabelChips } from "@/components/catalog/commercial-tag-badge";
import { ProductPrice } from "@/components/catalog/product-price";
import { CompareToggle } from "@/components/compare/compare-toggle";
import { getConditionsView } from "@/server/catalog/client-conditions";
import { ProductKeyFeatures } from "@/components/catalog/product-key-features";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { FavoriteButton } from "../favorite-button";
import { OriginStockPanel, StockBadge } from "@/components/catalog/stock-badge";
import { customerHiddenCategoryIds } from "@/lib/customer-hidden-categories";
import { customerCategoryName } from "@/lib/tango-only";
import { PriceTaxNotice } from "@/components/catalog/price-tax-notice";
import { CategoryPath } from "@/components/catalog/category-path";
import { productCategoryCrumbs } from "@/lib/category-tree";
import { FeaturedStarButton } from "../featured-star-button";
import { FeaturedRubroButton } from "@/components/catalog/featured-rubro-button";
import { isLongDescriptionAiGenerated } from "@/lib/ai-content";
import { AddToRequestPanel } from "./add-to-request-panel";
import { ProductBundleProvider, BundleStagingPanel } from "./product-bundle";
import { ProductGallery } from "./product-gallery";
import { getOrCreateActiveDraft } from "@/lib/draft-request";
import { CUSTOMER_ORDERS_ENABLED } from "@/lib/customer-orders";
import { SOUNDTEC_PHONE, SOUNDTEC_PHONE_HREF, SOUNDTEC_SALES_EMAIL, salesMailHref } from "@/lib/company-contact";
import { AiContentNotice } from "./ai-content-notice";
import { ProductConfigurator } from "./configurator";
import { CompatibleAccessoriesSection } from "./compatible-accessories";
import { AccessoryInfoBanner } from "@/components/portal/accessory-warning";
import { productCoverImageInclude } from "@/lib/product-cover-image";
import { ProductRichInfo } from "./product-rich-info";
import { recordProductView } from "@/server/catalog/product-views";
import { formatUsd, formatPercent } from "@/lib/utils";
import { ArrowLeft, Sparkles, FileText } from "lucide-react";
import { BackToCatalogLink } from "@/components/catalog/catalog-memory";
import { MoreFromSeries } from "@/components/catalog/more-from-series";
import { getMoreFromSeries } from "@/lib/catalog";
import { AdminQuickEdit } from "@/components/admin-quick-edit/admin-quick-edit";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const product = await prisma.product.findFirst({
    where: { id, isActive: true },
    include: {
      brand: true,
      category: true,
      series: { select: { id: true, name: true } },
      images: { orderBy: GALLERY_IMAGE_ORDER },
      videos: { orderBy: GALLERY_VIDEO_ORDER },
      labels: { select: { label: { select: { id: true, name: true, color: true } } } },
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

  // Admins y equipo interno ven todo el catálogo con precio de venta general; solo los admins ven costos.
  const isAdminViewer = isPanelRole(user.role);
  const commercialClientId = !isAdminViewer ? await resolveCommercialClientId(user.id) : null;
  // «Activá tus descuentos»: con condiciones propias se ve lista hasta que el cliente lo prende.
  const priceClientId = commercialClientId ? (await getConditionsView(user.id, commercialClientId)).priceClientId : null;
  if (!isAdminViewer) {
    if (!commercialClientId) notFound();
    if (product.brand?.hiddenFromCatalog) notFound();
    // Rubros que solo ve el equipo (Indumentaria).
    if (product.categoryId && (await customerHiddenCategoryIds()).includes(product.categoryId)) notFound();
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
    // Las visitas del equipo interno no cuentan para "Más relevantes".
    await recordProductView(product.id, user.id);
  }
  // «Más de la serie»: lo que ve este usuario de la misma serie y marca (no espera al resto).
  const moreFromSeriesPromise = getMoreFromSeries(
    { id: product.id, lineId: product.lineId, brandId: product.brandId },
    { commercialClientId, userId: user.id, isAdmin: isAdminViewer, priceClientId }
  );

  // Camino del rubro (el equipo lo ve aunque sea «Sin categorizar» o un rubro viejo).
  const categoryCrumbs = await productCategoryCrumbs(product.categoryId, { customer: !isAdminViewer });
  const [favItem, activeDraft, globalMargin] = await Promise.all([
    prisma.wishlistItem.findFirst({
      where: { productId: product.id, wishlist: { userId: user.id } },
    }),
    // Pedidos apagados (src/lib/customer-orders.ts): no se crea ni se lee el borrador.
    CUSTOMER_ORDERS_ENABLED
      ? getOrCreateActiveDraft(user.id, { migrateLegacyCart: true }).then(async (d) => ({
          id: d.id,
          type: d.type,
          itemCount: await prisma.customerRequestItem.count({
            where: { requestId: d.id, isAdminSuggestion: false },
          }),
        }))
      : null,
    getGlobalMarginPercent(),
  ]);

  const viewerPermissions = isAdminViewer ? (await getCurrentPermissions()).permissions : null;
  const isAdmin = !!viewerPermissions && canSeeCosts(viewerPermissions);
  const canEditPrices = isAdmin && permissionsHave(viewerPermissions!, "margins.manage");
  // Estrella (sale primero en su marca): quien edita productos.
  const canFeature = !!viewerPermissions && permissionsHave(viewerPermissions, "products.edit");
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
    clientId: priceClientId,
    defaultGlobalMarginPercent: globalMargin,
  });

  // Cartel comercial (descuento, A pedido…) y etiquetas del panel, junto al título.
  const commercialTag = commercialTagFor({
    commercialTag: product.commercialTag,
    discountPercent: pricing.discountPercent,
    priceOnRequest: product.requiresQuote || pricing.finalPriceUsd <= 0,
  });
  const productLabels = product.labels.map((l) => l.label).sort((a, b) => a.name.localeCompare(b.name, "es-AR", { sensitivity: "base" }));

  // Cartel «Generado con IA»: solo la descripción larga y solo si la escribió la IA (ver lib/ai-content).
  const aiLongDescription = isLongDescriptionAiGenerated(product);
  const aiFeedback = aiLongDescription
      ? await prisma.aiContentFeedback.findFirst({
        where: { type: "PRODUCT_DESCRIPTION", refId: product.id, userId: user.id },
        orderBy: { createdAt: "desc" },
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
  const includedRelations = visibleRelations.filter((r) => r.kind === "INCLUDED");
  const variantRelations = visibleRelations.filter((r) => r.kind === "MODEL_VARIANT");
  const relatedRelations = visibleRelations.filter((r) => r.kind === "RELATED");
  const compatibleRelations = visibleRelations.filter((r) => r.kind === "COMPATIBLE");

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
          priceClientId,
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
      quantity: r.quantity,
    };
  }
  const compatibleAccessoryItems = activeAccessories.map(relationToItem);
  const crossSellItems = crossSellRelations.map(relationToItem);
  const alsoPurchasedItems = alsoPurchasedRelations.map(relationToItem);
  const includedItems = includedRelations.map(relationToItem);
  const variantItems = variantRelations.map(relationToItem);
  const relatedItems = relatedRelations.map(relationToItem);
  const compatibleItems = compatibleRelations.map(relationToItem);
  // «Compatible con» por grupo (rubro, marca, línea): se muestra el grupo con un link al catálogo filtrado.
  const compatGroups = (
    await prisma.compatibilityRule.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: "asc" },
      include: { category: { select: { name: true, tangoPath: true } }, brand: { select: { name: true } } },
    })
  ).map((r) => {
    const sp = new URLSearchParams();
    if (r.categoryId) sp.set("category", r.categoryId);
    if (r.brandId) sp.set("brand", r.brandId);
    if (r.line) sp.set("q", r.line);
    return { id: r.id, label: describeRule(r), href: `/portal/products?${sp.toString()}` };
  });

  return (
    <div className="space-y-6">
      <BackToCatalogLink
        memoryKey="portal"
        fallbackHref="/portal/products"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al catálogo
      </BackToCatalogLink>

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
          // «Consultá precio»: el armado no muestra un precio aunque haya costo cargado.
          unitPriceUsd: product.requiresQuote ? 0 : pricing.finalPriceUsd,
          imageUrl: product.images[0]?.url ?? null,
        }}
        draftRequestId={activeDraft?.id ?? ""}
      >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 lg:sticky lg:top-6">
          <ProductGallery
            images={product.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, isPrimary: i.isPrimary, sortOrder: i.sortOrder, createdAt: i.createdAt }))}
            videos={product.videos.map((v) => ({ id: v.id, provider: v.provider, videoId: v.videoId, url: v.url, title: v.title, sortOrder: v.sortOrder, createdAt: v.createdAt }))}
            productName={product.normalizedName}
          />
        </div>

        <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
          <div className="space-y-2">
            <CategoryPath
              linkLast
              className="text-xs"
              crumbs={categoryCrumbs.map((c) => ({ ...c, href: `/portal/products?category=${c.id}` }))}
            />
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {product.brand?.name || "Marca"}
              {customerCategoryName(product.category) ? ` · ${customerCategoryName(product.category)}` : ""}
              {product.series?.name ? ` · Serie ${product.series.name}` : ""}
            </p>
            {commercialTag || productLabels.length ? (
              <div className="flex flex-wrap items-center gap-2">
                {commercialTag ? <CommercialTagBadge tag={commercialTag} size="detail" /> : null}
                <ProductLabelChips labels={productLabels} size="detail" />
                {commercialTag?.hint ? <span className="text-sm text-muted-foreground">{commercialTag.hint}</span> : null}
              </div>
            ) : null}
            <h1 className="heading-2 text-2xl leading-tight sm:text-3xl">{productTitle(product)}</h1>
            {productSubtitle(product) ? <p className="muted-text mt-2">{productSubtitle(product)}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StockBadge status={product.stockStatus} qty={product.stockQuantity} internal={isAdminViewer} />
              {hasConfigurator({ isCustomizable: product.isCustomizable, optionCount: product.options.length }) ? <Badge tone="accent">Configurable</Badge> : null}
              {product.kind === "ACCESORIO" ? <Badge tone="warning">Accesorio</Badge> : <Badge tone="primary">Producto principal</Badge>}
              {pricing.discountPercent > 0 && commercialTag?.kind !== "discount" ? (
                <Badge tone="success">Descuento {formatPercent(pricing.discountPercent)}</Badge>
              ) : null}
              {/* Dato del fabricante, solo para el equipo: al cliente no se le muestra ningún cartel por esto. */}
              {isAdminViewer && product.isDiscontinued ? (
                <Badge tone="muted" title="Lo informa el fabricante o el proveedor. No dispara «Últimas unidades».">Discontinuado por el fabricante</Badge>
              ) : null}
              {isAdminViewer && tangoCode(product.internalSku) ? (
                <span className="text-xs text-muted-foreground">Código Tango: {tangoCode(product.internalSku)}</span>
              ) : null}
            </div>
          </div>

          <Card className="border-primary/10 bg-gradient-to-br from-card to-primary/5">
            <CardContent className="p-5 space-y-3">
              {product.requiresQuote || pricing.finalPriceUsd <= 0 ? (
                <>
                  <p className="text-3xl font-semibold tracking-tight">Consultá precio</p>
                  <p className="muted-text text-sm">
                    {CUSTOMER_ORDERS_ENABLED
                      ? "Agregalo a un pedido y te pasamos el precio."
                      : "Escribinos y te pasamos el precio."}
                  </p>
                </>
              ) : (
                <>
                  <ProductPrice
                    finalUsd={pricing.finalPriceUsd}
                    regularUsd={pricing.priceBeforeDiscountUsd}
                    discountPercent={pricing.discountPercent}
                    size="detail"
                  />
                  <PriceTaxNotice compact />
                </>
              )}

              {isAdmin ? (
                <div className="rounded-md border border-dashed border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-foreground">Vista administrativa</p>
                    {canEditPrices ? <EditPriceButton productId={product.id} /> : null}
                  </div>
                  <ul className="mt-2 space-y-1">
                    <li>Costo base: {formatUsd(pricing.baseCostUsd)}</li>
                    <li>Margen aplicado: {formatPercent(pricing.marginPercent)}{pricing.appliedMarginRule ? ` · ${pricing.appliedMarginRule.name}` : ""}</li>
                    <li>Precio antes de descuento: {formatUsd(pricing.priceBeforeDiscountUsd)}</li>
                    <li>Descuento aplicado: {formatPercent(pricing.discountPercent)}{pricing.appliedDiscountRule ? ` · ${pricing.appliedDiscountRule.name}` : pricing.discountSource === "PRODUCT" ? " · descuento del producto" : ""}</li>
                  </ul>
                </div>
              ) : null}

              {isAdminViewer ? (
                <div className="space-y-2">
                  {/* Solo equipo Soundtec: el stock del proveedor, separado de lo que ve el cliente. */}
                  <OriginStockPanel status={product.stockStatus} qty={product.stockQuantity} />
                  {canFeature ? <FeaturedStarButton productId={product.id} isFeatured={product.isFeatured} label /> : null}
                  {canFeature ? <FeaturedRubroButton productId={product.id} /> : null}
                </div>
              ) : null}

              <div className="pt-2 flex flex-wrap items-center gap-2">
                <FavoriteButton productId={product.id} isFavorite={!!favItem} label />
                <CompareToggle variant="button" product={{ id: product.id, name: productTitle(product), brand: product.brand?.name ?? null, image: product.images[0]?.url ?? null }} />
                {product.isCustomizable && product.options.length > 0 ? (
                  <a href="#configurador" className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-secondary">
                    Configurar producto
                  </a>
                ) : null}
              </div>

              {!CUSTOMER_ORDERS_ENABLED ? (
                <div className="border-t border-border pt-3 text-sm">
                  <p className="font-medium text-foreground">¿Necesitás más información o cotizar este producto?</p>
                  <p className="mt-1 text-muted-foreground">
                    Hablá con Soundtec:{" "}
                    <a href={salesMailHref(`Consulta por ${productTitle(product)}`)} className="font-medium text-primary hover:underline">
                      {SOUNDTEC_SALES_EMAIL}
                    </a>{" "}
                    ·{" "}
                    <a href={SOUNDTEC_PHONE_HREF} className="font-medium text-primary hover:underline">
                      {SOUNDTEC_PHONE}
                    </a>
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {activeDraft ? (
            <BundleStagingPanel draftItemCount={activeDraft.itemCount} draftRequestId={activeDraft.id} />
          ) : null}
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
            draftRequestId={activeDraft?.id ?? ""}
            accessoryContext={accessoryContext}
          />
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-accent" />
            <CardTitle>Descripción técnica</CardTitle>
          </div>
          {product.longDescription ? (
            <div className="prose prose-sm max-w-none text-foreground">
              {/* El cartel va pegado al texto que escribió la IA, no al bloque entero (características y specs son de la ficha). */}
              {aiLongDescription ? (
                <Badge tone="accent" className="not-prose">
                  <Sparkles className="h-3 w-3" /> Descripción generada con IA
                </Badge>
              ) : null}
              {product.longDescription.split("\n").map((line, i) => (
                <p key={i} className="my-2">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="muted-text">Sin descripción detallada cargada.</p>
          )}

          {aiLongDescription ? (
            <AiContentNotice
              entity="Product"
              refId={product.id}
              type="PRODUCT_DESCRIPTION"
              existingVerdict={aiFeedback?.verdict ?? null}
              existingComment={aiFeedback?.comment ?? null}
              existingIssues={aiFeedback?.issues ?? []}
              generatedText={product.longDescription || ""}
            />
          ) : null}

          <ProductKeyFeatures features={product.keyFeatures} translated={Boolean(product.translatedAt)} />
        </CardContent>
      </Card>

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

      {includedItems.length > 0 ? (
        <CompatibleAccessoriesSection
          parentProductName={product.normalizedName}
          items={includedItems}
          variant="INCLUDED"
        />
      ) : null}

      {variantItems.length > 0 ? (
        <CompatibleAccessoriesSection
          parentProductName={product.normalizedName}
          items={variantItems}
          variant="MODEL_VARIANT"
        />
      ) : null}

      {relatedItems.length > 0 ? (
        <CompatibleAccessoriesSection
          parentProductName={product.normalizedName}
          items={relatedItems}
          variant="RELATED"
        />
      ) : null}

      <MoreFromSeries
        seriesName={product.series?.name ?? null}
        items={await moreFromSeriesPromise}
        seeAllHref={`/portal/products?brand=${product.brandId}&line=${product.lineId}`}
        basePath="/portal/products"
        internal={isAdminViewer}
      />

      {compatGroups.length > 0 ? (
        <section className="space-y-2 rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Compatible con</h2>
          <ul className="space-y-1 text-sm">
            {compatGroups.map((g) => (
              <li key={g.id}>
                {g.label} ·{" "}
                <Link href={g.href} className="text-accent hover:underline">
                  Ver productos
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {compatibleItems.length > 0 ? (
        <CompatibleAccessoriesSection
          parentProductName={product.normalizedName}
          items={compatibleItems}
          variant="COMPATIBLE"
        />
      ) : null}
      </ProductBundleProvider>
      <AdminQuickEdit productId={product.id} />
    </div>
  );
}
