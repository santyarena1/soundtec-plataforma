import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getSetting, setSetting } from "@/lib/settings";
import {
  openSession,
  buildSkuToIdMap,
  fetchFromPortal,
  fetchProductDetailRaw,
  type PortalProductDetail,
} from "@/services/sonance-portal";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// sync_index = índice estructurado {skuToPortalId, totalChunks, detailDone}
// distinto del preview (sync_preview) que guarda el GET sync básico.
const PAYLOAD_KEY = "sonance.sync_index";
const DETAIL_BUCKET_PREFIX = "sonance.sync_details_"; // chunked storage

export interface SyncFullRequest {
  /** Cuando true, ejecuta la fase de listing y resetea todo. */
  init?: boolean;
  /** Offset para procesar lotes en la fase 'detail'. */
  offset?: number;
  /** Tamaño de lote (default 25). */
  batchSize?: number;
  /** Si true, no re-fetchea productos que ya tienen detalle en cache. */
  skipExisting?: boolean;
}

export interface SyncFullResponse {
  ok: boolean;
  error?: string;
  phase: "init" | "detail" | "done";
  // listing summary
  totalProducts?: number;
  brandCounts?: Record<string, number>;
  // detail progress
  processedDetail?: number;
  totalDetail?: number;
  nextOffset?: number | null;
  done?: boolean;
}

// ── chunked detail storage ────────────────────────────────────────────────────
// Para no estresar AdminSetting con un JSON gigante en cada batch, guardamos
// los detalles en chunks de 50 productos. La clave es DETAIL_BUCKET_PREFIX + idx.

const CHUNK_SIZE = 50;

function bucketKey(idx: number): string {
  return `${DETAIL_BUCKET_PREFIX}${idx}`;
}

async function saveDetailChunk(idx: number, items: Record<string, PortalProductDetail>) {
  await setSetting(bucketKey(idx), JSON.stringify(items));
}

async function loadDetailChunk(idx: number): Promise<Record<string, PortalProductDetail>> {
  const raw = await getSetting(bucketKey(idx), "");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, PortalProductDetail>;
  } catch {
    return {};
  }
}

interface PayloadIndex {
  savedAt: string;
  totalProducts: number;
  totalChunks: number;
  brandCounts: Record<string, number>;
  // skuToPortalId: ordered list — index = position in the catalog
  skuToPortalId: Array<{ sku: string; portalId: string; brand: string }>;
  detailDone: number; // cuántos SKUs ya tienen detalle bajado
}

async function loadPayloadIndex(): Promise<PayloadIndex | null> {
  const raw = await getSetting(PAYLOAD_KEY, "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.skuToPortalId)) {
      return parsed as PayloadIndex;
    }
    return null;
  } catch {
    return null;
  }
}

async function savePayloadIndex(idx: PayloadIndex) {
  await setSetting(PAYLOAD_KEY, JSON.stringify(idx));
}

