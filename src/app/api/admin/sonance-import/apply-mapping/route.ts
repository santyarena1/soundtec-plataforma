import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { slugify } from "@/lib/utils";
import { applyMapping, resolvePath } from "@/services/portal-path-resolver";
import { openSession, resolveSonanceMyPrice, type PortalProductDetail } from "@/services/sonance-portal";
import { revalidatePath } from "next/cache";

/**
 * Llama al API en vivo de mySonance para obtener TODOS los productNumbers
 * que están listados en cada categoría top-level pn-* y los asigna a la marca
 * correcta. Esto corre como post-procesamiento del apply-mapping cuando
 * done=true, para que el resultado final sea consistente aun si el índice
 * persistido es viejo o si el __sourceBrand del usuario apunta a la marca
 * paraguas en vez de la específica.
 */
async function reassignBrandsFromSonanceApi(): Promise<{
  perBrand: Record<string, { found: number; updated: number }>;
}> {
  const session = await openSession();
  const baseHeaders = {
    Accept: "application/json",
    Cookie: Object.entries(session.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; "),
    "User-Agent": "Mozilla/5.0 Soundtec-Sync/1.0",
  };

  const catsRes = await fetch("https://my.sonance.com/api/v1/categories/?maxDepth=1", {
    headers: baseHeaders,
  });
  if (!catsRes.ok) return { perBrand: {} };
  const catsData = (await catsRes.json()) as {
    categories?: Array<{ id: string; name?: string; shortDescription?: string; urlSegment?: string }>;
  };
  const cats = (catsData.categories ?? []).filter((c) =>
    (c.urlSegment ?? "").toLowerCase().startsWith("pn-")
  );
  // Paraguas (pn-sonance) primero para que sub-marcas ganen via last-write
  cats.sort((a, b) => {
    const aIs = (a.urlSegment ?? "").toLowerCase() === "pn-sonance" ? 0 : 1;
    const bIs = (b.urlSegment ?? "").toLowerCase() === "pn-sonance" ? 0 : 1;
    return aIs - bIs;
  });

  const perBrand: Record<string, { found: number; updated: number }> = {};
  for (const cat of cats) {
    const brandName = String(
      cat.shortDescription ?? cat.name ?? (cat.urlSegment ?? "").replace(/^pn-/i, "").toUpperCase()
    ).trim();
    if (!brandName) continue;

    // Ensure brand exists con nombre lindo
    let brand = await prisma.brand.findFirst({
      where: { name: { equals: brandName, mode: "insensitive" } },
      select: { id: true },
    });
    if (!brand) {
      brand = await prisma.brand.create({
        data: { name: brandName, slug: slugify(brandName) },
        select: { id: true },
      });
    }
    const brandId = brand.id;

    const allSkus: string[] = [];
    let page = 1;
    const PAGE_SIZE = 200;
    while (true) {
      const r = await fetch(
        `https://my.sonance.com/api/v2/products?categoryId=${cat.id}&pageSize=${PAGE_SIZE}&page=${page}`,
        { headers: baseHeaders }
      );
      if (!r.ok) break;
      const data = (await r.json()) as {
        products?: Array<{ productNumber?: string }>;
        pagination?: { totalItemCount?: number };
      };
      const numbers = (data.products ?? [])
        .map((p) => p.productNumber)
        .filter((s): s is string => typeof s === "string" && s.length > 0);
      allSkus.push(...numbers);
      const total = data.pagination?.totalItemCount ?? numbers.length;
      if (page * PAGE_SIZE >= total || numbers.length === 0) break;
      page++;
    }
    perBrand[brandName] = { found: allSkus.length, updated: 0 };

    const BATCH = 500;
    for (let s = 0; s < allSkus.length; s += BATCH) {
      const slice = allSkus.slice(s, s + BATCH);
      const r = await prisma.product.updateMany({
        where: { supplierSku: { in: slice }, NOT: { brandId } },
        data: { brandId },
      });
      perBrand[brandName].updated += r.count;
    }
  }
  return { perBrand };
}

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const PAYLOAD_KEY = "sonance.sync_index";
const DETAIL_BUCKET_PREFIX = "sonance.sync_details_";
const MAPPING_KEY = "sonance.field_mapping";
const CHUNK_SIZE = 50;

interface PayloadIndex {
  totalProducts: number;
  totalChunks: number;
  skuToPortalId: Array<{ sku: string; portalId: string; brand: string }>;
}

interface ApplyMappingRequest {
  offset?: number;
  batchSize?: number;
  /** Si true, marca isActive=true al crear/update. Default true. */
  setActive?: boolean;
  /** Si true, crea productos faltantes en BD. Default true. */
  createMissing?: boolean;
  /**
   * Si true (default), siempre escribe isActive=true ignorando lo que diga el
   * mapping o el V1 detail. Pensado para que el admin no quede con catálogos
   * inactivos sin querer luego del import.
   */
  forceActive?: boolean;
}

interface ApplyMappingResponse {
  ok: boolean;
  error?: string;
  processed: number;
  updated: number;
  created: number;
  skippedNoDetail: number; // sin V1 detail descargado — se debe re-sync
  withSpecifications: number; // productos a los que se les escribió specifications
  withDocuments: number; // productos a los que se les escribió documents
  withImageRels: number; // productos a los que se les escribió imágenes
  withAccessoryRels: number; // productos a los que se les linkeó al menos 1 accesorio
  withCrossSellRels: number; // productos con al menos 1 cross-sell linkeado
  withAlsoPurchasedRels: number; // productos con al menos 1 also-purchased linkeado
  /** Reasignación final de marcas vs API en vivo. Solo en done=true. */
  brandReassignment?: Record<string, { found: number; updated: number }> | null;
  totalProducts: number;
  nextOffset: number | null;
  done: boolean;
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function loadPayloadIndex(): Promise<PayloadIndex | null> {
  const raw = await getSetting(PAYLOAD_KEY, "");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PayloadIndex;
  } catch {
    return null;
  }
}

async function loadDetailChunk(idx: number): Promise<Record<string, PortalProductDetail>> {
  const raw = await getSetting(DETAIL_BUCKET_PREFIX + idx, "");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, PortalProductDetail>;
  } catch {
    return {};
  }
}

