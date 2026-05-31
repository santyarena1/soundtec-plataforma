import { requireAdmin } from "@/lib/auth-helpers";
import { NcmSearchClient } from "./ncm-search-client";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Admin · Posiciones NCM" };

export default async function NcmPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Posiciones arancelarias (NCM)"
        description="Buscá posiciones NCM por descripción del producto. Fuente: PCRAM."
      />
      <NcmSearchClient />
    </div>
  );
}
