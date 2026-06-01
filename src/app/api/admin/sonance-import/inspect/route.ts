import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { openSession, findProductIdBySku, fetchProductDetailRaw } from "@/services/sonance-portal";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sonance-import/inspect?sku=AMP-X300
 *
 * Devuelve TODOS los campos disponibles de la API my.sonance.com para un SKU
 * dado, separados en:
 * - listing (lo que viene en /api/v2/products con expand=detail,attributes)
 *   — sirve para sync masivo
 * - detail (lo que viene en /api/v1/products/<id> con expand completo)
 *   — son ~113 campos, usado por el enrich
 *
 * Útil para que el usuario vea qué columnas existen y decida cuáles mapear.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sku = req.nextUrl.searchParams.get("sku")?.trim() ?? "";
    if (!sku) {
      return NextResponse.json(
        { ok: false, error: "Falta el parámetro ?sku=" },
        { status: 400 }
      );
    }

    const session = await openSession();
    const productId = await findProductIdBySku(session, sku);
    if (!productId) {
      return NextResponse.json(
        {
          ok: false,
          error: `SKU "${sku}" no encontrado en my.sonance.com. Probá con un SKU de Sonance/IPORT/BLAZE/JAMES (ej. SA68, IW-525, BPS6.5SST, etc.).`,
        },
        { status: 404 }
      );
    }

    const detail = await fetchProductDetailRaw(session, productId);
    if (!detail) {
      return NextResponse.json(
        { ok: false, error: `No se pudo obtener detalle para ${sku}.` },
        { status: 500 }
      );
    }

    // Build flat list of "paths" → sample values for the user to inspect
    const flat: Array<{ path: string; type: string; sample: string }> = [];
    const walk = (obj: unknown, path = ""): void => {
      if (obj === null || obj === undefined) {
        flat.push({ path, type: "null", sample: "" });
        return;
      }
      if (typeof obj === "string") {
        flat.push({ path, type: "string", sample: obj.slice(0, 120) });
        return;
      }
      if (typeof obj === "number" || typeof obj === "boolean") {
        flat.push({ path, type: typeof obj, sample: String(obj) });
        return;
      }
      if (Array.isArray(obj)) {
        flat.push({ path, type: `array(${obj.length})`, sample: obj.length > 0 ? `[${obj.length} items]` : "[]" });
        if (obj.length > 0) walk(obj[0], `${path}[0]`);
        return;
      }
      if (typeof obj === "object") {
        const keys = Object.keys(obj as Record<string, unknown>);
        flat.push({ path, type: `object{${keys.length}}`, sample: `{${keys.slice(0, 6).join(", ")}}` });
        for (const k of keys) {
          walk((obj as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
        }
      }
    };
    walk(detail);

    // Extract attributeTypes labels (the technical specs / categories)
    const attrTypeLabels = (detail.attributeTypes ?? []).map((a) => ({
      label: a.label ?? a.name ?? "",
      values: (a.attributeValues ?? [])
        .slice(0, 3)
        .map((v) => v.valueDisplay ?? v.value ?? ""),
    }));

    // Extract document names+types
    const documentSummary = (detail.documents ?? []).map((d) => ({
      name: d.name ?? "",
      type: d.documentType ?? d.fileTypeString ?? "",
    }));

    // Accessory count + first few SKUs
    const accessorySummary = (detail.accessories ?? []).slice(0, 5).map((a) => ({
      sku: a.productNumber ?? "",
      name: a.productTitle ?? "",
      price: a.unitListPrice ?? null,
    }));

    return NextResponse.json({
      ok: true,
      sku,
      productId,
      flat: flat.slice(0, 500), // límite duro para no explotar
      totalPaths: flat.length,
      attrTypeLabels,
      documentSummary,
      accessoryTotal: detail.accessories?.length ?? 0,
      accessorySummary,
      raw: detail, // todo el detalle V1 raw para inspección directa
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
