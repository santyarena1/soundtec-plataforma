import { ArrowLeft } from "lucide-react";
import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ensureQuoteProfiles, getCompanyIdentity, QUOTE_MODULES } from "@/lib/quote-defaults";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { QuoteTemplateEditor, type TemplateModule } from "./template-editor";
import { listAllBlockVariants } from "@/lib/quote-block-variants";
import { pickTextVariant } from "@/lib/quote-text-variant-pick";
import { audienceLabel, isQuoteAudience } from "@/lib/quote-audiences-db";

const PROFILE_LABEL: Record<string, string> = { resumido: "Corto", tecnico: "Estándar", premium: "Completo" };

export const metadata = { title: "Admin · Editor de plantilla" };

export default async function QuoteTemplateEditorPage({ searchParams }: { searchParams: { tipo?: string; rubro?: string } }) {
  const tipo = searchParams.tipo && PROFILE_LABEL[searchParams.tipo] ? searchParams.tipo : null;
  const rubro = searchParams.rubro && (await isQuoteAudience(searchParams.rubro)) ? searchParams.rubro : null;
  const rubroLabel = await audienceLabel(rubro);
  const trying = Boolean(tipo || rubro);
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) {
    return <p className="muted-text">No tenés permiso para editar la plantilla de cotizaciones.</p>;
  }

  await ensureQuoteProfiles();
  const [blocks, identity, variants] = await Promise.all([
    prisma.quoteBlock.findMany({ where: { isActive: true } }),
    getCompanyIdentity(),
    listAllBlockVariants(),
  ]);

  const byKey = new Map(blocks.map((block) => [block.key, block]));
  // El orden lo manda el módulo, no la base: es el orden real del documento.
  const modules: TemplateModule[] = QUOTE_MODULES.filter((mod) => !tipo || mod.defaultOn.includes(tipo as "tecnico")).map((mod) => {
    const block = byKey.get(mod.key);
    // Probando una combinación: sale la versión que corresponde, y no se edita acá.
    const chosen = trying ? pickTextVariant(variants[mod.key] ?? [], { profileKey: tipo, audience: rubro }) : null;
    return {
      key: mod.key,
      kind: mod.kind,
      title: block?.title || mod.title,
      description: chosen ? `Versión «${chosen.label}»` : mod.description,
      blockId: trying ? null : block?.id ?? null,
      body: chosen?.body ?? block?.body ?? mod.body,
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

      {trying ? (
        <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          Vista de prueba: presupuesto <b>{tipo ? PROFILE_LABEL[tipo] : "cualquier tipo"}</b> para <b>{rubroLabel ?? "sin rubro"}</b>. Así sale una cotización
          nueva con esa combinación. Para cambiar los textos usá{" "}
          <a href="/admin/settings/quotes/textos" className="text-primary underline">Textos del PDF</a>.
        </p>
      ) : null}
      <p className="muted-text">
        Los módulos que redacta la IA y la planilla de equipos se muestran con datos de ejemplo, porque se completan
        en cada cotización. Para cambiar textos de una cotización puntual, abrí esa COT y escribí sobre el documento.
      </p>

      <QuoteTemplateEditor modules={modules} identity={identity} />
    </div>
  );
}
