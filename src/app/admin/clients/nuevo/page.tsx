import Link from "next/link";
import { requireStaff } from "@/lib/auth-helpers";
import { permissionsHave } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { ClientEditor } from "@/components/admin/client-editor";
import { seesAllClients } from "@/server/clients/access";
import { loadClientEditorOptions } from "@/server/clients/editor-options";

export const metadata = { title: "Admin · Nuevo cliente" };

export default async function NewClientPage() {
  const ctx = await requireStaff("clients.create");
  const options = await loadClientEditorOptions();
  return (
    <div className="space-y-6">
      <Link href="/admin/clients" className="text-sm text-muted-foreground">
        ← Volver a clientes
      </Link>
      <PageHeader
        title="Nuevo cliente"
        description="Cargá la empresa completa de una vez: datos, dirección, contactos con acceso al portal y condiciones comerciales."
      />
      <ClientEditor
        {...options}
        canCommercial={permissionsHave(ctx.permissions, "clients.commercial")}
        canPortal={permissionsHave(ctx.permissions, "clients.portal_users")}
        canChooseOwner={seesAllClients(ctx.permissions)}
        currentUserId={ctx.user.id}
      />
    </div>
  );
}
