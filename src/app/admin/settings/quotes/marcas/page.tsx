import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { listBrandLibrary } from "@/server/actions/quote-brands";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { ButtonLink } from "@/components/ui/button";
import { BrandLibraryEditor } from "./brand-library-editor";

export const metadata = { title: "Admin · Biblioteca de marcas" };

export default async function QuoteBrandLibraryPage() {
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) return null;

  const library = await listBrandLibrary();

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
        Logos reutilizables para el modo individual de marcas en cotizaciones. Podés buscarlos en la web con Serper o
        pegar una URL. En cada COT elegís cuáles mostrar u ocultar.
      </p>

      <BrandLibraryEditor
        initial={library.map((row) => ({
          id: row.id,
          label: row.label,
          url: row.url,
          brand: row.brand,
        }))}
      />
    </div>
  );
}
