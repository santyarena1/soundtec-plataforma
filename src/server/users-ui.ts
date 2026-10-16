/** Datos compartidos por las pantallas de usuarios (listado y detalle). */

import { prisma } from "@/lib/prisma";
import type { RoleOption } from "@/components/admin/user-form-modal";

export const USER_TYPE_LABEL: Record<string, string> = {
  CLIENT: "Cliente del portal",
  STAFF: "Equipo",
  ADMIN: "Administrador",
  SUPER_ADMIN: "Super admin",
};

export async function loadUserFormOptions(): Promise<{ clients: { id: string; name: string }[]; roles: RoleOption[] }> {
  const [clients, roles] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true }, orderBy: { companyName: "asc" }, select: { id: true, companyName: true } }),
    prisma.customRole.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true, baseSystemRole: true },
    }),
  ]);
  return {
    clients: clients.map((c) => ({ id: c.id, name: c.companyName })),
    roles: roles.map((r) => ({ id: r.id, name: r.name, description: r.description, forPortal: r.baseSystemRole === "CLIENT" })),
  };
}
