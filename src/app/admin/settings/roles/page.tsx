import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ensureSystemRoles } from "@/server/system-roles";
import { parsePermissions } from "@/lib/permissions";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { CustomRolesManager, type RoleSummary } from "@/components/admin/custom-roles-manager";
import { Card, CardContent } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Admin · Roles y permisos" };

export default async function SettingsRolesPage() {
  await requireStaff("roles.manage");
  await ensureSystemRoles().catch((e) => console.error("[roles] ensure", e));
  const customRoles = await prisma.customRole.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { users: true } } },
  });

  const roles: RoleSummary[] = customRoles.map((r) => {
    const perms = parsePermissions(r.permissionsJson as unknown);
    return {
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      type: r.baseSystemRole === "CLIENT" ? "CLIENT" : r.baseSystemRole === "STAFF" ? "STAFF" : "LEGACY_ADMIN",
      scopes: perms.scopes,
      priceAccess: perms.priceAccess ?? "none",
      isActive: r.isActive,
      users: r._count.users,
      systemKey: r.key,
    };
  });

  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        href="/admin/settings/roles"
        actions={
          <ButtonLink href="/admin/users?tipo=staff" variant="outline" size="sm">
            Ver el equipo
          </ButtonLink>
        }
      />
      <Card>
        <CardContent className="p-5">
          <CustomRolesManager roles={roles} />
        </CardContent>
      </Card>
    </div>
  );
}
