import { requireAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { UnifiedSyncPanel } from "./_client";

export const metadata = { title: "Admin · Sincronización" };

export default async function SyncPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sincronización de productos"
        description="Unifica Crestron y Sonance en un flujo de previsualización y aplicación, con sincronización automática programada por cron."
      />
      <UnifiedSyncPanel />
    </div>
  );
}
