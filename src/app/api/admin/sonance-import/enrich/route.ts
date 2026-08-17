import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import {
  openSession,
  buildSkuToIdMap,
  fetchProductDetailRaw,
  type PortalProductDetail,
  type PortalImage,
  type PortalAttributeType,
  type PortalDocument,
  type PortalAccessory,
} from "@/services/sonance-portal";
import { translateBatchCached, type TranslationContext } from "@/services/translation-cache";
import { revalidatePath } from "next/cache";

const CACHED_PAYLOAD_KEY = "sonance.sync_preview"; // enrich consume el preview (con items + skus)

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export interface EnrichRequest {
  /** SKUs específicos a enriquecer. Si vacío, enriquece todos los productos vinculados a Sonance. */
  skus?: string[];
  /** Traducir contenido al español usando OpenAI (con cache). */
  translate?: boolean;
  /** Si true, fuerza re-enriquecer aunque ya tenga datos recientes. */
  force?: boolean;
  /** Tamaño de batch (default 25). El endpoint procesa hasta este número y vuelve. */
  batchSize?: number;
  /** Offset desde donde arrancar (para paginar batches grandes). */
  offset?: number;
}

export interface EnrichResponse {
  ok: boolean;
  error?: string;
  processed?: number;
  updated?: number;
  skipped?: number;
  withImages?: number;
  withSpecs?: number;
  withDocs?: number;
  withAccessories?: number;
  withTranslations?: number;
  totalTargets?: number;
  nextOffset?: number | null;
  done?: boolean;
}

// ── helpers ───────────────────────────────────────────────────────────────────

interface NormalizedSpec {
  label: string;
  value: string;
  labelEs?: string;
  valueEs?: string;
  group?: string;
}

function normalizeSpecs(attrs: PortalAttributeType[] | undefined): NormalizedSpec[] {
  if (!Array.isArray(attrs)) return [];
  const out: NormalizedSpec[] = [];
  for (const a of attrs) {
    const label = (a.label ?? a.name ?? "").trim();
    const values = (a.attributeValues ?? [])
      .map((v) => (v.valueDisplay ?? v.value ?? "").trim())
      .filter((v) => v.length > 0);
    if (!label || values.length === 0) continue;
    out.push({ label, value: values.join(", ") });
  }
  return out;
}

interface NormalizedDoc {
  name: string;
  url: string;
  type?: string;
  fileType?: string;
  nameEs?: string;
}

function normalizeDocs(docs: PortalDocument[] | undefined): NormalizedDoc[] {
  if (!Array.isArray(docs)) return [];
  const out: NormalizedDoc[] = [];
  for (const d of docs) {
    const url = d.fileUrl ?? d.filePath ?? "";
    const name = d.name ?? "";
    if (!url || !name) continue;
    out.push({ name, url, type: d.documentType, fileType: d.fileTypeString });
  }
  return out;
}

function uniqueImageUrls(detail: PortalProductDetail): { url: string; alt?: string; isPrimary: boolean }[] {
  const seen = new Set<string>();
  const out: { url: string; alt?: string; isPrimary: boolean }[] = [];
  const main = detail.largeImagePath ?? detail.mediumImagePath;
  if (main && !seen.has(main)) {
    seen.add(main);
    out.push({ url: main, alt: detail.altText, isPrimary: true });
  }
  for (const img of detail.productImages ?? []) {
    const url = img.largeImagePath ?? img.mediumImagePath ?? img.smallImagePath ?? "";
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push({ url, alt: img.imageAltText ?? img.name, isPrimary: false });
    }
  }
  return out;
}

function pickAccessorySkus(items: PortalAccessory[] | undefined): string[] {
  if (!Array.isArray(items)) return [];
  return items.map((a) => (a.productNumber ?? "").trim()).filter((s) => s.length > 0);
}

