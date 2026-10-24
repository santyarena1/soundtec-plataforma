import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ensureQuoteProfiles, getCompanyIdentity, QUOTE_MODULES } from "@/lib/quote-defaults";
import { isVariantBlockKey, listAllBlockVariants } from "@/lib/quote-block-variants";
import { QUOTE_AUDIENCES } from "@/lib/quote-audiences";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { PdfTextsEditor, type PdfTextSection } from "./pdf-texts-editor";

export const metadata = { title: "Admin · Textos del PDF" };

/** Por qué un módulo no se edita acá y dónde se cambia. */
const ELSEWHERE: Record<string, { note: string; href?: string; cta?: string }> = {
  brands: { note: "Son los logos de las marcas de la cotización.", href: "/admin/settings/quotes?solapa=identidad", cta: "Logos e imágenes" },
  commercial_terms: { note: "Sale de forma de pago, entrega, vigencia y garantía.", href: "/admin/settings/quotes?solapa=condiciones", cta: "Pago, entrega y garantía" },
  products_table: { note: "Se arma sola con los productos de cada cotización." },
};

export default async function PdfTextsPage() {
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) {
    return <p className="muted-text">No tenés permiso para editar los textos del PDF.</p>;
  }

  await ensureQuoteProfiles();
  const [blocks, variants, identity] = await Promise.all([
    prisma.quoteBlock.findMany({ where: { isActive: true }, select: { key: true, title: true, body: true } }),
    listAllBlockVariants(),
    getCompanyIdentity(),
  ]);
  const byKey = new Map(blocks.map((b) => [b.key, b]));

  const sections: PdfTextSection[] = QUOTE_MODULES.map((mod) => {
    const block = byKey.get(mod.key);
    const elsewhere = ELSEWHERE[mod.key];
    return {
      key: mod.key,
      title: block?.title || mod.title,
      description: mod.description,
      inProfiles: mod.defaultOn,
      mode: isVariantBlockKey(mod.key) ? "editable" : mod.kind === "ai" ? "ai" : "elsewhere",
      note: mod.kind === "ai" ? "Lo redacta la IA en cada cotización, con el brief y los productos." : elsewhere?.note ?? null,
      href: elsewhere?.href ?? null,
      cta: elsewhere?.cta ?? null,
      generalBody: block?.body || mod.body,
      variants: (variants[mod.key] ?? []).map((v) => ({
        id: v.slug,
        label: v.label,
        body: v.body,
        profiles: v.profiles,
        audiences: v.audiences,
        updatedAt: v.updatedAt.toISOString(),
      })),
    };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Textos del PDF"
        description="Cada texto tiene uno general y, si querés, versiones para un tipo de presupuesto o para un rubro. Al crear una cotización sale sola la versión que corresponde. Los cambios valen para las cotizaciones nuevas: las ya creadas no se tocan."
        actions={
          <ButtonLink href="/admin/settings/quotes" variant="outline" size="sm">
            Volver a Configuración
          </ButtonLink>
        }
      />
      <PdfTextsEditor
        sections={sections}
        audiences={QUOTE_AUDIENCES.map((a) => ({ key: a.key, label: a.label }))}
        primaryColor={identity.primary}
      />
    </div>
  );
}
