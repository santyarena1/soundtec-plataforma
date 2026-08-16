import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { quoteModuleLayoutLabel } from "@/lib/quote-module-layout";
import { ArchiveLibraryModule } from "./archive-button";

export const metadata = { title: "Admin · Borradores de módulos" };

export default async function QuoteModuleLibraryPage() {
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) {
    return <p className="muted-text">No tenés permiso para administrar la biblioteca de módulos.</p>;
  }

  const drafts = await prisma.quoteModuleLibrary.findMany({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    include: { images: { orderBy: { sortOrder: "asc" }, take: 2 } },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Borradores de módulos"
        description="Módulos extra con título, texto y fotos. No entran solos en las cotizaciones nuevas: se insertan a pedido."
        actions={
          <ButtonLink href="/admin/settings/quotes" size="sm" variant="outline">
            Volver a cotizaciones
          </ButtonLink>
        }
      />
      {drafts.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Todavía no hay borradores. En una cotización usá «Agregar módulo» y tildá guardar como borrador.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {drafts.map((draft) => (
            <Card key={draft.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium">{draft.title}</h3>
                    <p className="text-xs text-muted-foreground">{quoteModuleLayoutLabel(draft.layout)}</p>
                  </div>
                  <ArchiveLibraryModule id={draft.id} />
                </div>
                <p className="line-clamp-4 text-sm text-muted-foreground">{draft.body.replace(/<[^>]+>/g, " ")}</p>
                {draft.images.length > 0 ? (
                  <div className="flex gap-2">
                    {draft.images.map((image) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={image.id} src={image.url} alt="" className="h-14 w-14 rounded border border-border object-cover" />
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