async function upsertCategoryByName(name: string): Promise<string> {
  const normalized = name.trim();
  const existing = await prisma.category.findFirst({
    where: { name: { equals: normalized, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.category.create({
    data: { name: normalized, slug: slugify(normalized) },
    select: { id: true },
  });
  return created.id;
}

async function upsertFamilyByName(name: string): Promise<string> {
  const normalized = name.trim();
  const existing = await prisma.productFamily.findFirst({
    where: { name: { equals: normalized, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.productFamily.create({
    data: { name: normalized, slug: slugify(normalized) },
    select: { id: true },
  });
  return created.id;
}

async function upsertBrandByName(name: string): Promise<string> {
  const normalized = name.trim();
  const existing = await prisma.brand.findFirst({
    where: { name: { equals: normalized, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.brand.create({
    data: { name: normalized, slug: slugify(normalized) },
    select: { id: true },
  });
  return created.id;
}

/**
 * Heurística de fallback para sub-marcas Sonance.
 *
 * Sonance tiene varias sub-marcas (BLAZE BY SONANCE, TRUFIG, APPAREL) que
 * comparten el catálogo "pn-sonance" como paraguas. A veces el listing top-level
 * NO las incluye en su slug específico (pn-blaze, pn-trufig, pn-apparel), o el
 * V1 detail devuelve brand.name="SONANCE" para todas.
 *
 * Esta función mira el nombre + SKU + modelNumber + manufacturerItem buscando
 * keywords que delaten la sub-marca real. Si encuentra match, devuelve el
 * nombre canónico de la sub-marca.
 */
// Substring match — cualquier mención de estas palabras en nombre/SKU/etc
// fuerza la sub-marca correspondiente. Orden importa: más específico primero.
const BRAND_KEYWORDS: Array<{ test: RegExp; brand: string }> = [
  { test: /blaze/i, brand: "BLAZE BY SONANCE" },
  { test: /trufig/i, brand: "TRUFIG" },
  { test: /apparel/i, brand: "APPAREL" },
  { test: /iport/i, brand: "IPORT" },
  { test: /james/i, brand: "JAMES" },
];

function inferBrandFromKeywords(textFields: Array<string | null | undefined>): string | null {
  const haystack = textFields.filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return null;
  for (const { test, brand } of BRAND_KEYWORDS) {
    if (test.test(haystack)) return brand;
  }
  return null;
}

/**
 * Convierte un valor "crudo" del mapping a algo que Prisma acepta para un campo.
 * - Strings/booleans/numbers: pasan
 * - Arrays/objects: solo aceptados para campos JSON (specifications, documents, sourceMetadata)
 */
// Helper: extrae un número de un string que puede tener unidades.
// Ej. "11.81\" (299.97 mm)" → si pedís 'mm' busca 299.97; si no, 11.81
function extractNumber(s: string, preferUnit?: "mm" | "cm" | "kg" | "g" | "in" | "lb"): number | null {
  if (preferUnit) {
    const re = new RegExp(`\\(?\\s*([\\d.]+)\\s*${preferUnit}\\)?`, "i");
    const m = s.match(re);
    if (m) return Number(m[1]);
  }
  // Fallback: first number in string
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Mapea texto libre de stock a enum StockStatus
function coerceStockStatus(raw: unknown): { ok: true; value: string } | { ok: false; reason: string } {
  const upper = String(raw).trim().toUpperCase();
  const validEnums = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "ON_REQUEST", "UNKNOWN"];
  if (validEnums.includes(upper)) return { ok: true, value: upper };
  const s = String(raw).toLowerCase();
  // "Out of Stock - Available TBD" / "Available TBD" → ON_REQUEST (próximamente disponible)
  if (/tbd|back\s*order|on\s*order|on\s*request|coming\s*soon|a\s*pedido/i.test(s)) {
    return { ok: true, value: "ON_REQUEST" };
  }
  if (/out\s*of\s*stock|sold\s*out|no\s*disponible|unavailable/i.test(s)) {
    return { ok: true, value: "OUT_OF_STOCK" };
  }
  if (/low\s*stock|few\s*left|poco\s*stock/i.test(s)) {
    return { ok: true, value: "LOW_STOCK" };
  }
  if (/in\s*stock|available|now\s*shipping|en\s*stock|disponible/i.test(s)) {
    return { ok: true, value: "IN_STOCK" };
  }
  return { ok: false, reason: `no stock status match for "${s.slice(0, 40)}"` };
}

// Mapea texto libre a enum ProductKind
function coerceKind(raw: unknown): { ok: true; value: string } | { ok: false; reason: string } {
  const upper = String(raw).trim().toUpperCase();
  if (upper === "PRINCIPAL" || upper === "ACCESORIO") return { ok: true, value: upper };
  const s = String(raw).toLowerCase();
  if (/principal|primary|main/i.test(s)) return { ok: true, value: "PRINCIPAL" };
  if (/accessory|accesorio/i.test(s)) return { ok: true, value: "ACCESORIO" };
  return { ok: false, reason: "no kind match" };
}

function coerceForField(
  field: string,
  raw: unknown
): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (raw == null) return { ok: false, reason: "null/undefined" };

  const jsonFields = new Set([
    "specifications", "documents", "sourceMetadata", "badges",
  ]);
  if (jsonFields.has(field)) {
    return { ok: true, value: raw };
  }

  // Enums con coerción de texto libre
  if (field === "stockStatus") return coerceStockStatus(raw);
  if (field === "kind") return coerceKind(raw);

  // Dimensiones en cm: si el texto tiene mm en paréntesis, convertir mm → cm
  // (Sonance da "11.81\" (299.97 mm)" → 29.997 cm)
  const dimensionCmFields = new Set(["widthCm", "heightCm", "depthCm"]);
  if (dimensionCmFields.has(field)) {
    const s = typeof raw === "string" ? raw : String(raw);
    const mm = extractNumber(s, "mm");
    if (mm != null) return { ok: true, value: mm / 10 };
    const cm = extractNumber(s, "cm");
    if (cm != null) return { ok: true, value: cm };
    // Asumir pulgadas y convertir a cm (1 in = 2.54 cm)
    const inches = extractNumber(s, "in") ?? extractNumber(s);
    if (inches != null) return { ok: true, value: inches * 2.54 };
    return { ok: false, reason: "no dimension found" };
  }

  // Peso en kg: si el texto tiene kg en paréntesis, usar eso
  if (field === "weight") {
    const s = typeof raw === "string" ? raw : String(raw);
    const kg = extractNumber(s, "kg");
    if (kg != null) return { ok: true, value: kg };
    const g = extractNumber(s, "g");
    if (g != null) return { ok: true, value: g / 1000 };
    // Asumir lbs y convertir (1 lb = 0.453592 kg)
    const lb = extractNumber(s, "lb") ?? extractNumber(s);
    if (lb != null) return { ok: true, value: lb * 0.453592 };
    return { ok: false, reason: "no weight found" };
  }

  const decimalFields = new Set([
    "baseCostUsd", "tariffDutyPercent", "aecPercent", "tePercent",
    "volume", "discountPercent", "coefNac", "coefVta",
    "ivaPercent", "impIntPercent", "coefVtaFob", "salePriceUsd",
  ]);
  if (decimalFields.has(field)) {
    const n = typeof raw === "number"
      ? raw
      : extractNumber(typeof raw === "string" ? raw : String(raw));
    if (n == null || !isFinite(n)) return { ok: false, reason: "not a number" };
    return { ok: true, value: n };
  }

  const intFields = new Set(["stockQuantity"]);
  if (intFields.has(field)) {
    const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    if (!isFinite(n)) return { ok: false, reason: "not an int" };
    return { ok: true, value: n };
  }

  const boolFields = new Set([
    "isCustomizable", "isCrestronHomeCompatible", "isActive",
    "accessoryRequiredWithPrimary", "aiGeneratedDescription",
    "requiresQuote",
  ]);
  if (boolFields.has(field)) {
    if (typeof raw === "boolean") return { ok: true, value: raw };
    const s = String(raw).toLowerCase();
    if (["true", "1", "yes", "si", "sí"].includes(s)) return { ok: true, value: true };
    if (["false", "0", "no"].includes(s)) return { ok: true, value: false };
    return { ok: false, reason: "not a bool" };
  }

  const dateFields = new Set([
    "salePriceStartsAt", "salePriceEndsAt", "enrichedAt", "translatedAt",
  ]);
  if (dateFields.has(field)) {
    if (raw instanceof Date) return { ok: true, value: raw };
    const s = String(raw);
    if (!s) return { ok: false, reason: "empty date" };
    const d = new Date(s);
    if (isNaN(d.getTime())) return { ok: false, reason: "invalid date" };
    return { ok: true, value: d };
  }

  // Strings — convert array to join, object to JSON string
  if (Array.isArray(raw)) {
    return { ok: true, value: raw.filter((v) => v != null).map(String).join(" · ") };
  }
  if (typeof raw === "object") {
    return { ok: true, value: JSON.stringify(raw) };
  }
  return { ok: true, value: String(raw) };
}

// ── main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as ApplyMappingRequest;
    const batchSize = Math.max(1, Math.min(50, body.batchSize ?? 25));
    const offset = Math.max(0, body.offset ?? 0);
    const setActive = body.setActive !== false;
    const createMissing = body.createMissing !== false;
    const forceActive = body.forceActive !== false;

    // 1. Load mapping
    const mappingRaw = await getSetting(MAPPING_KEY, "{}");
    let mapping: Record<string, string> = {};
    try {
      mapping = JSON.parse(mappingRaw);
    } catch { /* ignore */ }
    // Migrar mappings viejos que tomaban wholesale como costo FOB.
    if (mapping.baseCostUsd === "basicListPrice") {
      mapping = { ...mapping, baseCostUsd: "pricing.unitNetPrice" };
    }
    if (Object.keys(mapping).length === 0) {
      return NextResponse.json({
        ok: false,
        error: "No hay mapping definido. Configurá el mapeo en la UI primero.",
      } as ApplyMappingResponse, { status: 400 });
    }

    // 2. Load payload index
    const idx = await loadPayloadIndex();
    if (!idx) {
      return NextResponse.json({
        ok: false,
        error:
          "No hay sincronización guardada. Hacé 'Sincronizar' primero y esperá a que termine la fase 2 (detalle completo).",
      } as ApplyMappingResponse, { status: 400 });
    }
    if (!Array.isArray(idx.skuToPortalId) || idx.skuToPortalId.length === 0) {
      return NextResponse.json({
        ok: false,
        error:
          "El índice de sincronización está vacío o corrupto. Re-sincronizá desde cero (botón 'Re-sincronizar' en Paso 1).",
      } as ApplyMappingResponse, { status: 400 });
    }

    const batch = idx.skuToPortalId.slice(offset, offset + batchSize);
    if (batch.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        updated: 0,
        created: 0,
        skippedNoDetail: 0,
        withSpecifications: 0,
        withDocuments: 0,
        withImageRels: 0,
        withAccessoryRels: 0,
        withCrossSellRels: 0,
        withAlsoPurchasedRels: 0,
        totalProducts: idx.totalProducts,
        nextOffset: null,
        done: true,
      } satisfies ApplyMappingResponse);
    }

    // 3. Load detail chunks needed for this batch
    const chunkIndices = new Set<number>();
    for (let i = 0; i < batch.length; i++) {
      const productPos = offset + i;
      chunkIndices.add(Math.floor(productPos / CHUNK_SIZE));
    }
    const chunks = new Map<number, Record<string, PortalProductDetail>>();
    for (const ci of chunkIndices) {
      chunks.set(ci, await loadDetailChunk(ci));
    }

    // 4. Pre-resolve any unique brand/category/family names so we don't hit DB per product
    const brandNamesNeeded = new Set<string>();
    const categoryNamesNeeded = new Set<string>();
    const familyNamesNeeded = new Set<string>();
    for (let i = 0; i < batch.length; i++) {
      const productPos = offset + i;
      const chunkIdx = Math.floor(productPos / CHUNK_SIZE);
      const detail = chunks.get(chunkIdx)?.[batch[i].sku];
      if (!detail) continue;
      const mapped = applyMapping(detail, mapping);
      if (mapping.brandId) {
        const v = mapped.brandId;
        const name = Array.isArray(v) ? v[0] : v;
        if (typeof name === "string" && name.trim()) brandNamesNeeded.add(name.trim());
      }
      if (mapping.categoryId) {
        const v = mapped.categoryId;
        const name = Array.isArray(v) ? v[0] : v;
        if (typeof name === "string" && name.trim()) categoryNamesNeeded.add(name.trim());
      }
      if (mapping.familyId) {
        const v = mapped.familyId;
        const name = Array.isArray(v) ? v[0] : v;
        if (typeof name === "string" && name.trim()) familyNamesNeeded.add(name.trim());
      }
    }
    // Aseguramos que las sub-marcas conocidas estén siempre en el set para
    // que el fallback de keywords tenga su id listo cuando lo necesite.
    for (const { brand } of BRAND_KEYWORDS) brandNamesNeeded.add(brand);
    const brandIdByName = new Map<string, string>();
    for (const n of brandNamesNeeded) brandIdByName.set(n, await upsertBrandByName(n));
    const categoryIdByName = new Map<string, string>();
    for (const n of categoryNamesNeeded) categoryIdByName.set(n, await upsertCategoryByName(n));
    const familyIdByName = new Map<string, string>();
    for (const n of familyNamesNeeded) familyIdByName.set(n, await upsertFamilyByName(n));

    // 5. Process each item
    let updated = 0;
    let created = 0;
    let skippedNoDetail = 0;
    let withSpecifications = 0;
    let withDocuments = 0;
    let withImageRels = 0;
    let withAccessoryRels = 0;
    let withCrossSellRels = 0;
    let withAlsoPurchasedRels = 0;

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const productPos = offset + i;
      const chunkIdx = Math.floor(productPos / CHUNK_SIZE);
      const detail = chunks.get(chunkIdx)?.[item.sku];
      if (!detail) {
        skippedNoDetail++;
        continue;
      }

      // Inyectamos campos derivados del índice (no vienen del V1 detail). El
      // motivo: V1 devuelve brand.name="SONANCE" para todas las sub-marcas
      // (BLAZE, TRUFIG, IPORT, JAMES), pero el slug del listing top-level sí
      // distingue. Exponemos esos valores bajo un prefijo "__source_" para
      // que el usuario los pueda mapear desde la UI.
      const detailRecord = detail as unknown as Record<string, unknown>;
      detailRecord.__sourceBrand = item.brand;
      detailRecord.__sourcePortalId = item.portalId;
      detailRecord.__sourceSku = item.sku;

      const mapped = applyMapping(detail, mapping);
      const productData: Record<string, unknown> = {};

      for (const [field, rawValue] of Object.entries(mapped)) {
        // Special FK fields
        if (field === "brandId") {
          const v = Array.isArray(rawValue) ? rawValue[0] : rawValue;
          if (typeof v === "string" && v.trim()) {
            const id = brandIdByName.get(v.trim());
            if (id) productData.brandId = id;
          }
          continue;
        }
        if (field === "categoryId") {
          const v = Array.isArray(rawValue) ? rawValue[0] : rawValue;
          if (typeof v === "string" && v.trim()) {
            const id = categoryIdByName.get(v.trim());
            if (id) productData.categoryId = id;
          }
          continue;
        }
        if (field === "familyId") {
          const v = Array.isArray(rawValue) ? rawValue[0] : rawValue;
          if (typeof v === "string" && v.trim()) {
            const id = familyIdByName.get(v.trim());
            if (id) productData.familyId = id;
          }
          continue;
        }
        // Relations handled separately below — skip from productData
        if (
          field === "(rel) images" ||
          field === "(rel) accessories" ||
          field === "(rel) crossSells" ||
          field === "(rel) alsoPurchased"
        ) continue;

        const coerced = coerceForField(field, rawValue);
        if (!coerced.ok) continue;
        productData[field] = coerced.value;
      }

      // Sobrescribimos isActive antes de tocar la BD si forceActive está activo.
      // Esto cubre el caso típico: el V1 devuelve isActive=false para muchos
      // productos del portal y el admin igual los quiere visibles en su catálogo.
      if (forceActive) productData.isActive = true;

      // Override de marca por keyword: si el nombre/SKU/modelo contiene alguna
      // de las palabras clave (blaze, trufig, apparel, iport, james), forzamos
      // la sub-marca correspondiente — gana sobre lo que haya mapeado el usuario.
      // Esto fixea el caso del catálogo paraguas (pn-sonance) que mete TODO
      // dentro de "SONANCE" cuando en realidad son sub-marcas.
      const fieldsForBrandHeuristic: Array<string | null | undefined> = [
        typeof mapped.normalizedName === "string" ? mapped.normalizedName : null,
        typeof mapped.originalName === "string" ? mapped.originalName : null,
        typeof mapped.modelNumber === "string" ? mapped.modelNumber : null,
        typeof mapped.manufacturerItem === "string" ? mapped.manufacturerItem : null,
        typeof mapped.supplierSku === "string" ? mapped.supplierSku : item.sku,
        typeof mapped.productLine === "string" ? mapped.productLine : null,
        item.sku,
      ];
      const inferred = inferBrandFromKeywords(fieldsForBrandHeuristic);
      if (inferred) {
        const inferredId = brandIdByName.get(inferred);
        if (inferredId) productData.brandId = inferredId;
      }

      // Find existing product
      const existing = await prisma.product.findFirst({
        where: { supplierSku: item.sku },
        select: { id: true },
      });

      let productId: string;
      if (existing) {
        // Update — keep required fields untouched if not in mapping
        await prisma.product.update({
          where: { id: existing.id },
          data: productData,
        });
        productId = existing.id;
        updated++;
        if (productData.specifications !== undefined) withSpecifications++;
        if (productData.documents !== undefined) withDocuments++;
      } else {
        if (!createMissing) continue;
        // Create — Product requires normalizedName + originalName + baseCostUsd
        const detailRecord = detail as unknown as Record<string, unknown>;
        const fallbackName = typeof detailRecord.productTitle === "string"
          ? detailRecord.productTitle
          : item.sku;
        const pricing =
          detailRecord.pricing && typeof detailRecord.pricing === "object"
            ? (detailRecord.pricing as { unitNetPrice?: number })
            : undefined;
        const fallbackPrice =
          resolveSonanceMyPrice({
            pricing,
            unitListPrice:
              typeof detailRecord.unitListPrice === "number" ? detailRecord.unitListPrice : null,
            basicListPrice:
              typeof detailRecord.basicListPrice === "number" ? detailRecord.basicListPrice : null,
          }) ?? 0;
        const createData = {
          supplierSku: item.sku,
          normalizedName: (productData.normalizedName as string) ?? fallbackName,
          originalName: (productData.originalName as string) ?? fallbackName,
          baseCostUsd: (productData.baseCostUsd as number) ?? fallbackPrice,
          isActive: setActive,
          ...productData,
        };
        const newP = await prisma.product.create({
          data: createData as Parameters<typeof prisma.product.create>[0]["data"],
          select: { id: true },
        });
        productId = newP.id;
        created++;
        if (productData.specifications !== undefined) withSpecifications++;
        if (productData.documents !== undefined) withDocuments++;
      }

      // Relations: images (este SÍ se hace en cada producto — las imágenes
      // son URLs externas, no dependen de otros productos existiendo)
      if (mapping["(rel) images"]) {
        const urlsRaw = resolvePath(detail, mapping["(rel) images"]);
        const urls = Array.isArray(urlsRaw)
          ? urlsRaw.filter((u): u is string => typeof u === "string" && u.length > 0)
          : typeof urlsRaw === "string" && urlsRaw.length > 0
          ? [urlsRaw]
          : [];
        if (urls.length > 0) {
          try {
            await prisma.productImage.deleteMany({
              where: { productId, source: "supplier" },
            });
            await prisma.productImage.createMany({
              data: urls.map((url, ix) => ({
                productId,
                url,
                source: "supplier",
                isPrimary: ix === 0,
              })),
            });
            withImageRels++;
          } catch (e) {
            console.error("apply-mapping: failed images for", item.sku, e);
          }
        }
      }

      // Relations: accessories — DEFERRED al final pass
      // Problema: si producto A tiene como accesorio el SKU B, y B se procesa
      // en un batch posterior, no existe todavía en BD y la relación fallaba.
      // Solución: linkeamos accesorios en el último batch (done=true) iterando
      // todos los productos con detail ya bajado.
    }

    const nextOffset = offset + batch.length;
    const done = nextOffset >= idx.totalProducts;

    // 6. FINAL PASS — link de relaciones producto-producto.
    // Solo se hace en el último batch (done=true) cuando todos los Product
    // ya existen en BD y los SKUs/GUIDs referenciados pueden ser encontrados.
    //
    // Soporta 3 tipos de relación:
    //   - (rel) accessories   → ACCESSORY      (compatible/required, marca isCustomizable)
    //   - (rel) crossSells    → CROSS_SELL     (alternativa o complemento)
    //   - (rel) alsoPurchased → ALSO_PURCHASED (upsell)
    //
    // Cada tipo se procesa por separado contra el mismo map dbBySku + portalIdToSku
    // para soportar cualquier estrategia de supplierSku.
    const relationMappings: Array<{
      mappingKey: string;
      kind: "ACCESSORY" | "CROSS_SELL" | "ALSO_PURCHASED";
      counter: () => void;
      setsCustomizable: boolean;
    }> = [
      { mappingKey: "(rel) accessories", kind: "ACCESSORY", counter: () => { withAccessoryRels++; }, setsCustomizable: true },
      { mappingKey: "(rel) crossSells", kind: "CROSS_SELL", counter: () => { withCrossSellRels++; }, setsCustomizable: false },
      { mappingKey: "(rel) alsoPurchased", kind: "ALSO_PURCHASED", counter: () => { withAlsoPurchasedRels++; }, setsCustomizable: false },
    ];
    const anyRelationMapped = relationMappings.some((r) => mapping[r.mappingKey]);

    if (done && anyRelationMapped) {
      try {
        // Resolución por portalId: idx.skuToPortalId tiene (sku, portalId).
        const portalIdToSku = new Map<string, string>(
          idx.skuToPortalId.map((it) => [it.portalId, it.sku])
        );
        const allSkus = idx.skuToPortalId.map((it) => it.sku);
        const dbBySku = new Map<string, string>();
        const SKU_BATCH = 500;
        for (let s = 0; s < allSkus.length; s += SKU_BATCH) {
          const slice = allSkus.slice(s, s + SKU_BATCH);
          const dbProducts = await prisma.product.findMany({
            where: { supplierSku: { in: slice } },
            select: { id: true, supplierSku: true },
          });
          for (const p of dbProducts) {
            if (p.supplierSku) dbBySku.set(p.supplierSku, p.id);
          }
        }

        function resolveToken(token: string): string | null {
          const skuFromPortal = portalIdToSku.get(token);
          if (skuFromPortal) {
            const id = dbBySku.get(skuFromPortal);
            if (id) return id;
          }
          const direct = dbBySku.get(token);
          if (direct) return direct;
          return null;
        }

        // Iterar todos los chunks una sola vez y procesar las 3 relaciones.
        for (let ci = 0; ci < idx.totalChunks; ci++) {
          const chunkItems = await loadDetailChunk(ci);
          for (const [sku, sourceDetail] of Object.entries(chunkItems)) {
            const parentId = dbBySku.get(sku);
            if (!parentId) continue;

            for (const rel of relationMappings) {
              const path = mapping[rel.mappingKey];
              if (!path) continue;
              const rawTokens = resolvePath(sourceDetail, path);
              const tokens = Array.isArray(rawTokens)
                ? rawTokens.filter((s): s is string => typeof s === "string" && s.length > 0)
                : [];
              const resolvedIds = tokens
                .map((t) => resolveToken(t))
                .filter((id): id is string => id !== null && id !== parentId);
              const uniqueIds = Array.from(new Set(resolvedIds));

              // Reemplazamos las relaciones SOLO de este tipo (no tocamos las otras kind)
              await prisma.accessoryRelation.deleteMany({
                where: { productId: parentId, kind: rel.kind },
              });
              if (uniqueIds.length === 0) continue;

              await prisma.accessoryRelation.createMany({
                data: uniqueIds.map((accId) => ({
                  productId: parentId,
                  accessoryProductId: accId,
                  isRequired: false,
                  kind: rel.kind,
                })),
                skipDuplicates: true,
              });
              if (rel.setsCustomizable) {
                await prisma.product.update({
                  where: { id: parentId },
                  data: { isCustomizable: true },
                });
                // Marca también a cada accesorio con kind=ACCESORIO. Esto NO
                // impide que se vendan standalone (accessoryRequiredWithPrimary
                // controla eso), pero da la información visual de que están
                // pensados como complemento.
                await prisma.product.updateMany({
                  where: { id: { in: uniqueIds } },
                  data: { kind: "ACCESORIO" },
                });
              }
              rel.counter();
            }
          }
        }
      } catch (e) {
        console.error("apply-mapping: final relations pass failed", e);
      }
    }

    let brandReassignment: Record<string, { found: number; updated: number }> | null = null;
    if (done) {
      // Post-procesamiento: ir al API en vivo de mySonance y re-asignar marcas
      // según la categoría top-level pn-*. Esto fixea casos donde el índice
      // persistido tenía SONANCE como marca para productos que en realidad
      // son BLAZE BY SONANCE / TRUFIG / APPAREL / etc.
      try {
        const r = await reassignBrandsFromSonanceApi();
        brandReassignment = r.perBrand;
      } catch (e) {
        console.error("apply-mapping: brand reassignment failed", e);
      }
      revalidatePath("/admin/products");
      revalidatePath("/portal/products");
    }

    return NextResponse.json({
      ok: true,
      processed: batch.length,
      updated,
      created,
      skippedNoDetail,
      withSpecifications,
      withDocuments,
      withImageRels,
      withAccessoryRels,
      withCrossSellRels,
      withAlsoPurchasedRels,
      brandReassignment,
      totalProducts: idx.totalProducts,
      nextOffset: done ? null : nextOffset,
      done,
    } satisfies ApplyMappingResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { ok: false, error, processed: 0, updated: 0, created: 0, skippedNoDetail: 0, withSpecifications: 0, withDocuments: 0, withImageRels: 0, withAccessoryRels: 0, withCrossSellRels: 0, withAlsoPurchasedRels: 0, totalProducts: 0, nextOffset: null, done: false } as ApplyMappingResponse,
      { status: 500 }
    );
  }
}
