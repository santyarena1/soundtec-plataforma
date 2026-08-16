import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { listQuoteClassifiers } from "@/lib/quote-classifiers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  addQuoteClassifierOption,
  archiveQuoteClassifier,
  archiveQuoteClassifierOption,
  createQuoteClassifier,
  renameQuoteClassifier,
  renameQuoteClassifierOption,
} from "@/server/actions/quote-classifiers";

export const metadata = { title: "Admin · Clasificadores de COT" };

export default async function QuoteClassifiersSettingsPage() {
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) {
    return <p className="muted-text">No tenés permiso para editar los clasificadores.</p>;
  }
  const classifiers = await listQuoteClassifiers();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clasificadores internos"
        description="Tipo de sala, escala y lo que agregues. Van al inicio de cada COT y sirven para sugerir equipos de casos parecidos."
        actions={
          <ButtonLink href="/admin/settings/quotes" size="sm" variant="outline">
            Volver
          </ButtonLink>
        }
      />

      {classifiers.map((classifier) => (
        <Card key={classifier.id}>
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-end gap-2">
              <form action={renameQuoteClassifier} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={classifier.id} />
                <div className="min-w-[200px] flex-1">
                  <Label htmlFor={`label-${classifier.id}`}>Nombre</Label>
                  <Input id={`label-${classifier.id}`} name="label" defaultValue={classifier.label} />
                </div>
                <div className="min-w-[220px] flex-1">
                  <Label htmlFor={`hint-${classifier.id}`}>Ayuda</Label>
                  <Input id={`hint-${classifier.id}`} name="hint" defaultValue={classifier.hint || ""} />
                </div>
                <Button type="submit" size="sm" variant="outline">
                  Guardar
                </Button>
              </form>
              <form action={archiveQuoteClassifier}>
                <input type="hidden" name="id" value={classifier.id} />
                <Button type="submit" size="sm" variant="ghost">
                  Archivar
                </Button>
              </form>
            </div>
            <ul className="divide-y rounded-md border border-border">
              {classifier.options.map((option) => (
                <li key={option.id} className="flex items-center gap-2 px-3 py-2">
                  <form action={renameQuoteClassifierOption} className="flex flex-1 items-center gap-2">
                    <input type="hidden" name="id" value={option.id} />
                    <Input name="label" defaultValue={option.label} className="h-8" />
                    <Button type="submit" size="sm" variant="ghost">
                      Renombrar
                    </Button>
                  </form>
                  <form action={archiveQuoteClassifierOption}>
                    <input type="hidden" name="id" value={option.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      Quitar
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addQuoteClassifierOption} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="classifierId" value={classifier.id} />
              <Input name="label" placeholder="Nueva opción…" className="max-w-xs" />
              <Button type="submit" size="sm" variant="outline">
                Agregar opción
              </Button>
            </form>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="p-5">
          <form action={createQuoteClassifier} className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="new-classifier">Nuevo clasificador</Label>
              <Input id="new-classifier" name="label" placeholder="Ej. Nivel de integración" />
            </div>
            <Input name="hint" placeholder="Ayuda opcional" className="max-w-xs" />
            <Button type="submit" size="sm">
              Crear clasificador
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
