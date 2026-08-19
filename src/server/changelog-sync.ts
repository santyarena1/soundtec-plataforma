import { prisma } from "@/lib/prisma";
import { SHIPPED_ADMIN_CHANGELOG } from "@/data/admin-changelog";

/** Publica en la DB solo lo que está en el repo. Borra cualquier entrada cargada a mano. */
export async function syncShippedChangelog(): Promise<number> {
  const ids: string[] = [];
  for (const entry of SHIPPED_ADMIN_CHANGELOG) {
    const releasedAt = new Date(entry.releasedAt);
    if (!Number.isFinite(releasedAt.getTime())) continue;
    ids.push(entry.id);
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
  }
  if (ids.length > 0) {
    await prisma.adminChangelog.deleteMany({ where: { id: { notIn: ids } } });
  }
  return ids.length;
}
