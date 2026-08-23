import {
  CHANGELOG_KIND_STYLE,
  displayChangelogVersion,
  formatChangelogDate,
  type ChangelogEntryView,
} from "@/lib/changelog";
import { cn } from "@/lib/utils";

export function ChangelogTimeline({
  entries,
  empty = "Todavía no hay novedades publicadas.",
}: {
  entries: ChangelogEntryView[];
  empty?: string;
}) {
  const newestFirst = [...entries].sort(
    (a, b) => new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime()
  );
  if (newestFirst.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {newestFirst.map((entry) => (
        <li key={entry.id} className="relative">
          <span className="absolute -left-[26px] top-4 h-3 w-3 rounded-full border-2 border-primary bg-card" />
          <article className="rounded-lg border border-border bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                {displayChangelogVersion(entry.version)}
              </span>
              <span className="text-xs text-muted-foreground">{formatChangelogDate(entry.releasedAt)}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-foreground">
              <span className="font-semibold">En pocas palabras:</span> {entry.summary}
            </p>
            <ul className="mt-3 space-y-2">
              {entry.items.map((item, index) => {
                const style = CHANGELOG_KIND_STYLE[item.kind];
                return (
                  <li key={`${entry.id}-${index}`} className="flex items-start gap-2 text-sm leading-5">
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide",
                        style.className
                      )}
                    >
                      {style.label}
                    </span>
                    <span>{item.text}</span>
                  </li>
                );
              })}
            </ul>
          </article>
        </li>
      ))}
    </ol>
  );
}
