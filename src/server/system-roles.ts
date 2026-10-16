/**
 * Roles que el sistema necesita (ej. "Vendedor"). Idempotente: solo crea lo
 * que falta; si el rol ya existe (aunque lo hayan editado o renombrado) no lo
 * toca. Lo corre el build y también la pantalla de usuarios/roles.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SYSTEM_ROLES } from "@/lib/permissions";

export async function ensureSystemRoles(): Promise<string[]> {
  const created: string[] = [];
  for (const role of SYSTEM_ROLES) {
    const byKey = await prisma.customRole.findUnique({ where: { key: role.key }, select: { id: true } });
    if (byKey) continue;
    const byName = await prisma.customRole.findFirst({ where: { name: { equals: role.name, mode: "insensitive" } }, select: { id: true } });
    if (byName) {
      await prisma.customRole.update({ where: { id: byName.id }, data: { key: role.key } });
      continue;
    }
    await prisma.customRole.create({
      data: {
        key: role.key,
        name: role.name,
        description: role.description,
        baseSystemRole: "STAFF",
        permissionsJson: role.permissions as unknown as Prisma.InputJsonValue,
      },
    });
    created.push(role.name);
  }
  return created;
}
