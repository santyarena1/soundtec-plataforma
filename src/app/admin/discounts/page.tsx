import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { RulesForm } from "../_rules/rules-form";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteDiscountRule } from "@/server/actions/pricing-rules";
import { MarginPriorityGuide } from "@/components/admin/margin-priority-guide";
import { badgeLabel, isManufacturerPromoLabel } from "@/lib/manufacturer-promo";
import { ManufacturerPromosPanel, ProductDiscountsPanel } from "./product-discounts-panel";

export const metadata = { title: "Admin · Descuentos" };

const SCOPE_LABEL: Record<string, string> = {
  GLOBAL: "Global",
  CLIENT: "Cliente",
  BRAND: "Marca",
  DISTRIBUTOR: "Proveedor",
  CATEGORY: "Categoría",
  FAMILY: "Familia",
  PRODUCT: "Producto",
};

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
        description="Las reglas comerciales viven acá. El % de la ficha del producto y las etiquetas del fabricante son otras dos fuentes: si el catálogo muestra un descuento y esta tabla está vacía, casi seguro está en una de las listas de abajo."
      />

      <MarginPriorityGuide />

      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3 mb-3">Nueva regla de descuento</h2>
          <RulesForm
            type="discount"
            clients={clients.map((c) => ({
              id: c.id,
              name: c.contactName || c.companyName,
              companyName: c.companyName,
            }))}
            brands={brands}
            distributors={distributors}
            categories={categories}
            families={families}
            products={products}
          />
        </CardContent>
      </Card>

      {rules.length === 0 ? (
        <TableEmpty message="Todavía no hay reglas comerciales. El -% que ves en productos puede estar en las listas de abajo." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Prioridad</TH>
              <TH>Nombre</TH>
              <TH>Alcance</TH>
              <TH>Cliente</TH>
              <TH className="text-right">Descuento %</TH>
              <TH>Estado</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {rules.map((r) => (
              <TR key={r.id}>
                <TD>{r.priority}</TD>
                <TD className="font-medium">{r.name}</TD>
                <TD>
                  <Badge tone="primary">{SCOPE_LABEL[r.scopeType] || r.scopeType}</Badge>{" "}
                  <span className="text-xs text-muted-foreground">
                    {r.scopeId ? resourceMaps[r.scopeType]?.get(r.scopeId) || r.scopeId : "—"}
                  </span>
                </TD>
                <TD className="text-xs text-muted-foreground">
                  {r.clientId ? (clientMap.get(r.clientId) ?? r.clientId.slice(-6)) : "Todos"}
                </TD>
                <TD className="text-right">{Number(r.discountPercent).toFixed(2)}%</TD>
                <TD>{r.isActive ? <Badge tone="success">Activa</Badge> : <Badge tone="muted">Inactiva</Badge>}</TD>
                <TD className="text-right">
                  <form action={deleteDiscountRule} className="inline">
                    <input type="hidden" name="id" value={r.id} />
                    <Button variant="ghost" size="sm" type="submit" className="text-destructive">
                      Eliminar
                    </Button>
                  </form>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

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
