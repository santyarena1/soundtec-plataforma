import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { prioritizeInbox, type InboxSeverity } from "@/lib/dashboard/inbox";
import { loadInbox } from "@/server/dashboard/inbox";
import type { DashboardViewer } from "@/server/dashboard/viewer";
import { BlockError, Count } from "./ui";

const RAIL: Record<InboxSeverity, string> = {
  urgent: "bg-destructive",
  high: "bg-warning",
  normal: "bg-accent",
  low: "bg-border",
};

const TAG: Record<InboxSeverity, { label: string; className: string } | null> = {
  urgent: { label: "Urgente", className: "bg-destructive/10 text-destructive" },
  high: { label: "Hoy", className: "bg-warning/10 text-warning" },
  normal: null,
  low: null,
};

/** «Para hacer hoy»: lo pendiente de todos los módulos, en una sola lista y por urgencia. */
export async function InboxBlock({ viewer, className }: { viewer: DashboardViewer; className?: string }) {
  let items: Awaited<ReturnType<typeof loadInbox>>;
  try {
    items = await loadInbox(viewer);
  } catch (error) {
    console.error("[dashboard] bandeja", error);
    return <BlockError title="Para hacer hoy" className={className} />;
  }
  const now = new Date();
  const list = prioritizeInbox(items, now);
  const total = list.reduce((s, i) => s + i.count, 0);

  return (
    <section className={cn("flex min-w-0 flex-col overflow-hidden rounded-lg border border-primary/20 bg-card shadow-card", className)} data-tour="dash-inbox">
      <header className="flex items-end justify-between gap-4 bg-primary px-5 py-4 text-primary-foreground">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-foreground/70">Bandeja</p>
          <h2 className="text-lg font-semibold leading-tight">Para hacer hoy</h2>
        </div>
        {list.length ? (
          <p className="text-right text-xs text-primary-foreground/80">
            <span className="block text-2xl font-semibold leading-none text-primary-foreground tabular-nums">{total.toLocaleString("es-AR")}</span>
            {list.length === 1 ? "pendiente" : `pendientes en ${list.length} temas`}
          </p>
        ) : null}
      </header>

      {list.length === 0 ? (
        <div className="flex flex-1 items-center gap-3 px-5 py-8">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-success" />
          <div>
            <p className="font-medium">Nada pendiente.</p>
            <p className="text-sm text-muted-foreground">Cuando entre una solicitud, venza una cotización o falle una sincronización, aparece acá.</p>
          </div>
        </div>
      ) : (
        <ol className="divide-y divide-border">
          {list.map((item) => {
            const tag = TAG[item.severity];
            return (
              <li key={item.key} className="relative flex gap-4 py-3.5 pl-5 pr-4">
                <span aria-hidden className={cn("absolute inset-y-3 left-0 w-1 rounded-r", RAIL[item.severity])} />
                <span className="w-10 shrink-0 pt-0.5 text-right text-xl font-semibold leading-none tabular-nums text-foreground">
                  <Count value={item.count} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-medium leading-snug">{item.title}</p>
                    {tag ? <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", tag.className)}>{tag.label}</span> : null}
                  </div>
                  {item.detail ? <p className="mt-0.5 text-sm text-muted-foreground">{item.detail}</p> : null}
                  {item.entries?.length ? (
                    <ul className="mt-2 space-y-1">
                      {item.entries.map((e) => (
                        <li key={e.href + e.label} className="min-w-0">
                          <Link href={e.href} className="group flex min-w-0 items-baseline gap-2 text-sm hover:text-accent">
                            <span className="truncate font-medium group-hover:underline">{e.label}</span>
                            {e.note ? <span className="shrink-0 text-xs text-muted-foreground">{e.note}</span> : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <Link
                  href={item.href}
                  className="inline-flex h-8 shrink-0 items-center gap-1 self-start rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="hidden sm:inline">{item.actionLabel}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                  <span className="sr-only sm:hidden">{item.actionLabel}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