// ── main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as SyncFullRequest;
    const batchSize = Math.max(1, Math.min(50, body.batchSize ?? 25));

    // ── Fase init: listing completo + reset de detalles ───────────────────────
    if (body.init) {
      const portal = await fetchFromPortal();

      // Build SKU → portalId map para poder bajar detalles después
      const session = await openSession();
      const skuToId = await buildSkuToIdMap(session);

      // Construimos la lista ordenada (sku, portalId, brand) en el mismo orden
      // que el resultado del portal (por SKU para que sea determinista)
      const skuToPortalId: PayloadIndex["skuToPortalId"] = [];
      for (const p of portal.products) {
        const portalId = skuToId.get(p.supplierSku);
        if (!portalId) continue;
        skuToPortalId.push({ sku: p.supplierSku, portalId, brand: p.brand });
      }

      // Limpiar buckets viejos (best-effort: borra hasta 200 índices)
      const oldIdx = await loadPayloadIndex();
      if (oldIdx) {
        for (let i = 0; i < oldIdx.totalChunks; i++) {
          await setSetting(bucketKey(i), "");
        }
      }

      const newIdx: PayloadIndex = {
        savedAt: new Date().toISOString(),
        totalProducts: skuToPortalId.length,
        totalChunks: Math.ceil(skuToPortalId.length / CHUNK_SIZE),
        brandCounts: portal.brandCounts as Record<string, number>,
        skuToPortalId,
        detailDone: 0,
      };
      await savePayloadIndex(newIdx);

      return NextResponse.json({
        ok: true,
        phase: "init",
        totalProducts: newIdx.totalProducts,
        brandCounts: newIdx.brandCounts,
        processedDetail: 0,
        totalDetail: newIdx.totalProducts,
        nextOffset: 0,
        done: newIdx.totalProducts === 0,
      } satisfies SyncFullResponse);
    }

    // ── Fase detail: traer V1 detalle para offset..offset+batchSize ─────────
    const idx = await loadPayloadIndex();
    if (!idx) {
      return NextResponse.json(
        { ok: false, error: "No hay sincronización inicializada. Llamá con { init: true } primero." } as SyncFullResponse,
        { status: 400 }
      );
    }

    const offset = Math.max(0, body.offset ?? idx.detailDone);
    if (offset >= idx.totalProducts) {
      return NextResponse.json({
        ok: true,
        phase: "done",
        totalProducts: idx.totalProducts,
        processedDetail: idx.detailDone,
        totalDetail: idx.totalProducts,
        nextOffset: null,
        done: true,
      } satisfies SyncFullResponse);
    }

    const batch = idx.skuToPortalId.slice(offset, offset + batchSize);
    const skipExisting = body.skipExisting !== false; // default true — no re-fetchar

    // Detectar qué SKUs ya tienen detalle (para skipear y ahorrar requests al portal)
    const existingDetails = new Map<string, PortalProductDetail>();
    if (skipExisting) {
      const chunkIndices = new Set<number>();
      for (let i = 0; i < batch.length; i++) {
        chunkIndices.add(Math.floor((offset + i) / CHUNK_SIZE));
      }
      for (const ci of chunkIndices) {
        const c = await loadDetailChunk(ci);
        for (const [sku, detail] of Object.entries(c)) {
          existingDetails.set(sku, detail);
        }
      }
    }

    const session = await openSession();

    // Fetch V1 detail SOLO para los que no tienen detalle. Concurrency 4.
    const CONCURRENCY = 4;
    const results: Array<{ sku: string; detail: PortalProductDetail | null }> = [];
    const toFetch = batch.filter((item) => !existingDetails.has(item.sku));
    for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
      const chunk = toFetch.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          const detail = await fetchProductDetailRaw(session, item.portalId);
          return { sku: item.sku, detail };
        })
      );
      results.push(...chunkResults);
    }
    // Agregar los que ya tenían detalle (no re-fetched) al results para que
    // el bookkeeping refleje que SÍ tienen detalle disponible.
    for (const item of batch) {
      if (existingDetails.has(item.sku)) {
        results.push({ sku: item.sku, detail: existingDetails.get(item.sku)! });
      }
    }

    // Mergear cada detalle en su chunk correspondiente
    // (chunk index = floor(productPosition / CHUNK_SIZE))
    const chunkUpdates = new Map<number, Record<string, PortalProductDetail>>();
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const result = results[i];
      if (!result.detail) continue;
      const productPos = offset + i;
      const chunkIdx = Math.floor(productPos / CHUNK_SIZE);
      if (!chunkUpdates.has(chunkIdx)) {
        chunkUpdates.set(chunkIdx, await loadDetailChunk(chunkIdx));
      }
      chunkUpdates.get(chunkIdx)![item.sku] = result.detail;
    }
    for (const [chunkIdx, items] of chunkUpdates) {
      await saveDetailChunk(chunkIdx, items);
    }

    // También guardar sourceMetadata en Product si ya existe
    // (no auto-create — eso queda para el flujo Apply)
    const writtenSkus = results.filter((r) => r.detail).map((r) => r.sku);
    if (writtenSkus.length > 0) {
      const dbProducts = await prisma.product.findMany({
        where: { supplierSku: { in: writtenSkus } },
        select: { id: true, supplierSku: true },
      });
      const skuToId = new Map(dbProducts.map((p) => [p.supplierSku!, p.id]));
      for (const r of results) {
        if (!r.detail) continue;
        const productId = skuToId.get(r.sku);
        if (!productId) continue;
        try {
          await prisma.product.update({
            where: { id: productId },
            data: { sourceMetadata: r.detail as unknown as object },
          });
        } catch {
          // best-effort, no rompemos por un producto que falla
        }
      }
    }

    // Actualizar índice
    const nextOffset = offset + batch.length;
    idx.detailDone = Math.max(idx.detailDone, nextOffset);
    await savePayloadIndex(idx);

    const done = nextOffset >= idx.totalProducts;
    return NextResponse.json({
      ok: true,
      phase: done ? "done" : "detail",
      totalProducts: idx.totalProducts,
      processedDetail: nextOffset,
      totalDetail: idx.totalProducts,
      nextOffset: done ? null : nextOffset,
      done,
    } satisfies SyncFullResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { ok: false, error, phase: "init" } as SyncFullResponse,
      { status: 500 }
    );
  }
}
