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
      <div className="flex justify-end gap-4"><Link href="/admin/sync/soundtube-prices" className="text-xs text-muted-foreground hover:text-foreground hover:underline">Lista de precios SoundTube</Link><Link href="/admin/sync/hall-research-prices" className="text-xs text-muted-foreground hover:text-foreground hover:underline">Lista de precios Hall Research</Link><Link href="/admin/sync/code-names" className="text-xs text-muted-foreground hover:text-foreground hover:underline">Nombres por código</Link><Link href="/admin/sync/legacy" className="text-xs text-muted-foreground hover:text-foreground hover:underline">Herramientas clásicas</Link></div>
    </div>
  );
}
