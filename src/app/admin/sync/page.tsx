import { requireAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { UnifiedSyncPanel } from "./_client";
import Link from "next/link";

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
      <div className="text-right"><Link href="/admin/sync/legacy" className="text-xs text-muted-foreground hover:text-foreground hover:underline">Herramientas clásicas</Link></div>
    </div>
  );
}
