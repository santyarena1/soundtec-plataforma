/**
 * Acceso a clientes según el rol: quien no tiene «Ver todos los clientes»
 * solo ve y toca los clientes de los que es responsable (ownerId).
 * Sin "use server": helpers para páginas y acciones.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { permissionsHave, type PermissionScope, type Permissions } from "@/lib/permissions";

export type StaffContext = Awaited<ReturnType<typeof requireStaff>>;

export function seesAllClients(perms: Permissions): boolean {
  return permissionsHave(perms, "clients.view_all");
}

/** Filtro de clientes visibles para el usuario. */
export function clientsWhereFor(ctx: StaffContext): Prisma.ClientWhereInput {
  return seesAllClients(ctx.permissions) ? {} : { ownerId: ctx.user.id };
}

/** ¿Puede ver/tocar este cliente? (no redirige). */
export async function canAccessClient(ctx: StaffContext, clientId: string): Promise<boolean> {
  if (seesAllClients(ctx.permissions)) return true;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { ownerId: true } });
  return client?.ownerId === ctx.user.id;
}

/**
 * Para acciones: valida permiso + acceso al cliente. Devuelve el contexto o
 * un mensaje de error para mostrar (las acciones no redirigen).
 */
export async function staffForClient(
  clientId: string | null | undefined,
  scope: PermissionScope | PermissionScope[]
): Promise<{ ctx: StaffContext } | { error: string }> {
  const ctx = await requireStaff(scope);
  if (!clientId) return { error: "Falta el cliente." };
  if (!(await canAccessClient(ctx, clientId))) return { error: "Este cliente está a cargo de otra persona." };
  return { ctx };
}