function finiteNumber(value: string | number | null | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validDate(value: string | null | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

// ── main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as EnrichRequest;
    const translate = !!body.translate;
    const force = !!body.force;
    const batchSize = Math.max(1, Math.min(50, body.batchSize ?? 25));
    const offset = Math.max(0, body.offset ?? 0);

    // 1. Build the list of target SKUs.
    // El enrich es autónomo: trabaja sobre el cached sync_payload
    // (los productos que vimos al sincronizar) sin necesidad de un apply previo.
    // Si el producto no existe en BD, lo creamos (inactivo) sobre la marcha.
    let targetSkus: string[];
    const skuToCachedItem = new Map<
      string,
      { name: string; price: number; brand: string; uom: string; category?: string }
    >();

    if (body.skus && body.skus.length > 0) {
      targetSkus = body.skus.filter((s) => typeof s === "string" && s.length > 0);
    } else {
      // Read cached payload
      const raw = await getSetting(CACHED_PAYLOAD_KEY, "");
      if (!raw) {
        return NextResponse.json({
          ok: false,
          error:
            "No hay sincronización guardada. Hacé click 'Sincronizar' (Paso 1) primero para que el enrich tenga sobre qué trabajar.",
        }, { status: 400 });
      }
      try {
        const cached = JSON.parse(raw) as {
          items?: Array<{
            supplierSku?: string;
            name?: string;
            newPrice?: number;
            brand?: string;
            uom?: string;
            category?: string;
            currentCategoryLabel?: string | null;
            productId?: string | null;
          }>;
        };
        const items = Array.isArray(cached.items) ? cached.items : [];
        targetSkus = [];
        for (const it of items) {
          const sku = String(it.supplierSku ?? "").trim();
          if (!sku) continue;
          targetSkus.push(sku);
          skuToCachedItem.set(sku, {
            name: String(it.name ?? sku),
            price: typeof it.newPrice === "number" ? it.newPrice : 0,
            brand: String(it.brand ?? ""),
            uom: String(it.uom ?? "EA"),
            category: String(it.category ?? ""),
          });
        }
      } catch {
        return NextResponse.json(
          { ok: false, error: "Cached payload corrupto. Re-sincronizá." },
          { status: 500 }
        );
      }
    }

    // 2. Ensure every target SKU has a DB product (create missing as inactive)
    const existingProducts = await prisma.product.findMany({
      where: { supplierSku: { in: targetSkus } },
      select: { id: true, supplierSku: true, enrichedAt: true },
    });
    const existingMap = new Map(
      existingProducts.filter((p) => !!p.supplierSku).map((p) => [p.supplierSku!, p])
    );

    // Resolve brand IDs for auto-create
    const brandNames = Array.from(
      new Set(Array.from(skuToCachedItem.values()).map((i) => i.brand).filter(Boolean))
    );
    const brands = brandNames.length > 0
      ? await prisma.brand.findMany({
          where: { name: { in: brandNames } },
          select: { id: true, name: true },
        })
      : [];
    const brandIdMap = new Map(brands.map((b) => [b.name, b.id]));

    // Filter by !enrichedAt unless force=true
    let workingSkus = targetSkus;
    if (!force) {
      workingSkus = targetSkus.filter((sku) => {
        const existing = existingMap.get(sku);
        return !existing || !existing.enrichedAt;
      });
    }

    let targets: { id: string; supplierSku: string }[] = [];
    for (const sku of workingSkus) {
      const existing = existingMap.get(sku);
      if (existing) {
        targets.push({ id: existing.id, supplierSku: sku });
        continue;
      }
      // Auto-create as inactive
      const cachedItem = skuToCachedItem.get(sku);
      if (!cachedItem) continue; // No data → skip (shouldn't happen)
      const brandId = brandIdMap.get(cachedItem.brand) ?? null;
      try {
        const created = await prisma.product.create({
          data: {
            normalizedName: cachedItem.name,
            originalName: cachedItem.name,
            supplierSku: sku,
            baseCostUsd: cachedItem.price,
            brandId,
            isActive: false,
          },
          select: { id: true, supplierSku: true },
        });
        targets.push({ id: created.id, supplierSku: sku });
      } catch (e) {
        console.error(`enrich: failed to auto-create ${sku}`, e);
      }
    }

    const totalTargets = targets.length;
    const batch = targets.slice(offset, offset + batchSize);
    if (batch.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        totalTargets,
        nextOffset: null,
        done: true,
      } satisfies EnrichResponse);
    }

    // 2. Open Sonance session once + build SKU → portalId map
    const session = await openSession();
    const skuToPortalId = await buildSkuToIdMap(session);

    // 3. Fetch details in parallel (limited concurrency)
    const CONCURRENCY = 4;
    const details: { product: { id: string; supplierSku: string }; detail: PortalProductDetail | null }[] = [];
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (p) => {
          const portalId = skuToPortalId.get(p.supplierSku);
          if (!portalId) return { product: p, detail: null };
          const detail = await fetchProductDetailRaw(session, portalId);
          return { product: p, detail };
        })
      );
      details.push(...chunkResults);
    }

    // 4. Collect text for batch translation (cache-backed)
    let translationMaps: {
      productNames: Map<string, string>;
      shortDescs: Map<string, string>;
      htmlContents: Map<string, string>;
      specLabels: Map<string, string>;
      specValues: Map<string, string>;
      docNames: Map<string, string>;
    } | null = null;

    if (translate) {
      const allNames: string[] = [];
      const allShorts: string[] = [];
      const allHtmls: string[] = [];
      const allSpecLabels = new Set<string>();
      const allSpecValues = new Set<string>();
      const allDocNames = new Set<string>();
      for (const { detail } of details) {
        if (!detail) continue;
        if (detail.productTitle) allNames.push(detail.productTitle);
        if (detail.shortDescription) allShorts.push(detail.shortDescription);
        if (detail.htmlContent) allHtmls.push(detail.htmlContent);
        for (const s of normalizeSpecs(detail.attributeTypes)) {
          allSpecLabels.add(s.label);
          allSpecValues.add(s.value);
        }
        for (const d of normalizeDocs(detail.documents)) {
          allDocNames.add(d.name);
        }
      }
      const [productNames, shortDescs, htmlContents, specLabels, specValues, docNames] = await Promise.all([
        translateBatchCached(allNames, "product_name"),
        translateBatchCached(allShorts, "short_desc"),
        translateBatchCached(allHtmls, "long_desc"),
        translateBatchCached(Array.from(allSpecLabels), "spec_label"),
        translateBatchCached(Array.from(allSpecValues), "spec_value"),
        translateBatchCached(Array.from(allDocNames), "doc_name"),
      ]);
      translationMaps = { productNames, shortDescs, htmlContents, specLabels, specValues, docNames };
    }

    // 5. Build a SKU lookup for accessory linking (across whole DB to support cross-brand)
    const accessorySkus = new Set<string>();
    for (const { detail } of details) {
      if (!detail) continue;
      for (const s of pickAccessorySkus(detail.accessories)) accessorySkus.add(s);
      for (const s of pickAccessorySkus(detail.crossSells)) accessorySkus.add(s);
      for (const s of pickAccessorySkus(detail.alsoPurchasedProducts)) accessorySkus.add(s);
    }
    const accessoryProducts = accessorySkus.size > 0
      ? await prisma.product.findMany({
          where: { supplierSku: { in: Array.from(accessorySkus) } },
          select: { id: true, supplierSku: true },
        })
      : [];
    const accessorySkuToId = new Map(
      accessoryProducts.map((p) => [p.supplierSku!, p.id])
    );

    // 6. Apply updates per product
    let updated = 0;
    let skipped = 0;
    let withImages = 0;
    let withSpecs = 0;
    let withDocs = 0;
    let withAccessories = 0;
    let withTranslations = 0;

    for (const { product, detail } of details) {
      if (!detail) {
        skipped++;
        continue;
      }

      // Normalize raw → DB shape
      const specs = normalizeSpecs(detail.attributeTypes);
      const docs = normalizeDocs(detail.documents);
      const images = uniqueImageUrls(detail);
      const accSkus = pickAccessorySkus(detail.accessories);
      const crossSellSkus = pickAccessorySkus(detail.crossSells);
      const alsoPurchasedSkus = pickAccessorySkus(detail.alsoPurchasedProducts);

      // Apply translations if available
      if (translationMaps) {
        for (const s of specs) {
          s.labelEs = translationMaps.specLabels.get(s.label);
          s.valueEs = translationMaps.specValues.get(s.value);
        }
        for (const d of docs) {
          d.nameEs = translationMaps.docNames.get(d.name);
        }
      }

      // Build update data
      const productUpdate: Record<string, unknown> = {
        sourceMetadata: detail as unknown as object,
        enrichedAt: new Date(),
      };

      const basicListPrice = finiteNumber(detail.basicListPrice);
      const basicSalePrice = finiteNumber(detail.basicSalePrice);
      const shippingWeight = finiteNumber(detail.shippingWeight);
      const shippingHeight = finiteNumber(detail.shippingHeight);
      const shippingWidth = finiteNumber(detail.shippingWidth);
      const shippingLength = finiteNumber(detail.shippingLength);
      const videoUrl = typeof detail.properties?.videoUrl === "string"
        ? detail.properties.videoUrl.trim()
        : "";

      if (basicListPrice !== undefined && basicListPrice > 0) productUpdate.baseCostUsd = basicListPrice;
      if (detail.modelNumber?.trim()) productUpdate.modelNumber = detail.modelNumber;
      if (detail.manufacturerItem?.trim()) productUpdate.manufacturerItem = detail.manufacturerItem;
      if (detail.pageTitle?.trim()) productUpdate.metaTitle = detail.pageTitle;
      if (detail.metaDescription?.trim()) productUpdate.metaDescription = detail.metaDescription;
      if (detail.metaKeywords?.trim()) productUpdate.metaKeywords = detail.metaKeywords;
      if (basicSalePrice !== undefined && basicSalePrice > 0) productUpdate.salePriceUsd = basicSalePrice;
      productUpdate.salePriceStartsAt = validDate(detail.basicSaleStartDate);
      productUpdate.salePriceEndsAt = validDate(detail.basicSaleEndDate);
      if (detail.salePriceLabel?.trim()) productUpdate.salePriceLabel = detail.salePriceLabel;
      if (typeof detail.quoteRequired === "boolean") productUpdate.requiresQuote = detail.quoteRequired;
      if (
        typeof detail.availability?.message === "string" &&
        detail.availability.message.trim()
      ) productUpdate.availabilityMessage = detail.availability.message;
      if (
        typeof detail.availability?.messageType === "string" &&
        detail.availability.messageType.trim()
      ) productUpdate.availabilityType = detail.availability.messageType;
      if (detail.badges && detail.badges.length > 0) productUpdate.badges = detail.badges as unknown as object;
      if (shippingWeight !== undefined && shippingWeight > 0) productUpdate.weight = shippingWeight;
      if (shippingHeight !== undefined) productUpdate.heightCm = shippingHeight;
      if (shippingWidth !== undefined) productUpdate.widthCm = shippingWidth;
      if (shippingLength !== undefined) productUpdate.depthCm = shippingLength;
      if (detail.urlSegment?.trim()) productUpdate.urlSlug = detail.urlSegment;
      const vendorProductUrl = detail.productDetailUrl?.trim() || detail.canonicalUrl?.trim();
      if (vendorProductUrl) productUpdate.vendorProductUrl = vendorProductUrl;
      if (videoUrl) productUpdate.videoUrl = videoUrl;

      if (detail.productTitle && translationMaps) {
        const es = translationMaps.productNames.get(detail.productTitle);
        if (es && es !== detail.productTitle) productUpdate.normalizedName = es;
      }
      if (detail.productTitle) {
        productUpdate.originalName = detail.productTitle;
      }
      if (detail.shortDescription) {
        const es = translationMaps?.shortDescs.get(detail.shortDescription);
        productUpdate.shortDescription = es ?? detail.shortDescription;
      }
      if (detail.htmlContent) {
        const es = translationMaps?.htmlContents.get(detail.htmlContent);
        productUpdate.htmlContent = es ?? detail.htmlContent;
        productUpdate.longDescription = (es ?? detail.htmlContent).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
      if (specs.length > 0) productUpdate.specifications = specs as unknown as object;
      if (docs.length > 0) productUpdate.documents = docs as unknown as object;
      if (translationMaps) productUpdate.translatedAt = new Date();

      // Update + replace images and accessory relations atomically
      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: product.id },
          data: productUpdate,
        });

        if (images.length > 0) {
          // Replace supplier images for this product (keep other sources)
          await tx.productImage.deleteMany({
            where: { productId: product.id, source: "supplier" },
          });
          await tx.productImage.createMany({
            data: images.map((img) => ({
              productId: product.id,
              url: img.url,
              alt: img.alt ?? null,
              source: "supplier",
              isPrimary: img.isPrimary,
            })),
          });
        }

        // Accessory relations: only link if accessory product exists in DB.
        // Scoped to kind=ACCESSORY para no pisar CROSS_SELL/ALSO_PURCHASED.
        if (accSkus.length > 0) {
          await tx.accessoryRelation.deleteMany({
            where: { productId: product.id, kind: "ACCESSORY" },
          });
          const toCreate = accSkus
            .map((sku) => accessorySkuToId.get(sku))
            .filter((id): id is string => !!id && id !== product.id)
            .map((accessoryProductId) => ({
              productId: product.id,
              accessoryProductId,
              isRequired: false,
              kind: "ACCESSORY" as const,
            }));
          if (toCreate.length > 0) {
            await tx.accessoryRelation.createMany({
              data: toCreate,
              skipDuplicates: true,
            });
          }
        }

        for (const [kind, skus] of [
          ["CROSS_SELL", crossSellSkus],
          ["ALSO_PURCHASED", alsoPurchasedSkus],
        ] as const) {
          if (skus.length === 0) continue;
          await tx.accessoryRelation.deleteMany({
            where: { productId: product.id, kind },
          });
          const toCreate = skus
            .map((sku) => accessorySkuToId.get(sku))
            .filter((id): id is string => !!id && id !== product.id)
            .map((accessoryProductId) => ({
              productId: product.id,
              accessoryProductId,
              isRequired: false,
              kind,
            }));
          if (toCreate.length > 0) {
            await tx.accessoryRelation.createMany({ data: toCreate, skipDuplicates: true });
          }
        }
      });

      updated++;
      if (images.length > 0) withImages++;
      if (specs.length > 0) withSpecs++;
      if (docs.length > 0) withDocs++;
      if (accSkus.length > 0) withAccessories++;
      if (translationMaps) withTranslations++;
    }

    revalidatePath("/admin/products");
    revalidatePath("/portal/products");

    const nextOffset = offset + batchSize;
    const done = nextOffset >= totalTargets;

    return NextResponse.json({
      ok: true,
      processed: batch.length,
      updated,
      skipped,
      withImages,
      withSpecs,
      withDocs,
      withAccessories,
      withTranslations,
      totalTargets,
      nextOffset: done ? null : nextOffset,
      done,
    } satisfies EnrichResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error } satisfies EnrichResponse, { status: 500 });
  }
}
