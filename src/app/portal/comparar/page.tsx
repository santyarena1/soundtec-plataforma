import { requireUser } from "@/lib/auth-helpers";
import { isPanelRole } from "@/lib/permissions";
import { resolveCommercialClientId } from "@/lib/client-context";
import { parseCompareIds } from "@/lib/compare/selection";
import { loadCompareData, toCompareColumnView } from "@/server/catalog/compare";
import { CompareView } from "@/components/compare/compare-view";
import { getConditionsView } from "@/server/catalog/client-conditions";

export const metadata = { title: "Comparar productos" };

/** Comparación en el portal: precios con las condiciones de quien mira (el equipo ve el precio general). */
export default async function PortalComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const user = await requireUser();
  const internal = isPanelRole(user.role);
  const commercialClientId = internal ? null : await resolveCommercialClientId(user.id);
  const ids = parseCompareIds(params.ids);
  // «Activá tus descuentos»: el mismo precio que ve en el catálogo (lista o con sus condiciones).
  const priceClientId = commercialClientId ? (await getConditionsView(user.id, commercialClientId)).priceClientId : null;
  const data = await loadCompareData(ids, { commercialClientId, userId: user.id, isAdmin: internal, priceClientId });
  return (
    <CompareView
      columns={data.columns.map((c) => toCompareColumnView(c, "/portal/products"))}
      specs={data.specs}
      basePath="/portal/comparar"
      catalogHref="/portal/products"
      memoryKey="portal"
      priceNote="USD · no incluye impuestos"
    />
  );
}
