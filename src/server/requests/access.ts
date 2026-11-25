import type { Prisma } from "@prisma/client";
import { getCurrentPermissions } from "@/lib/auth-helpers";
import { permissionsHave } from "@/lib/permissions";
import { requestScopeWhere } from "@/lib/request-access";

/** Filtro de pedidos visibles para el usuario del panel actual (ver lib/request-access). */
export async function requestAccessWhere(): Promise<Prisma.CustomerRequestWhereInput> {
  const { user, permissions } = await getCurrentPermissions();
  return requestScopeWhere({ userId: user.id, seesAllClients: permissionsHave(permissions, "clients.view_all") }) as Prisma.CustomerRequestWhereInput;
}
