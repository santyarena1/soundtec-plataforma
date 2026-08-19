import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PriceLogicHint } from "@/components/admin/price-logic-hint";
import { PricingRulesWorkspace } from "../_rules/workspace";
import { deleteDiscountRule, deleteDiscountRuleGroup } from "@/server/actions/pricing-rules";
import { badgeLabel, isManufacturerPromoLabel } from "@/lib/manufacturer-promo";
import { ManufacturerPromosPanel, ProductDiscountsPanel } from "./product-discounts-panel";
import { toPricingRuleRow } from "@/lib/pricing-scope";

export const metadata = { title: "Admin · Descuentos" };

export default async function AdminDiscountsPage() {
  await requireAdmin();
  const [rules, clients, brands, distributors, categories, families, products, productDiscounts, manufacturerPromos] =
    await Promise.all([
      prisma.discountRule.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "desc" }] }),
      prisma.client.findMany({
        where: { isActive: true },
        orderBy: { companyName: "asc" },
        select: { id: true, companyName: true, contactName: true },
      }),
      prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.distributor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.productFamily.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.product.findMany({
        orderBy: { normalizedName: "asc" },
        select: { id: true, normalizedName: true },
        take: 4000,
      }),
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

  const clientMap = new Map(clients.map((c) => [c.id, c.companyName || c.contactName || c.id]));
  const resourceMaps: Record<string, Map<string, string>> = {
    BRAND: new Map(brands.map((b) => [b.id, b.name])),
    DISTRIBUTOR: new Map(distributors.map((d) => [d.id, d.name])),
    CATEGORY: new Map(categories.map((c) => [c.id, c.name])),
    FAMILY: new Map(families.map((f) => [f.id, f.name])),
    PRODUCT: new Map(products.map((p) => [p.id, p.normalizedName])),
  };

  const rows = rules.map((r) =>
    toPricingRuleRow({
      id: r.id,
      name: r.name,
      scopeType: r.scopeType,
      scopeId: r.scopeId,
      clientId: r.clientId,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      percent: Number(r.discountPercent),
      groupId: r.groupId,
      clientName: r.clientId ? clientMap.get(r.clientId) ?? null : null,
      resourceName: r.scopeId ? resourceMaps[r.scopeType]?.get(r.scopeId) ?? null : null,
    })
  );

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

  const clientOpts = clients.map((c) => ({
    id: c.id,
    name: c.contactName || c.companyName,
    companyName: c.companyName,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Descuentos"
        description="Las reglas comerciales viven acá y se pueden editar. El % de la ficha del producto y las etiquetas del fabricante son otras dos fuentes: si el catálogo muestra un descuento y esta tabla está vacía, casi seguro está en una de las listas de abajo."
      />

      <PriceLogicHint variant="discount" />

      <PricingRulesWorkspace
        kind="discount"
        rows={rows}
        empty="Todavía no hay reglas comerciales. El -% que ves en productos puede estar en las listas de abajo."
        deleteAction={deleteDiscountRule}
        deleteGroupAction={deleteDiscountRuleGroup}
        clients={clientOpts}
        brands={brands}
        distributors={distributors}
        categories={categories}
        families={families}
        products={products}
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
