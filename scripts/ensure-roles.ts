/** Crea los roles del sistema que falten (ej. "Vendedor"). Corre en cada build. */
import { prisma } from "../src/lib/prisma";
import { ensureSystemRoles } from "../src/server/system-roles";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn("roles: sin DATABASE_URL, se omite");
    return;
  }
  const created = await ensureSystemRoles();
  for (const name of created) console.log(`roles: creado «${name}»`);
}

main()
  .catch((err) => {
    console.warn("roles: no se pudieron asegurar (el build sigue)", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
