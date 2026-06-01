import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { getSetting } from "@/lib/settings";
import type { PortalProductDetail } from "@/services/sonance-portal";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const PAYLOAD_KEY = "sonance.sync_index";
const DETAIL_BUCKET_PREFIX = "sonance.sync_details_";
const CHUNK_SIZE = 50;

interface PayloadIndex {
  totalProducts: number;
  totalChunks: number;
  skuToPortalId: Array<{ sku: string; portalId: string; brand: string }>;
  detailDone: number;
}

/**
 * GET /api/admin/sonance-import/sample-product?random=1&sku=SA68
 *
 * Devuelve un producto de ejemplo desde el cached payload — útil para la UI
 * de mapping para mostrar valores de muestra en cada path API.
 *
 * Sin params: devuelve el primer producto que tenga detalle V1 bajado.
 * `random=1`: elige uno al azar entre los que tienen detalle.
 * `sku=XXX`: devuelve ese específico si está disponible.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const wantRandom = req.nextUrl.searchParams.get("random") === "1";
    const wantSku = req.nextUrl.searchParams.get("sku")?.trim();

    const raw = await getSetting(PAYLOAD_KEY, "");
    if (!raw) {
      return NextResponse.json(
        {
          ok: false,
          error: "No hay sincronización guardada. Hacé sync primero (Paso 1).",
        },
        { status: 404 }
      );
    }
    let idx: PayloadIndex;
    try {
      idx = JSON.parse(raw) as PayloadIndex;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Cached payload corrupto." },
        { status: 500 }
      );
    }

    if (!Array.isArray(idx.skuToPortalId) || idx.skuToPortalId.length === 0) {
      return NextResponse.json(
        { ok: false, error: "El payload no tiene productos." },
        { status: 404 }
      );
    }

    // Estrategia de selección
    let candidatePositions: number[];
    if (wantSku) {
      const pos = idx.skuToPortalId.findIndex(
        (e) => e.sku.toUpperCase() === wantSku.toUpperCase()
      );
      if (pos < 0) {
        return NextResponse.json(
          { ok: false, error: `SKU "${wantSku}" no está en el cached payload.` },
          { status: 404 }
        );
      }
      candidatePositions = [pos];
    } else if (wantRandom) {
      // Mezclamos posiciones aleatoriamente, después filtramos por detalle disponible
      const allPositions = Array.from({ length: idx.skuToPortalId.length }, (_, i) => i);
      // Fisher-Yates parcial: solo necesitamos las primeras 20 para no gastar memoria
      for (let i = allPositions.length - 1; i > Math.max(0, allPositions.length - 20); i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allPositions[i], allPositions[j]] = [allPositions[j], allPositions[i]];
      }
      candidatePositions = allPositions.slice(-20);
    } else {
      // Default: primer producto que tenga detalle
      candidatePositions = Array.from({ length: Math.min(idx.skuToPortalId.length, 20) }, (_, i) => i);
    }

    // Buscar el primero que tenga detalle V1 ya cacheado
    const chunkCache = new Map<number, Record<string, PortalProductDetail>>();
    for (const pos of candidatePositions) {
      const entry = idx.skuToPortalId[pos];
      const chunkIdx = Math.floor(pos / CHUNK_SIZE);
      if (!chunkCache.has(chunkIdx)) {
        const chunkRaw = await getSetting(DETAIL_BUCKET_PREFIX + chunkIdx, "");
        try {
          chunkCache.set(chunkIdx, chunkRaw ? JSON.parse(chunkRaw) : {});
        } catch {
          chunkCache.set(chunkIdx, {});
        }
      }
      const detail = chunkCache.get(chunkIdx)?.[entry.sku];
      if (detail) {
        return NextResponse.json({
          ok: true,
          sku: entry.sku,
          brand: entry.brand,
          productTitle: detail.productTitle ?? entry.sku,
          detail,
        });
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: `Aún no hay detalle V1 bajado para los primeros productos. Esperá a que termine la sync completa (fase 2) o resincronizá.`,
        detailDone: idx.detailDone,
        totalProducts: idx.totalProducts,
      },
      { status: 404 }
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
