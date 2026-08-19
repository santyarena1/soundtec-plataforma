import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { PriceLogicHint } from "@/components/admin/price-logic-hint";
import { PricingRulesWorkspace } from "../_rules/workspace";
import { deleteMarginRule } from "@/server/actions/pricing-rules";
import { toPricingRuleRow } from "@/lib/pricing-scope";

export const metadata = { title: "Admin · Márgenes" };

export default async function AdminMarginsPage() {
  await requireAdmin();
  const [rules, clients, brands, distributors, categories, families, products] =
    await Promise.all([
      prisma.marginRule.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "desc" }] }),
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
      percent: Number(r.marginPercent),
      markupMultiplier: r.markupMultiplier != null ? Number(r.markupMultiplier) : null,
      clientName: r.clientId ? clientMap.get(r.clientId) ?? null : null,
      resourceName: r.scopeId ? resourceMaps[r.scopeType]?.get(r.scopeId) ?? null : null,
    })
  );

  const clientOpts = clients.map((c) => ({
    id: c.id,
    name: c.contactName || c.companyName,
    companyName: c.companyName,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Márgenes"
        description="Definí el markup o el margen sobre el costo nacionalizado. La regla más específica gana. Cada regla queda con fecha de alta y se puede editar."
      />

      <PriceLogicHint variant="margin" />

      <PricingRulesWorkspace
        kind="margin"
        rows={rows}
        empty="Todavía no hay reglas de precio."
        deleteAction={deleteMarginRule}
        clients={clientOpts}
        brands={brands}
        distributors={distributors}
        categories={categories}
        families={families}
        products={products}
      />
    </div>
  );
}
