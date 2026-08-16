import { requirePermission } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { parsePermissions, type Permissions } from "@/lib/permissions";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { CustomRolesManager } from "@/components/admin/custom-roles-manager";
import { Card, CardContent } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Admin · Roles y permisos" };

export default async function SettingsRolesPage() {
  const { user } = await requirePermission("roles.manage");
  const customRoles = await prisma.customRole.findMany({ orderBy: { createdAt: "desc" } });

  const roleSummaries = customRoles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    baseSystemRole: r.baseSystemRole,
    permissions: parsePermissions(r.permissionsJson as unknown) as Permissions,
    isActive: r.isActive,
  }));

  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        href="/admin/settings/roles"
        actions={
          <ButtonLink href="/admin/users" variant="outline" size="sm">
            Asignar a usuarios
          </ButtonLink>
        }
      />

      <Card>
        <CardContent className="p-5">
          <CustomRolesManager isSuper={user.role === "SUPER_ADMIN"} roles={roleSummaries} />
        </CardContent>
      </Card>
    </div>
  );
}
