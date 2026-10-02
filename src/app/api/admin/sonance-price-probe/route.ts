import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { findProductIdBySku, openSession, probePortalRequest } from "@/services/sonance-portal";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const PRICE_KEY = /price|cost|msrp|amount|discount|break|onsale|quote/i;
const SKU_PATTERN = /^[A-Za-z0-9 ._\-/]{1,40}$/;

/** Deja solo los campos de precio (recursivo, recortado) para no devolver el detalle entero. */
function priceFields(value: unknown, path = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (Object.keys(out).length > 120) return out;
  if (Array.isArray(value)) {
    value.slice(0, 5).forEach((item, i) => priceFields(item, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/accessor|crossSell|alsoPurchased|documents|images|attributeTypes|priceRules/i.test(key)) continue;
      priceFields(child, path ? `${path}.${key}` : key, out);
    }
  } else if (PRICE_KEY.test(path)) {
    out[path] = value;
  }
  return out;
}

/**
 * GET /api/admin/sonance-price-probe?sku=93542
 *
 * Diagnóstico de una vez (sin UI): pide el precio de un SKU a my.sonance.com
 * por todas las vías conocidas y devuelve los campos de precio de cada una,
 * para elegir de dónde sale el My Price del dealer.
 */
export async function GET(req: NextRequest) {
  await requireAdmin();
  const sku = req.nextUrl.searchParams.get("sku")?.trim() ?? "";
  if (!SKU_PATTERN.test(sku)) {
    return NextResponse.json({ ok: false, error: "Pasá ?sku= con un SKU válido." }, { status: 400 });
  }

  try {
    const session = await openSession();
    const productId = await findProductIdBySku(session, sku);
    if (!productId) return NextResponse.json({ ok: false, error: `No se encontró ${sku} en el portal.` });

    const params = (unitOfMeasure: string) => ({
      productPriceParameters: [{ productId, qtyOrdered: 1, unitOfMeasure }],
    });
    const calls = {
      realtimeUomEmpty: () => probePortalRequest(session, "POST", "/api/v1/realtimepricing", params("")),
      realtimeUomEA: () => probePortalRequest(session, "POST", "/api/v1/realtimepricing", params("EA")),
      detailExpandPricing: () =>
        probePortalRequest(session, "GET", `/api/v1/products/${productId}?expand=pricing`),
      productPrice: () =>
        probePortalRequest(session, "GET", `/api/v1/products/${productId}/price?qtyOrdered=1`),
      listingSearch: () =>
        probePortalRequest(session, "GET", `/api/v2/products?search=${encodeURIComponent(sku)}&pageSize=5&expand=pricing`),
      currentSession: () => probePortalRequest(session, "GET", "/api/v1/sessions/current"),
    };

    const results: Record<string, unknown> = {};
    for (const [name, call] of Object.entries(calls)) {
      try {
        const { status, body } = await call();
        if (name === "currentSession") {
          const s = (body ?? {}) as Record<string, unknown>;
          results[name] = {
            status,
            isAuthenticated: s.isAuthenticated,
            hasBillTo: !!s.billTo,
            hasShipTo: !!s.shipTo,
            billToCustomerNumber: (s.billTo as Record<string, unknown> | undefined)?.customerNumber,
            shipToCustomerNumber: (s.shipTo as Record<string, unknown> | undefined)?.customerNumber,
          };
        } else {
          results[name] = { status, prices: priceFields(body) };
        }
      } catch (error) {
        results[name] = { error: error instanceof Error ? error.message : String(error) };
      }
    }

    return NextResponse.json({ ok: true, sku, productId, results });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error consultando Sonance" },
      { status: 502 }
    );
  }
}
