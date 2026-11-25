import Link from "next/link";
import { AlertTriangle, Archive, FileText, Folder, Inbox, Paperclip, Send, ShieldAlert, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { listDate, shortAddress, viewerHref, type ViewerState } from "@/lib/mail-viewer/links";
import type { FolderInfo, MessagePage } from "@/lib/mail-viewer/types";

/** Pestañas del visor: Bandeja | Actividad. */
export function ViewerTabs({ active }: { active: "bandeja" | "actividad" }) {
  const tabs = [
    { key: "bandeja", href: "/admin/correo", label: "Bandeja" },
    { key: "actividad", href: "/admin/correo?vista=actividad", label: "Actividad" },
  ] as const;
  return (
    <nav aria-label="Correo del portal" className="flex gap-1 border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab.key === active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

const FOLDER_ICONS: Record<string, typeof Inbox> = {
  "\\Inbox": Inbox,
  "\\Sent": Send,
  "\\Drafts": FileText,
  "\\Junk": ShieldAlert,
  "\\Trash": Trash2,
  "\\Archive": Archive,
};

export function FolderNav({ folders, state }: { folders: FolderInfo[]; state: ViewerState }) {
  return (
    <nav aria-label="Carpetas" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {folders.map((f) => {
        const Icon = (f.specialUse && FOLDER_ICONS[f.specialUse]) || Folder;
        const active = f.path === state.folder;
        return (
          <Link
            key={f.path}
            href={viewerHref(state, { folder: f.path, page: 1, uid: null, filters: { q: "", from: null, to: null, unread: false } })}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              active ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
            title={f.path}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{f.label}</span>
            <span className="ml-auto pl-2 text-xs tabular-nums">
              {f.unseen ? <b className="text-foreground">{f.unseen}</b> : null}
              {f.unseen && f.total ? <span className="text-muted-foreground"> / </span> : null}
              {f.total ?? ""}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SearchBar({ state }: { state: ViewerState }) {
  const f = state.filters;
  return (
    <form action="/admin/correo" className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-2.5">
      <input type="hidden" name="carpeta" value={state.folder} />
      <label className="min-w-[180px] flex-1">
        <span className="sr-only">Buscar</span>
        <input name="q" defaultValue={f.q} placeholder="Buscar en la carpeta…" className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary/60" />
      </label>
      <label className="text-xs text-muted-foreground">
        <span className="sr-only">Dónde</span>
        <select name="campo" defaultValue={f.field} className="h-9 rounded-md border border-border bg-white px-2 text-sm text-foreground">
          <option value="all">De, para o asunto</option>
          <option value="from">De</option>
          <option value="to">Para</option>
          <option value="subject">Asunto</option>
          <option value="text">Todo el texto (más lento)</option>
        </select>
      </label>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        Desde
        <input type="date" name="desde" defaultValue={f.from ?? ""} className="h-9 rounded-md border border-border bg-white px-2 text-sm text-foreground" />
      </label>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        Hasta
        <input type="date" name="hasta" defaultValue={f.to ?? ""} className="h-9 rounded-md border border-border bg-white px-2 text-sm text-foreground" />
      </label>
      <label className="flex h-9 items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" name="noLeidos" value="1" defaultChecked={f.unread} className="h-4 w-4" />
        Sin leer
      </label>
      <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        Buscar
      </button>
      {f.q || f.from || f.to || f.unread ? (
        <Link href={viewerHref(state, { page: 1, uid: null, filters: { q: "", from: null, to: null, unread: false, field: "all" } })} className="h-9 px-2 text-sm leading-9 text-muted-foreground underline">
          Limpiar
        </Link>
      ) : null}
    </form>
  );
}

export function MessageList({ page, state, sentFolder }: { page: MessagePage; state: ViewerState; sentFolder: boolean }) {
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  if (!page.messages.length) {
    return <p className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">No hay mensajes {state.filters.q || state.filters.from || state.filters.to || state.filters.unread ? "con esa búsqueda" : "en esta carpeta"}.</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <ul className="divide-y divide-border">
        {page.messages.map((m) => {
          const active = state.uid === m.uid;
          const who = sentFolder ? `Para: ${m.to.map((t) => t.name || t.address).join(", ") || "—"}` : shortAddress(m.from);
          return (
            <li key={m.uid}>
              <Link
                href={viewerHref(state, { uid: m.uid })}
                className={cn("block px-3 py-2.5 transition-colors hover:bg-secondary/60", active && "bg-primary/5 ring-1 ring-inset ring-primary/30")}
                aria-current={active ? "true" : undefined}
              >
                <div className="flex items-center gap-2">
                  {!m.seen ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Sin leer" /> : null}
                  <span className={cn("truncate text-sm", !m.seen ? "font-semibold text-foreground" : "text-foreground/90")}>{who}</span>
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{listDate(m.date)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {m.isBounce ? (
                    <Badge tone="destructive" className="shrink-0 px-1.5 py-0 text-[10px]">
                      <AlertTriangle className="h-3 w-3" /> Rebote
                    </Badge>
                  ) : null}
                  <span className={cn("truncate text-[13px]", !m.seen ? "font-medium" : "text-muted-foreground")}>{m.subject || "(sin asunto)"}</span>
                  {m.hasAttachments ? <Paperclip className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Con adjuntos" /> : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {((page.page - 1) * page.pageSize + 1).toLocaleString("es-AR")}–{Math.min(page.page * page.pageSize, page.total).toLocaleString("es-AR")} de {page.total.toLocaleString("es-AR")}
        </span>
        <span className="flex gap-1">
          {page.page > 1 ? (
            <Link href={viewerHref(state, { page: page.page - 1, uid: null })} className="rounded border border-border px-2 py-1 hover:bg-secondary">
              ← Más nuevos
            </Link>
          ) : null}
          {page.page < pages ? (
            <Link href={viewerHref(state, { page: page.page + 1, uid: null })} className="rounded border border-border px-2 py-1 hover:bg-secondary">
              Más viejos →
            </Link>
          ) : null}
        </span>
      </div>
    </div>
  );
}
