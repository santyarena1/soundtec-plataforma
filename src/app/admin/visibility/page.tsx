import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { deleteVisibility } from "@/server/actions/pricing-rules";
import { VisibilityRuleForm } from "./visibility-rule-form";

export const metadata = { title: "Admin · Visibilidad" };

const scopeLabel: Record<string, string> = {
  BRAND: "Marca",
  DISTRIBUTOR: "Proveedor",
  CATEGORY: "Categoría",
  FAMILY: "Familia",
  PRODUCT: "Producto",
  GLOBAL: "Global",
  CLIENT: "Cliente",
};

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visibilidad por cliente"
        description="Decidí qué marcas, distribuidores, categorías, familias o productos puede ver cada cliente. Por defecto el cliente ve todo, salvo reglas explícitas que oculten. Podés seleccionar varios recursos a la vez."
      />

      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3 mb-3">Nueva regla — selección múltiple</h2>
          <VisibilityRuleForm
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
          />
        </CardContent>
      </Card>

      {rules.length === 0 ? (
        <TableEmpty />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Cliente</TH>
              <TH>Alcance</TH>
              <TH>Recurso</TH>
              <TH>Estado</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {rules.map((r) => {
              const resourceName = r.scopeId ? resourceMaps[r.scopeType]?.get(r.scopeId) : null;
              return (
                <TR key={r.id}>
                  <TD>{r.client.companyName}</TD>
                  <TD>
                    <Badge tone="primary">{scopeLabel[r.scopeType] || r.scopeType}</Badge>
                  </TD>
                  <TD>
                    {resourceName || <span className="text-xs text-muted-foreground">{r.scopeId || "—"}</span>}
                  </TD>
                  <TD>
                    {r.canView ? <Badge tone="success">Permitido</Badge> : <Badge tone="destructive">Oculto</Badge>}
                  </TD>
                  <TD className="text-right">
                    <form action={deleteVisibility} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <Button variant="ghost" size="sm" type="submit" className="text-destructive">
                        Eliminar
                      </Button>
                    </form>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
