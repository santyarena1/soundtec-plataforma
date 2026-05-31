import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { upsertFamily } from "@/server/actions/admin-catalog";
import { TaxonomyAiSuggestionsPanel } from "@/components/admin/taxonomy-ai-suggestions-panel";
import { TaxonomySuggestionKind, TaxonomySuggestionStatus } from "@prisma/client";

export const maxDuration = 300;
export const metadata = { title: "Admin · Familias" };

export default async function AdminFamiliesPage() {
  await requireAdmin();
  const [families, suggestions, unassignedCount] = await Promise.all([
    prisma.productFamily.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    }),
    prisma.taxonomySuggestion.findMany({
      where: { kind: TaxonomySuggestionKind.FAMILY, status: TaxonomySuggestionStatus.PENDING },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        product: { select: { id: true, normalizedName: true, internalSku: true } },
      },
    }),
    prisma.product.count({ where: { isActive: true, familyId: null } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Familias de producto"
        description="Agrupaciones lógicas del catálogo. La IA puede asignar familias existentes o crear las que falten."
      />

      <TaxonomyAiSuggestionsPanel
        kind="FAMILY"
        title="Clasificación con IA"
        description="Analiza productos activos sin familia. Prioriza familias existentes cuando hay buen match; si no, propone una familia nueva."
        unassignedCount={unassignedCount}
        suggestions={suggestions.map((s) => ({
          id: s.id,
          suggestedName: s.suggestedName,
          targetId: s.targetId,
          confidence: s.confidence,
          rationale: s.rationale,
          product: s.product,
        }))}
      />

      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3 mb-3">Nueva familia</h2>
          <form action={upsertFamily} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <Label htmlFor="name" required>
                Nombre
              </Label>
              <Input id="name" name="name" required placeholder="Ej. Inalámbricos" />
            </div>
            <Button type="submit">Crear</Button>
          </form>
        </CardContent>
      </Card>

      {families.length === 0 ? (
        <TableEmpty />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Familia</TH>
              <TH>Productos</TH>
              <TH>Estado</TH>
            </TR>
          </THead>
          <TBody>
            {families.map((f) => (
              <TR key={f.id}>
                <TD className="font-medium">{f.name}</TD>
                <TD>{f._count.products}</TD>
                <TD>{f.isActive ? <Badge tone="success">Activa</Badge> : <Badge tone="muted">Inactiva</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
