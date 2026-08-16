import { redirect } from "next/navigation";
import { getCurrentPermissions } from "@/lib/auth-helpers";
import { permissionsHave } from "@/lib/permissions";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { SettingsNav } from "@/components/layout/settings-nav";
import { PageHeader } from "@/components/ui/page-header";

export default async function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  const { permissions } = await getCurrentPermissions();
  const allowed = SETTINGS_SECTIONS.filter((s) => permissionsHave(permissions, s.scope));
  if (allowed.length === 0) redirect("/admin");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        description="Un solo lugar para todo lo que se configura, agrupado por área."
      />

      <div className="grid gap-6 lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-10">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <SettingsNav allowedHrefs={allowed.map((s) => s.href)} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
