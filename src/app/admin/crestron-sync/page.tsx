import { requireAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { CrestronSyncPanel } from "./_client";

export const metadata = { title: "Admin · Sincronización Crestron" };

export default async function CrestronSyncPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sincronización lista Crestron"
        description="Importa precios y stock directamente desde crestronlatam.xtrabone.mx. Solo actualiza baseCostUsd y stockStatus de productos con internalSku coincidente."
      />
      <CrestronSyncPanel />
    </div>
  );
}
