import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PriceLogicHint } from "@/components/admin/price-logic-hint";
import { PriceReviewBanner } from "@/components/admin/price-review-banner";
import { PricingRulesWorkspace } from "../_rules/workspace";
import { badgeLabel, isManufacturerPromoLabel } from "@/lib/manufacturer-promo";
import { ManufacturerPromosPanel, ProductDiscountsPanel } from "./product-discounts-panel";
import { loadRulesPageData } from "@/server/pricing/rules-page-data";

export const metadata = { title: "Admin · Descuentos" };

export default async function AdminDiscountsPage() {
  await requireStaff("discounts.manage", { costs: true });
  const [data, productDiscounts, manufacturerPromos] = await Promise.all([
    loadRulesPageData("discount"),
    prisma.product.findMany({
      where: { discountPercent: { gt: 0 } },
      orderBy: [{ discountPercent: "desc" }, { normalizedName: "asc" }],
      select: {
        id: true,
        normalizedName: true,
        internalSku: true,
        discountPercent: true,
        brand: { select: { name: true } },
      },
    }),
    prisma.product.findMany({
      where: {
        OR: [{ salePriceLabel: { not: null } }, { salePriceUsd: { gt: 0 } }],
      },
      orderBy: { normalizedName: "asc" },
      select: {
        id: true,
        normalizedName: true,
        internalSku: true,
        salePriceLabel: true,
        salePriceUsd: true,
        badges: true,
        brand: { select: { name: true } },
      },
    }),
  ]);

  const promoRows = manufacturerPromos
    .map((p) => {
      const badgePromo = Array.isArray(p.badges)
        ? p.badges.map(badgeLabel).find((label) => isManufacturerPromoLabel(label))
        : null;
      const label = p.salePriceLabel || badgePromo || null;
      const saleUsd = p.salePriceUsd != null ? Number(p.salePriceUsd) : null;
      if (!isManufacturerPromoLabel(label) && !(saleUsd != null && saleUsd > 0)) return null;
      return {
        id: p.id,
        name: p.normalizedName,
        sku: p.internalSku,
        brand: p.brand?.name ?? null,
        label,
        saleUsd,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Descuentos"
        description="Las reglas comerciales viven acá y se pueden editar. El % de la ficha del producto y las etiquetas del fabricante son otras dos fuentes: si el catálogo muestra un descuento y esta tabla está vacía, casi seguro está en una de las listas de abajo."
      />

      <PriceReviewBanner area="DISCOUNT" counts={data.pendingCounts} />

      <PriceLogicHint variant="discount" />

      <PricingRulesWorkspace
        kind="discount"
        rows={data.rows}
        pending={data.pending}
        renderedAt={data.renderedAt}
        empty="Todavía no hay reglas comerciales. El -% que ves en productos puede estar en las listas de abajo."
        clients={data.clients}
        brands={data.brands}
        distributors={data.distributors}
        families={data.families}
        lines={data.lines}
        products={data.products}
      />

      <Card>
        <CardContent className="p-6">
          <ProductDiscountsPanel
            rows={productDiscounts.map((p) => ({
              id: p.id,
              name: p.normalizedName,
              sku: p.internalSku,
              brand: p.brand?.name ?? null,
              percent: Number(p.discountPercent),
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <ManufacturerPromosPanel rows={promoRows} />
        </CardContent>
      </Card>
    </div>
  );
}
