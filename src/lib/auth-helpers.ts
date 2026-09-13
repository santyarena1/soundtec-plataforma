import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  parsePermissions,
  permissionsHave,
  resolveEffectivePermissions,
  type Permissions,
  type PermissionScope,
} from "@/lib/permissions";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

export async function requireRole(roles: UserRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect(user.role === "CLIENT" ? "/portal" : "/login");
  }
  return user;
}

export async function requireAdmin() {
  return requireRole(["ADMIN", "SUPER_ADMIN"]);
}

export async function requireClient() {
  return requireRole(["CLIENT", "ADMIN", "SUPER_ADMIN"]);
}

/**
 * Devuelve los permisos efectivos del usuario actual, combinando rol base
 * + customRole. Cachea por request via Next runtime.
 */
export async function getCurrentPermissions(): Promise<{
  user: { id: string; role: UserRole; name?: string | null; email?: string | null };
  permissions: Permissions;
}> {
  const user = await requireUser();
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { customRole: { select: { permissionsJson: true, isActive: true } } },
  });
  const customPerms = dbUser?.customRole?.isActive
    ? parsePermissions(dbUser.customRole.permissionsJson as unknown)
    : null;
  const permissions = resolveEffectivePermissions({
    baseRole: user.role,
    customPermissions: customPerms,
  });
  return { user: { id: user.id, role: user.role, name: user.name, email: user.email }, permissions };
}

/**
 * Verifica que el usuario actual pueda usar una pantalla / acción.
 * Si no, redirige a un lugar seguro (portal para clientes, login para admins).
 */
export async function requirePermission(scope: PermissionScope) {
  const { permissions, user } = await getCurrentPermissions();
  if (!permissionsHave(permissions, scope)) {
    if (user.role === "CLIENT") redirect("/portal");
    redirect("/admin");
  }
  return { user, permissions };
}

export async function canSeePrices(): Promise<boolean> {
  const { permissions, user } = await getCurrentPermissions();
  if (permissions.fullAccess) return true;
  if (permissions.hidePrices) return false;
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return true;
  return permissionsHave(permissions, "products.prices.view");
}
