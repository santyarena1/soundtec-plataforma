import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { upsertCategory } from "@/server/actions/admin-catalog";
import { TaxonomyAiSuggestionsPanel } from "@/components/admin/taxonomy-ai-suggestions-panel";
import { TaxonomySuggestionKind, TaxonomySuggestionStatus } from "@prisma/client";

export const metadata = { title: "Admin · Categorías" };

export default async function AdminCategoriesPage() {
  await requireAdmin();
  const [cats, suggestions, unassignedCount] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true } }, parent: { select: { name: true } } },
    }),
    prisma.taxonomySuggestion.findMany({
      where: { kind: TaxonomySuggestionKind.CATEGORY, status: TaxonomySuggestionStatus.PENDING },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        product: { select: { id: true, normalizedName: true, internalSku: true } },
      },
    }),
    prisma.product.count({ where: { isActive: true, categoryId: null } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorías"
        description="Organizá el catálogo. La IA puede clasificar productos sin categoría: asignarlos a una existente o proponer categorías nuevas."
      />

      <TaxonomyAiSuggestionsPanel
        kind="CATEGORY"
        title="Clasificación con IA"
        description="Analiza productos activos sin categoría. Si encajan con una categoría del catálogo, los asigna ahí; si no, sugiere crear una categoría nueva para cubrirlos."
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
          <h2 className="heading-3 mb-3">Nueva categoría</h2>
          <form action={upsertCategory} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name" required>
                Nombre
              </Label>
              <Input id="name" name="name" required />
            </div>
            <div>
              <Label htmlFor="parentId">Categoría padre</Label>
              <Select id="parentId" name="parentId">
                <option value="">(sin padre)</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit">Crear</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {cats.length === 0 ? (
        <TableEmpty message="Sin categorías cargadas." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Categoría</TH>
              <TH>Padre</TH>
              <TH>Slug</TH>
              <TH>Productos</TH>
            </TR>
          </THead>
          <TBody>
            {cats.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.name}</TD>
                <TD>{c.parent?.name || "—"}</TD>
                <TD className="text-muted-foreground">{c.slug}</TD>
                <TD>{c._count.products}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
