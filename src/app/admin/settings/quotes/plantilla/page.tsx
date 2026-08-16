import { ArrowLeft } from "lucide-react";
import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ensureQuoteProfiles, getCompanyIdentity, QUOTE_MODULES } from "@/lib/quote-defaults";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { QuoteTemplateEditor, type TemplateModule } from "./template-editor";

export const metadata = { title: "Admin · Editor de plantilla" };

export default async function QuoteTemplateEditorPage() {
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) {
    return <p className="muted-text">No tenés permiso para editar la plantilla de cotizaciones.</p>;
  }

  await ensureQuoteProfiles();
  const [blocks, identity] = await Promise.all([
    prisma.quoteBlock.findMany({ where: { isActive: true } }),
    getCompanyIdentity(),
  ]);

  const byKey = new Map(blocks.map((block) => [block.key, block]));
  // El orden lo manda el módulo, no la base: es el orden real del documento.
  const modules: TemplateModule[] = QUOTE_MODULES.map((mod) => {
    const block = byKey.get(mod.key);
    return {
      key: mod.key,
      kind: mod.kind,
      title: block?.title || mod.title,
      description: mod.description,
      blockId: block?.id ?? null,
      body: block?.body ?? mod.body,
    };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Editor de plantilla"
        description="El presupuesto de muestra. Clickeá un módulo y escribí encima, como en Word. Eso cambia la plantilla maestra de las cotizaciones nuevas. Las ya creadas no se tocan."
        actions={
          <div className="flex gap-2">
            <ButtonLink href="/admin/settings/quotes" variant="outline" size="sm">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Configuración
            </ButtonLink>
            <ButtonLink href="/admin/quotes" variant="outline" size="sm">
              Ir a cotizaciones
            </ButtonLink>
          </div>
        }
      />

      <p className="muted-text">
        Los módulos que redacta la IA y la planilla de equipos se muestran con datos de ejemplo, porque se completan
        en cada cotización. Para cambiar textos de una cotización puntual, abrí esa COT y escribí sobre el documento.
      </p>

      <QuoteTemplateEditor modules={modules} identity={identity} />
    </div>
  );
}
