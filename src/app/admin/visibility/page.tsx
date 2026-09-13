import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { PriceLogicHint } from "@/components/admin/price-logic-hint";
import { deleteVisibility, toggleVisibilityCanView } from "@/server/actions/pricing-rules";
import { VisibilityRulesWorkspace } from "./visibility-rules-workspace";

export const metadata = { title: "Admin · Visibilidad" };

export default async function AdminVisibilityPage() {
  await requireAdmin();
  const [clients, brands, distributors, categories, families, products, rules] = await Promise.all([
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true, contactName: true },
    }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.distributor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.productFamily.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.product.findMany({ orderBy: { normalizedName: "asc" }, select: { id: true, normalizedName: true } }),
    prisma.visibilityRule.findMany({
      orderBy: { createdAt: "desc" },
      include: { client: { select: { companyName: true, contactName: true } } },
    }),
  ]);

  const resourceMaps: Record<string, Map<string, string>> = {
    BRAND: new Map(brands.map((b) => [b.id, b.name])),
    DISTRIBUTOR: new Map(distributors.map((d) => [d.id, d.name])),
    CATEGORY: new Map(categories.map((c) => [c.id, c.name])),
    FAMILY: new Map(families.map((f) => [f.id, f.name])),
    PRODUCT: new Map(products.map((p) => [p.id, p.normalizedName])),
  };

  const rows = rules.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    clientName: r.client.companyName || r.client.contactName || r.clientId,
    scopeType: r.scopeType,
    scopeId: r.scopeId,
    resourceName: r.scopeId ? resourceMaps[r.scopeType]?.get(r.scopeId) ?? null : null,
    canView: r.canView,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visibilidad por cliente"
        description="Por defecto el cliente ve todo. Acá cargás excepciones, las editás y queda registrada la fecha de alta."
      />

      <PriceLogicHint variant="visibility" />

      <VisibilityRulesWorkspace
        rows={rows}
        clients={clients.map((c) => ({
          id: c.id,
          name: c.contactName || c.companyName,
          companyName: c.companyName,
        }))}
        brands={brands}
        distributors={distributors}
        categories={categories}
        families={families}
        products={products.map((p) => ({ id: p.id, name: p.normalizedName }))}
        deleteAction={deleteVisibility}
        toggleAction={toggleVisibilityCanView}
      />
    </div>
  );
}
