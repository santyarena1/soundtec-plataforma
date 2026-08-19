import { PageHeader } from "@/components/ui/page-header";
import { ChangelogTimeline } from "@/components/admin/changelog-timeline";
import { listChangelogEntries } from "@/server/actions/changelog";

export const metadata = { title: "Admin · Changelog" };

export default async function AdminChangelogPage() {
  const entries = await listChangelogEntries();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Changelog"
        description="Historial de versiones del panel admin. Se actualiza solo con cada push: no se puede editar, borrar ni agregar a mano. El portal del cliente no lo ve."
      />
      <ChangelogTimeline entries={entries} empty="Todavía no hay novedades en este deploy." />
    </div>
  );
}
