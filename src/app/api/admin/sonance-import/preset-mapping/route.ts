import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * Preset de mapping recomendado para my.sonance.com.
 *
 * Devuelve un objeto { dbField: apiPath } que la UI puede aplicar de un clic
 * para evitar al usuario tener que configurar 30+ campos manualmente.
 *
 * Decisión clave:
 *   - supplierSku ← productNumber (model SKU como "PPX8") → mantiene compatibilidad
 *     con el sync index que usa productNumber. Si el usuario quiere ERP IDs, lo cambia.
 *   - (rel) accessories ← accessories[].id (GUID) → funciona con cualquier supplierSku
 *     porque el apply-mapping resuelve GUIDs vía portalId.
 */
const RECOMMENDED_MAPPING: Record<string, string> = {
  // Identificación
  supplierSku: "productNumber",
  normalizedName: "productTitle",
  originalName: "productTitle",
  modelNumber: "modelNumber",
  manufacturerItem: "manufacturerItem",
  productLine: "productLine",
  urlSlug: "urlSegment",
  vendorProductUrl: "canonicalUrl",

  // Descripciones
  shortDescription: "shortDescription",
  htmlContent: "htmlContent",

  // SEO
  metaTitle: "pageTitle",
  metaDescription: "metaDescription",
  metaKeywords: "metaKeywords",

  // Precios
  baseCostUsd: "basicListPrice",
  salePriceUsd: "basicSalePrice",
  salePriceStartsAt: "basicSaleStartDate",
  salePriceEndsAt: "basicSaleEndDate",
  salePriceLabel: "salePriceLabel",

  // Categorización
  // brandId usa __sourceBrand (slug top-level del listing) porque brand.name del
  // V1 devuelve "SONANCE" para todas las sub-marcas. El slug del listing es la
  // única fuente que distingue BLAZE/TRUFIG/IPORT/JAMES/SONANCE correctamente.
  brandId: "__sourceBrand",
  categoryId: "attr:Product Category",
  familyId: "attr:Product Sub Category",

  // Status y disponibilidad
  stockStatus: "availability.message",
  availabilityMessage: "availability.message",
  availabilityType: "availability.messageType",
  requiresQuote: "quoteRequired",
  isActive: "isActive",

  // Dimensiones físicas
  widthCm: "attr:Product Width",
  heightCm: "attr:Product Height",
  depthCm: "attr:Product Depth",
  weight: "attr:Product Weight",

  // Datos JSON enriquecidos
  specifications: "attributeTypes",
  documents: "documents",
  badges: "badges",
  sourceMetadata: "$root",

  // Relaciones
  "(rel) images": "productImages[].largeImagePath",
  "(rel) accessories": "accessories[].id",
  "(rel) crossSells": "crossSells[].id",
  "(rel) alsoPurchased": "alsoPurchasedProducts[].id",
};

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({
      ok: true,
      mapping: RECOMMENDED_MAPPING,
      count: Object.keys(RECOMMENDED_MAPPING).length,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
