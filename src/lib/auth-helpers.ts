import * as React from "react";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canSeeCosts,
  canSeeSalePrices,
  isAdminRole,
  isPanelRole,
  parsePermissions,
  permissionsHave,
  permissionsHaveAny,
  resolveEffectivePermissions,
  type Permissions,
  type PermissionScope,
} from "@/lib/permissions";

/** Memoiza por request (React.cache de Next). Fuera de Next (tests con tsx) no existe: sin memo. */
const cache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  (React as unknown as { cache?: <T>(fn: T) => T }).cache ?? ((fn) => fn);

export type CurrentUser = {
  id: string;
  role: UserRole;
  name?: string | null;
  email?: string | null;
  companyName?: string | null;
  clientId: string | null;
};

/** Ruta que cierra la sesión (cookie) y lleva al login con el motivo. */
export const SIGN_OUT_PATH = "/salir";
/** Pantalla para elegir una clave propia cuando la actual es temporal. */
export const CHANGE_PASSWORD_PATH = "/cuenta/clave";

/**
 * Usuario de la sesión, validado contra la base en cada pedido (una vez por
 * request): si lo desactivaron, le resetearon la clave o le cambiaron el tipo
 * de usuario, la sesión vieja deja de servir aunque el JWT no haya vencido.
 * Rol y datos salen de la base, no del token.
 */
const loadSessionUser = cache(async (): Promise<{ user: CurrentUser; mustChangePassword: boolean } | { invalid: string } | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const tokenVersion = (session.user as { sv?: number }).sv;
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, name: true, email: true, companyName: true, clientId: true, isActive: true, sessionVersion: true, mustChangePassword: true },
  });
  if (!dbUser) return { invalid: "usuario" };
  if (!dbUser.isActive) return { invalid: "inactivo" };
  // Tokens emitidos antes de esta versión no traen `sv`: valen hasta que venzan (8 h) salvo que se haya invalidado algo.
  if ((tokenVersion ?? 0) !== dbUser.sessionVersion) return { invalid: "cambios" };
  return {
    user: { id: dbUser.id, role: dbUser.role, name: dbUser.name, email: dbUser.email, companyName: dbUser.companyName, clientId: dbUser.clientId },
    mustChangePassword: dbUser.mustChangePassword,
  };
});

/** Usuario logueado y vigente, o null (sin redirigir). Para pantallas públicas que cambian si hay sesión. */
export async function getSessionUser(): Promise<CurrentUser | null> {
  const loaded = await loadSessionUser();
  return loaded && "user" in loaded ? loaded.user : null;
}

export async function requireUser(options?: { allowPasswordChange?: boolean }): Promise<CurrentUser> {
  const loaded = await loadSessionUser();
  if (!loaded) redirect("/login");
  if ("invalid" in loaded) redirect(`${SIGN_OUT_PATH}?motivo=${loaded.invalid}`);
  if (loaded.mustChangePassword && !options?.allowPasswordChange) redirect(CHANGE_PASSWORD_PATH);
  return loaded.user;
}

export async function requireRole(roles: UserRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect(user.role === "CLIENT" ? "/portal" : isPanelRole(user.role) ? "/admin" : "/login");
  }
  return user;
}

/** Solo administradores (ADMIN / SUPER_ADMIN). El equipo interno NO pasa: usar requireStaff(scope). */
export async function requireAdmin() {
  return requireRole(["ADMIN", "SUPER_ADMIN"]);
}

export async function requireSuperAdmin() {
  return requireRole(["SUPER_ADMIN"]);
}

/** Portal: clientes, y también el equipo y los admins (para ver lo que ve un cliente). */
export async function requireClient() {
  return requireRole(["CLIENT", "STAFF", "ADMIN", "SUPER_ADMIN"]);
}

/** Permisos efectivos del usuario actual (tipo de usuario + rol). Una vez por request. */
export const getCurrentPermissions = cache(
  async (): Promise<{ user: CurrentUser; permissions: Permissions }> => {
    const user = await requireUser();
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { customRole: { select: { permissionsJson: true, isActive: true } } },
    });
    const customPerms = dbUser?.customRole?.isActive ? parsePermissions(dbUser.customRole.permissionsJson as unknown) : null;
    const permissions = resolveEffectivePermissions({ baseRole: user.role, customPermissions: customPerms });
    return { user, permissions };
  }
);

function deny(user: CurrentUser): never {
  if (user.role === "CLIENT") redirect("/portal");
  redirect("/admin?sinPermiso=1");
}

/**
 * Verifica que el usuario actual pueda usar una pantalla / acción.
 * Si no, redirige a un lugar seguro (portal para clientes, inicio del panel para el equipo).
 */
export async function requirePermission(scope: PermissionScope) {
  const { permissions, user } = await getCurrentPermissions();
  if (!permissionsHave(permissions, scope)) deny(user);
  return { user, permissions };
}

/**
 * Panel de administración para admins y equipo interno. Sin scope: cualquier
 * usuario del panel. Con scope(s): hace falta al menos uno. `costs: true`
 * exige además acceso a costos (pantallas con costos, márgenes o proveedores).
 */
export async function requireStaff(scope?: PermissionScope | PermissionScope[], options?: { costs?: boolean }) {
  const { permissions, user } = await getCurrentPermissions();
  if (!isPanelRole(user.role)) deny(user);
  const scopes = scope === undefined ? [] : Array.isArray(scope) ? scope : [scope];
  if (scopes.length && !permissionsHaveAny(permissions, scopes)) deny(user);
  if (options?.costs && !canSeeCosts(permissions)) deny(user);
  return { user, permissions, isAdmin: isAdminRole(user.role), seesCosts: canSeeCosts(permissions) };
}

/** Ve costos y márgenes (admins y roles con acceso «Todo»). */
export async function canSeePrices(): Promise<boolean> {
  const { permissions } = await getCurrentPermissions();
  return canSeeCosts(permissions);
}

/** Ve al menos precios de venta. */
export async function canSeeSalePricesNow(): Promise<boolean> {
  const { permissions } = await getCurrentPermissions();
  return canSeeSalePrices(permissions);
}
