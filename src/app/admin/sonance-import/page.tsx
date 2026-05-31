import { requireAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { SonanceImportPanel } from "./_client";

export const metadata = { title: "Admin · Importación Sonance / IPORT / BLAZE" };

export default async function SonanceImportPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Importación Sonance / IPORT / BLAZE"
        description="Subí la lista de precios en Excel. El sistema detecta automáticamente el formato (Sonance+IPORT o BLAZE) y muestra un preview antes de aplicar."
      />
      <SonanceImportPanel />
    </div>
  );
}
