import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { RulesForm } from "../_rules/rules-form";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteMarginRule } from "@/server/actions/pricing-rules";
import { MarginPriorityGuide } from "@/components/admin/margin-priority-guide";

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
      prisma.product.findMany({ orderBy: { normalizedName: "asc" }, select: { id: true, normalizedName: true } }),
    ]);

  const clientMap = new Map(clients.map((c) => [c.id, c.companyName || c.contactName || c.id]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Márgenes"
        description="Definí el margen de venta sobre el costo (con arancel incluido). Las reglas más específicas ganan a las generales."
      />

      <MarginPriorityGuide />

      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3 mb-3">Nueva regla de margen</h2>
          <RulesForm
            type="margin"
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
        <TableEmpty />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Prioridad</TH>
              <TH>Nombre</TH>
              <TH>Alcance</TH>
              <TH>Cliente</TH>
              <TH className="text-right">Margen %</TH>
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
                  <Badge tone="primary">{r.scopeType}</Badge>{" "}
                  <span className="text-xs text-muted-foreground">{r.scopeId || "—"}</span>
                </TD>
                <TD className="text-xs text-muted-foreground">
                  {r.clientId ? (clientMap.get(r.clientId) ?? r.clientId.slice(-6)) : "—"}
                </TD>
                <TD className="text-right">{Number(r.marginPercent).toFixed(2)}%</TD>
                <TD>{r.isActive ? <Badge tone="success">Activa</Badge> : <Badge tone="muted">Inactiva</Badge>}</TD>
                <TD className="text-right">
                  <form action={deleteMarginRule} className="inline">
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
    </div>
  );
}
