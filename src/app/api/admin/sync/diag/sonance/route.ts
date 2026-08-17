import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  fetchFromPortalWithIds,
  fetchProductDetailRawOrThrow,
  openSession,
  rawApiGet,
  sessionFromCookies,
  type Session,
} from "@/services/sonance-portal";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasProductKey(value: unknown): boolean {
  return !!value && typeof value === "object" && "product" in value;
}

export async function GET() {
  await requireAdmin();

  const diag: Record<string, unknown> = {};
  let session: Session | undefined;
  let samplePortalId: string | undefined;

  try {
    session = await openSession();
    diag.loginOk = true;
    diag.cookieNames = Object.keys(session.cookies);
    diag.roundTripCookieCount = Object.keys(
      sessionFromCookies(session.cookies).cookies
    ).length;
  } catch (error) {
    diag.loginOk = false;
    diag.loginError = errorMessage(error);
  }

  if (session) {
    try {
      const result = await fetchFromPortalWithIds(session);
      const sample = result.products[0];
      samplePortalId = sample?.portalId;
      diag.total = result.total;
      diag.sampleSku = sample?.product.supplierSku;
      diag.samplePortalId = samplePortalId;
    } catch (error) {
      diag.listingError = errorMessage(error);
    }
  } else {
    diag.listingError = "No se pudo obtener una sesión";
  }

  if (session && samplePortalId) {
    try {
      const detail = await fetchProductDetailRawOrThrow(session, samplePortalId);
      diag.detailOk = true;
      diag.detailIsNull = detail === null;
      diag.detailKeys = detail ? Object.keys(detail).slice(0, 15) : [];
      diag.productTitle = detail?.productTitle;
      diag.hasSpecs = !!detail?.attributeTypes?.length;
    } catch (error) {
      diag.detailOk = false;
      diag.detailError = errorMessage(error);
    }

    const richPath =
      `/api/v1/products/${encodeURIComponent(samplePortalId)}` +
      "?expand=specifications,documents,attributes,detail,accessories,crosssells,brand";
    const plainPath = `/api/v1/products/${encodeURIComponent(samplePortalId)}`;
    const rich = await rawApiGet(session, richPath);
    const plain = await rawApiGet(session, plainPath);
    diag.rawRich = {
      status: rich.status,
      bodyHead: rich.bodyHead,
      hasProductKey: hasProductKey(rich.json),
    };
    diag.rawPlain = {
      status: plain.status,
      bodyHead: plain.bodyHead,
      hasProductKey: hasProductKey(plain.json),
    };
  } else {
    diag.detailOk = false;
    diag.detailError = "No hay sesión o portalId de muestra";
    diag.rawRich = { skipped: true };
    diag.rawPlain = { skipped: true };
  }

  return NextResponse.json({ ok: true, diag });
}
