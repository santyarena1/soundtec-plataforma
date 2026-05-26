import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { parsePermissions, type Permissions } from "@/lib/permissions";
import { CustomRolesManager } from "../custom-roles-manager";

export const metadata = { title: "Admin · Roles personalizados" };

export default async function AdminCustomRolesPage() {
  const admin = await requireAdmin();
  const customRoles = await prisma.customRole.findMany({
    orderBy: { createdAt: "desc" },
  });

  const roleSummaries = customRoles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    baseSystemRole: r.baseSystemRole,
    permissions: parsePermissions(r.permissionsJson as unknown) as Permissions,
    isActive: r.isActive,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles personalizados"
        description="Definí qué pantallas y acciones puede usar cada rol con un editor visual. Esto se asigna luego a cada usuario desde su ficha."
      />

      <Card>
        <CardContent className="p-6">
          <CustomRolesManager isSuper={admin.role === "SUPER_ADMIN"} roles={roleSummaries} />
        </CardContent>
      </Card>
    </div>
  );
}
