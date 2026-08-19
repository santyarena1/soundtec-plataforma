import { SHIPPED_ADMIN_CHANGELOG } from "@/data/admin-changelog";
import { prisma } from "@/lib/prisma";
import { toChangelogView, type ChangelogEntryView } from "@/lib/changelog";
import { syncShippedChangelog } from "@/server/changelog-sync";

let syncOnce: Promise<void> | null = null;

function shippedViews(): ChangelogEntryView[] {
  return [...SHIPPED_ADMIN_CHANGELOG]
    .slice()
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt))
    .map((entry) =>
      toChangelogView({
        id: entry.id,
        version: entry.version,
        releasedAt: new Date(entry.releasedAt),
        summary: entry.summary,
        isPublished: true,
        items: entry.items,
      })
    );
}

export async function ensureShippedChangelog() {
  if (!syncOnce) {
    syncOnce = syncShippedChangelog()
      .then(() => undefined)
      .catch((err) => {
        console.error("changelog sync", err);
        syncOnce = null;
      });
  }
  await syncOnce;
}

export async function listAllChangelogs(): Promise<ChangelogEntryView[]> {
  await ensureShippedChangelog();
  return shippedViews();
}

export async function getUnreadChangelogsForUser(userId: string): Promise<ChangelogEntryView[]> {
  if (!userId) return [];
  await ensureShippedChangelog();
  const published = shippedViews();
  try {
    const read = await prisma.adminChangelogRead.findMany({
      where: { userId },
      select: { changelogId: true },
    });
    const seen = new Set(read.map((row) => row.changelogId));
    return published.filter((row) => !seen.has(row.id));
  } catch {
    return published;
  }
}
