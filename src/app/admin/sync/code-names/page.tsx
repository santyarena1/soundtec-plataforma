import { requireAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { previewCodeNames } from "@/server/actions/product-code-names";
import { CodeNamesPanel } from "./_client";

export const metadata = { title: "Admin · Nombres por código" };
export const dynamic = "force-dynamic";

export default async function CodeNamesPage() {
  await requireAdmin();
  const { changes } = await previewCodeNames();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nombres por código"
        description="Pasa el nombre de los productos al código que usa Soundtec: modelo del portal en Sonance / BLAZE / JAMES / IPORT / TRUFIG y SKU en las marcas de SoundTube. El título del proveedor se conserva como nombre original."
      />
      <CodeNamesPanel changes={changes} />
    </div>
  );
}
