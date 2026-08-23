import { PageHeader } from "@/components/ui/page-header";
import { ChangelogTimeline } from "@/components/admin/changelog-timeline";
import { listChangelogEntries } from "@/server/actions/changelog";
import { displayChangelogVersion, latestChangelogVersion } from "@/lib/changelog";

export const metadata = { title: "Admin · Changelog" };

export default async function AdminChangelogPage() {
  const entries = await listChangelogEntries();
  const current = displayChangelogVersion(latestChangelogVersion(entries));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Changelog"
        description={`Versión actual ${current}. Cada push suma vX.X.X (el tercer número es un mini-fix). Solo lectura: lo carga el deploy, el portal del cliente no lo ve.`}
      />
      <ChangelogTimeline entries={entries} empty="Todavía no hay novedades en este deploy." />
    </div>
  );
}
