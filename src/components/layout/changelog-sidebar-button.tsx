"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { CHANGELOG_SEEN_EVENT, unreadChangelogEntries } from "@/lib/changelog-seen";
import { displayChangelogVersion, latestChangelogVersion, type ChangelogEntryView } from "@/lib/changelog";

export function ChangelogSidebarButton({ entries }: { entries: ChangelogEntryView[] }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    function sync() {
      setUnreadCount(unreadChangelogEntries(entries).length);
    }
    sync();
    window.addEventListener(CHANGELOG_SEEN_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGELOG_SEEN_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [entries]);

  return (
    <Link
      href="/admin/changelog"
      className="mb-2 flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs font-semibold transition-colors hover:bg-secondary"
    >
      <span className="flex min-w-0 items-center gap-2">
        <ScrollText className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span>Changelog</span>
      </span>
      {unreadCount > 0 ? (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : (
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
          {displayChangelogVersion(latestChangelogVersion(entries))}
        </span>
      )}
    </Link>
  );
}
