import { getCurrentPermissions } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ChangelogWorkspace } from "./workspace";
import { listChangelogEntries } from "@/server/actions/changelog";

export const metadata = { title: "Admin · Changelog" };

export default async function AdminChangelogPage() {
  const { user } = await getCurrentPermissions();
  const canWrite = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const entries = await listChangelogEntries();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Changelog"
        description="Historial de versiones del panel admin. Las novedades de cada push se publican solas: el popup aparece por usuario hasta que toca Entendido. El portal del cliente no lo ve."
      />

      <ChangelogWorkspace entries={entries} canWrite={canWrite} />

      {!canWrite ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Podés leer las novedades. Publicar o editar queda para administradores.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
