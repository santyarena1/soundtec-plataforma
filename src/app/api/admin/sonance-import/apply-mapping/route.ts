import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { slugify } from "@/lib/utils";
import { applyMapping, resolvePath } from "@/services/portal-path-resolver";
import type { PortalProductDetail } from "@/services/sonance-portal";
import { revalidatePath } from "next/cache";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const PAYLOAD_KEY = "sonance.sync_payload";
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
}

interface ApplyMappingResponse {
  ok: boolean;
  error?: string;
  processed: number;
  updated: number;
  created: number;
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
 * Convierte un valor "crudo" del mapping a algo que Prisma acepta para un campo.
 * - Strings/booleans/numbers: pasan
 * - Arrays/objects: solo aceptados para campos JSON (specifications, documents, sourceMetadata)
 */
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

  const decimalFields = new Set([
    "baseCostUsd", "tariffDutyPercent", "aecPercent", "tePercent",
    "weight", "volume", "discountPercent", "coefNac", "coefVta",
    "ivaPercent", "impIntPercent", "coefVtaFob",
    "salePriceUsd", "widthCm", "heightCm", "depthCm",
  ]);
  if (decimalFields.has(field)) {
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^0-9.\-]/g, ""));
    if (!isFinite(n)) return { ok: false, reason: "not a number" };
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

    // 1. Load mapping
    const mappingRaw = await getSetting(MAPPING_KEY, "{}");
    let mapping: Record<string, string> = {};
    try {
      mapping = JSON.parse(mappingRaw);
    } catch { /* ignore */ }
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
        error: "No hay sincronización guardada. Hacé sync primero.",
      } as ApplyMappingResponse, { status: 400 });
    }

    const batch = idx.skuToPortalId.slice(offset, offset + batchSize);
    if (batch.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        updated: 0,
        created: 0,
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
    const brandIdByName = new Map<string, string>();
    for (const n of brandNamesNeeded) brandIdByName.set(n, await upsertBrandByName(n));
    const categoryIdByName = new Map<string, string>();
    for (const n of categoryNamesNeeded) categoryIdByName.set(n, await upsertCategoryByName(n));
    const familyIdByName = new Map<string, string>();
    for (const n of familyNamesNeeded) familyIdByName.set(n, await upsertFamilyByName(n));

    // 5. Process each item
    let updated = 0;
    let created = 0;

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const productPos = offset + i;
      const chunkIdx = Math.floor(productPos / CHUNK_SIZE);
      const detail = chunks.get(chunkIdx)?.[item.sku];
      if (!detail) continue;

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
        if (field === "(rel) images" || field === "(rel) accessories") continue;

        const coerced = coerceForField(field, rawValue);
        if (!coerced.ok) continue;
        productData[field] = coerced.value;
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
      } else {
        if (!createMissing) continue;
        // Create — Product requires normalizedName + originalName + baseCostUsd
        const detailRecord = detail as unknown as Record<string, unknown>;
        const fallbackName = typeof detailRecord.productTitle === "string"
          ? detailRecord.productTitle
          : item.sku;
        const fallbackPrice = typeof detailRecord.unitListPrice === "number"
          ? detailRecord.unitListPrice
          : 0;
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
      }

      // Relations: images
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
          } catch (e) {
            console.error("apply-mapping: failed images for", item.sku, e);
          }
        }
      }

      // Relations: accessories (array of SKUs → AccessoryRelation rows)
      if (mapping["(rel) accessories"]) {
        const skusRaw = resolvePath(detail, mapping["(rel) accessories"]);
        const accSkus = Array.isArray(skusRaw)
          ? skusRaw.filter((s): s is string => typeof s === "string" && s.length > 0)
          : [];
        if (accSkus.length > 0) {
          try {
            const accProducts = await prisma.product.findMany({
              where: { supplierSku: { in: accSkus } },
              select: { id: true, supplierSku: true },
            });
            await prisma.accessoryRelation.deleteMany({ where: { productId } });
            if (accProducts.length > 0) {
              await prisma.accessoryRelation.createMany({
                data: accProducts
                  .filter((p) => p.id !== productId)
                  .map((p) => ({ productId, accessoryProductId: p.id, isRequired: false })),
                skipDuplicates: true,
              });
            }
          } catch (e) {
            console.error("apply-mapping: failed accessories for", item.sku, e);
          }
        }
      }
    }

    const nextOffset = offset + batch.length;
    const done = nextOffset >= idx.totalProducts;

    if (done) {
      revalidatePath("/admin/products");
      revalidatePath("/portal/products");
    }

    return NextResponse.json({
      ok: true,
      processed: batch.length,
      updated,
      created,
      totalProducts: idx.totalProducts,
      nextOffset: done ? null : nextOffset,
      done,
    } satisfies ApplyMappingResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { ok: false, error, processed: 0, updated: 0, created: 0, totalProducts: 0, nextOffset: null, done: false } as ApplyMappingResponse,
      { status: 500 }
    );
  }
}
