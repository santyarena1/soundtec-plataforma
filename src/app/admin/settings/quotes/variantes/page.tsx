import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { moduleByKey } from "@/lib/quote-defaults";
import { VARIANT_BLOCK_KEYS, listBlockVariants } from "@/lib/quote-block-variants";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { BlockVariantsEditor } from "./block-variants-editor";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Admin · Variantes de módulos" };

const VARIANT_BLOCKS = VARIANT_BLOCK_KEYS;

export default async function QuoteBlockVariantsPage() {
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) return null;

  const blocks = await Promise.all(
    VARIANT_BLOCKS.map(async (key) => ({
      key,
      def: moduleByKey(key),
      variants: await listBlockVariants(key),
    }))
  );

  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        href="/admin/settings/quotes"
        actions={
          <ButtonLink href="/admin/settings/quotes" variant="outline" size="sm">
            Volver
          </ButtonLink>
        }
      />

      <p className="text-sm text-muted-foreground">
        Podés guardar varias versiones de un mismo módulo (por ejemplo Disciplinas para gastronomía vs corporativo).
        En el paso Módulos de cada cotización se elige cuál usar.
      </p>

      {blocks.map((block) => (
        <BlockVariantsEditor
          key={block.key}
          blockKey={block.key}
          title={block.def?.title || block.key}
          description={block.def?.description || ""}
          defaultBody={block.def?.body || ""}
          variants={block.variants}
        />
      ))}
    </div>
  );
}
