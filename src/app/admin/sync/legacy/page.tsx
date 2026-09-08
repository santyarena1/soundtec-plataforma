import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Admin · Herramientas clásicas" };
export default async function LegacySyncPage() {
  await requireAdmin();
  return <div className="space-y-6"><PageHeader title="Herramientas clásicas" description="Flujos anteriores. Usalos sólo si el pipeline nuevo no cubre algo; escriben directo en productos sin diff ni rollback." />
    <Card><CardContent className="space-y-3 p-5"><Link className="block text-sm font-medium text-accent hover:underline" href="/admin/crestron-sync">Sincronización clásica de Crestron</Link><Link className="block text-sm font-medium text-accent hover:underline" href="/admin/sonance-import">Importación clásica de Sonance / BLAZE</Link></CardContent></Card>
  </div>;
}
