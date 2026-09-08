import { prisma } from "@/lib/prisma";
import { Tabs } from "@/components/ui/tabs";
import { PricingRulesWorkspace } from "@/app/admin/_rules/workspace";
import { VisibilityRulesWorkspace } from "@/app/admin/visibility/visibility-rules-workspace";
import { attachRuleExemptions, toFiniteNumber, toPricingRuleRow } from "@/lib/pricing-scope";
import {
  deleteDiscountRule,
  deleteDiscountRuleGroup,
  deleteMarginRule,
  deleteMarginRuleGroup,
  deleteVisibility,
  toggleVisibilityCanView,
} from "@/server/actions/pricing-rules";
export async function ClientPricingPanel({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [margin, discount, visibility, brands, distributors, categories, families] =
    await Promise.all([
      prisma.marginRule.findMany({ where: { clientId }, orderBy: { priority: "asc" } }),
      prisma.discountRule.findMany({ where: { clientId }, orderBy: { priority: "asc" } }),
      prisma.visibilityRule.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } }),
      prisma.brand.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.distributor.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.productFamily.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
  const productIds = [
    ...new Set(
      [...margin, ...discount, ...visibility]
        .filter((x) => x.scopeType === "PRODUCT" && x.scopeId)
        .map((x) => x.scopeId!),
    ),
  ];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, normalizedName: true },
      })
    : [];
  const maps: Record<string, Map<string, string>> = {
    BRAND: new Map(brands.map((x) => [x.id, x.name])),
    DISTRIBUTOR: new Map(distributors.map((x) => [x.id, x.name])),
    CATEGORY: new Map(categories.map((x) => [x.id, x.name])),
    FAMILY: new Map(families.map((x) => [x.id, x.name])),
    PRODUCT: new Map(products.map((x) => [x.id, x.normalizedName])),
  };
  const client = [{ id: clientId, name: clientName, companyName: clientName }];
  function rows(data: typeof margin | typeof discount, kind: "margin" | "discount") {
    return attachRuleExemptions(
      data.map((x) =>
        toPricingRuleRow({
          id: x.id,
          name: x.name,
          scopeType: x.scopeType,
          scopeId: x.scopeId,
          clientId: x.clientId,
          isActive: x.isActive,
          createdAt: x.createdAt,
          updatedAt: x.updatedAt,
          percent: toFiniteNumber(
            kind === "margin"
              ? "marginPercent" in x
                ? x.marginPercent
                : 0
              : "discountPercent" in x
                ? x.discountPercent
                : 0,
          ),
          markupMultiplier: "markupMultiplier" in x ? toFiniteNumber(x.markupMultiplier) : null,
          groupId: x.groupId,
          isExemption: x.isExemption,
          clientName,
          resourceName: x.scopeId ? maps[x.scopeType]?.get(x.scopeId) || null : null,
        }),
      ),
    );
  }
  const common = { clients: client, brands, distributors, categories, families, products };
  return (
    <Tabs
      tabs={[
        {
          id: "discount",
          label: "Descuentos",
          content: (
            <PricingRulesWorkspace
              kind="discount"
              lockedClientId={clientId}
              rows={rows(discount, "discount")}
              empty="Este cliente no tiene descuentos propios."
              deleteAction={deleteDiscountRule}
              deleteGroupAction={deleteDiscountRuleGroup}
              {...common}
            />
          ),
        },
        {
          id: "margin",
          label: "Márgenes",
          content: (
            <PricingRulesWorkspace
              kind="margin"
              lockedClientId={clientId}
              rows={rows(margin, "margin")}
              empty="Este cliente no tiene reglas de margen propias."
              deleteAction={deleteMarginRule}
              deleteGroupAction={deleteMarginRuleGroup}
              {...common}
            />
          ),
        },
        {
          id: "visibility",
          label: "Visibilidad",
          content: (
            <VisibilityRulesWorkspace
              defaultClientId={clientId}
              rows={visibility.map((x) => ({
                id: x.id,
                clientId: x.clientId,
                clientName,
                scopeType: x.scopeType,
                scopeId: x.scopeId,
                resourceName: x.scopeId ? maps[x.scopeType]?.get(x.scopeId) || null : null,
                canView: x.canView,
                createdAt: x.createdAt.toISOString(),
                updatedAt: x.updatedAt.toISOString(),
              }))}
              clients={client}
              brands={brands}
              distributors={distributors}
              categories={categories}
              families={families}
              products={products.map((x) => ({ id: x.id, name: x.normalizedName }))}
              deleteAction={deleteVisibility}
              toggleAction={toggleVisibilityCanView}
            />
          ),
        },
      ]}
    />
  );
}
