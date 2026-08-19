import { prisma } from "@/lib/prisma";
import { SHIPPED_ADMIN_CHANGELOG } from "@/data/admin-changelog";

/** Publica en la DB las novedades declaradas en el repo. Corre en el build y al abrir el admin. */
export async function syncShippedChangelog(): Promise<number> {
  let count = 0;
  for (const entry of SHIPPED_ADMIN_CHANGELOG) {
    const releasedAt = new Date(entry.releasedAt);
    if (!Number.isFinite(releasedAt.getTime())) continue;
    await prisma.adminChangelog.upsert({
      where: { id: entry.id },
      create: {
        id: entry.id,
        version: entry.version,
        releasedAt,
        summary: entry.summary,
        items: entry.items,
        isPublished: true,
      },
      update: {
        version: entry.version,
        releasedAt,
        summary: entry.summary,
        items: entry.items,
        isPublished: true,
      },
    });
    count += 1;
  }
  return count;
}
