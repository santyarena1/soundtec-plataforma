import { prisma } from "../src/lib/prisma";
import { syncShippedChangelog } from "../src/server/changelog-sync";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn("changelog: sin DATABASE_URL, se omite la sync");
    return;
  }
  const count = await syncShippedChangelog();
  console.log(`changelog: ${count} novedades publicadas`);
}

main()
  .catch((err) => {
    console.warn("changelog: no se pudo sincronizar (el build sigue)", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
