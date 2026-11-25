import Link from "next/link";
import { AlertTriangle, ClipboardList, Inbox, Loader2, Send, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import { ACTIVITY_STATE_LABELS, ACTIVITY_TYPE_LABELS, type ActivityFilters, type ActivityItem, type ActivityState, type ActivityType } from "@/lib/mail-viewer/activity";
import { ViewerGetForm } from "./client-bits";

const TYPE_ICON: Record<ActivityType, typeof Send> = { system: Send, received: Inbox, bounce: Undo2, form: ClipboardList };
const STATE_TONE: Record<ActivityState, "success" | "destructive" | "warning" | "muted"> = { ok: "success", error: "destructive", pending: "warning", info: "muted" };
const RANGES = [7, 14, 30, 90];
const PAGE_SIZE = 100;

function href(filters: ActivityFilters, days: number, patch: Record<string, string | number | null>): string {
  const base: Record<string, string | number | null> = { vista: "actividad", tipo: filters.type, estado: filters.state, q: filters.q || null, dias: days === 14 ? null : days, pagina: null, ...patch };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v !== null && v !== "" && v !== undefined) params.set(k, String(v));
  return `/admin/correo?${params}`;
}

function Chip({ active, href: to, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link href={to} className={cn("rounded-full px-3 py-1 text-xs font-medium", active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
      {children}
    </Link>
  );
}

export function ActivityView({
  items,
  counts,
  filters,
  days,
  page,
  inboxError,
  truncated,
  inboxPending = false,
}: {
  items: ActivityItem[];
  counts: Record<ActivityType, number>;
  filters: ActivityFilters;
  days: number;
  page: number;
  inboxError: string | null;
  truncated: boolean;
  /** Lo de la casilla todavía no llegó: se muestra lo de la base y se avisa. */
  inboxPending?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-4">
      {inboxPending ? (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> Sumando lo recibido en la casilla (respuestas y rebotes)…
        </p>
      ) : null}
      {inboxError ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {inboxError} Se muestra lo que registró el sistema; faltan los mails recibidos y los rebotes.
          </span>
        </p>
      ) : null}

      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Qué:</span>
          <Chip active={!filters.type} href={href(filters, days, { tipo: null })}>
            Todo · {total}
          </Chip>
          {(Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[]).map((t) => (
            <Chip key={t} active={filters.type === t} href={href(filters, days, { tipo: t })}>
              {ACTIVITY_TYPE_LABELS[t]} · {counts[t]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Estado:</span>
          <Chip active={!filters.state} href={href(filters, days, { estado: null })}>
            Todos
          </Chip>
          {(Object.keys(ACTIVITY_STATE_LABELS) as ActivityState[]).map((s) => (
            <Chip key={s} active={filters.state === s} href={href(filters, days, { estado: s })}>
              {ACTIVITY_STATE_LABELS[s]}
            </Chip>
          ))}
          <span className="ml-3 mr-1 text-xs text-muted-foreground">Período:</span>
          {RANGES.map((d) => (
            <Chip key={d} active={days === d} href={href(filters, days, { dias: d === 14 ? null : d })}>
              {d} días
            </Chip>
          ))}
        </div>
        <ViewerGetForm action="/admin/correo" className="flex gap-2">
          <input type="hidden" name="vista" value="actividad" />
          {filters.type ? <input type="hidden" name="tipo" value={filters.type} /> : null}
          {filters.state ? <input type="hidden" name="estado" value={filters.state} /> : null}
          {days !== 14 ? <input type="hidden" name="dias" value={days} /> : null}
          <input name="q" defaultValue={filters.q} placeholder="Buscar por mail, asunto o formulario" className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary/60" />
        </ViewerGetForm>
      </div>

      {visible.length ? (
        <ol className="relative space-y-0 overflow-hidden rounded-lg border border-border bg-card">
          {visible.map((item) => {
            const Icon = TYPE_ICON[item.type];
            return (
              <li key={item.id} className="flex gap-3 border-b border-border/70 px-3 py-2.5 last:border-b-0">
                <span
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    item.state === "error" ? "bg-destructive/10 text-destructive" : item.type === "system" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium">{item.title}</span>
                    <Badge tone={STATE_TONE[item.state]} className="px-1.5 py-0 text-[10px]">
                      {ACTIVITY_STATE_LABELS[item.state]}
                    </Badge>
                    {item.meta ? <span className="text-[11px] text-muted-foreground">{item.meta}</span> : null}
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{formatDate(item.at)}</span>
                  </div>
                  {item.who ? <p className="truncate text-xs text-foreground/80">{item.who}</p> : null}
                  {item.detail ? <p className="line-clamp-2 break-words text-xs text-muted-foreground">{item.detail}</p> : null}
                  {item.href ? (
                    <Link href={item.href} className="mt-0.5 inline-block text-xs font-medium text-primary hover:underline">
                      {item.type === "form" ? "Ver formulario" : item.type === "system" ? "Buscar en Enviados" : "Abrir en la bandeja"}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">No hay movimientos con estos filtros en los últimos {days} días.</p>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {items.length.toLocaleString("es-AR")} movimientos{truncated ? " (se muestran los más recientes)" : ""}
        </span>
        {pages > 1 ? (
          <span className="flex gap-1">
            {current > 1 ? (
              <Link href={href(filters, days, { pagina: current - 1 })} className="rounded border border-border px-2 py-1 hover:bg-secondary">
                ← Más nuevos
              </Link>
            ) : null}
            <span className="px-2 py-1">
              Página {current} de {pages}
            </span>
            {current < pages ? (
              <Link href={href(filters, days, { pagina: current + 1 })} className="rounded border border-border px-2 py-1 hover:bg-secondary">
                Más viejos →
              </Link>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}
