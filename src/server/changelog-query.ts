import { prisma } from "@/lib/prisma";
import { toChangelogView, type ChangelogEntryView } from "@/lib/changelog";
import { syncShippedChangelog } from "@/server/changelog-sync";

export async function ensureShippedChangelog() {
  try {
    await syncShippedChangelog();
  } catch {
    // Tabla todavía no existe, o la DB no está lista.
  }
}

export async function listAllChangelogs(): Promise<ChangelogEntryView[]> {
  await ensureShippedChangelog();
  const rows = await prisma.adminChangelog.findMany({
    orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toChangelogView);
}

export async function getUnreadChangelogsForUser(userId: string): Promise<ChangelogEntryView[]> {
  if (!userId) return [];
  await ensureShippedChangelog();
  try {
    const read = await prisma.adminChangelogRead.findMany({
      where: { userId },
      select: { changelogId: true },
    });
    const seen = new Set(read.map((row) => row.changelogId));
    const rows = await prisma.adminChangelog.findMany({
      where: { isPublished: true },
      orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.filter((row) => !seen.has(row.id)).map(toChangelogView);
  } catch {
    return [];
  }
}
