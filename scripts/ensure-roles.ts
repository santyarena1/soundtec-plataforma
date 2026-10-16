/**
 * Roles que el sistema necesita (ej. "Vendedor"). Idempotente: corre en cada
 * build y solo crea lo que falta; si el rol ya existe (aunque lo hayan
 * editado o renombrado) no lo toca, así los cambios del admin se respetan.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { SYSTEM_ROLES } from "../src/lib/permissions";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn("roles: sin DATABASE_URL, se omite");
    return;
  }
  for (const role of SYSTEM_ROLES) {
    const byKey = await prisma.customRole.findUnique({ where: { key: role.key }, select: { id: true } });
    if (byKey) continue;
    // Si ya había un rol con ese nombre (creado a mano), se lo adopta sin cambiarle permisos.
    const byName = await prisma.customRole.findFirst({ where: { name: { equals: role.name, mode: "insensitive" } }, select: { id: true } });
    if (byName) {
      await prisma.customRole.update({ where: { id: byName.id }, data: { key: role.key } });
      console.log(`roles: «${role.name}» ya existía, queda como rol del sistema`);
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
    console.log(`roles: creado «${role.name}»`);
  }
}

main()
  .catch((err) => {
    console.warn("roles: no se pudieron asegurar (el build sigue)", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
