import Link from "next/link";
import { ScrollText } from "lucide-react";

export function ChangelogSidebarButton({ unreadCount = 0 }: { unreadCount?: number }) {
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
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Novedades</span>
      )}
    </Link>
  );
}
