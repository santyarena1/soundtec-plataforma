"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import type { CategoryCountNode } from "@/lib/catalog-category-tree";
import { categoryIconFor } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

type Props = {
  nodes: CategoryCountNode[];
  activeId: string | null;
  basePath: string;
  /** Filtros actuales sin rubro ni página («brand=x&q=y»). */
  baseQuery: string;
  /** sidebar: panel fijo de PC; panel: desplegable de tablet y celular. */
  variant?: "sidebar" | "panel";
};

const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function hrefFor(basePath: string, baseQuery: string, categoryId: string | null): string {
  const params = new URLSearchParams(baseQuery);
  if (categoryId) params.set("category", categoryId);
  const query = params.toString();
  return query ? `${basePath}?${query}` : `${basePath}?all=1`;
}

/**
 * Árbol de rubros del catálogo: principales con ícono, subrubros con sangría y
 * línea guía, un solo rubro principal abierto a la vez y buscador. Se recorre
 * con el teclado (flechas, Enter, Inicio y Fin).
 */
export function CategoryTreeNav({ nodes, activeId, basePath, baseQuery, variant = "sidebar" }: Props) {
  const { byId, children } = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const children = new Map<string | null, CategoryCountNode[]>();
    for (const n of nodes) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
    return { byId, children };
  }, [nodes]);

  const pathIds = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    let current = activeId ? byId.get(activeId) : undefined;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      ids.unshift(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return ids;
  }, [activeId, byId]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(pathIds));
  const [query, setQuery] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: true, bottom: true });

  // Al cambiar de rubro se abre su camino (y se cierra el resto de los principales).
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set([...prev].filter((id) => byId.get(id)?.parentId != null));
      for (const id of pathIds) next.add(id);
      return next;
    });
  }, [pathIds, byId]);

  // El rubro elegido queda a la vista dentro del panel, sin mover la página.
  useEffect(() => {
    const box = scroller.current;
    const row = box?.querySelector<HTMLElement>("[aria-current='page']");
    if (!box || !row) return;
    const top = row.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - row.offsetHeight) {
      box.scrollTop = top - box.clientHeight / 3;
    }
  }, [activeId]);

  const updateEdges = () => {
    const box = scroller.current;
    if (!box) return;
    const top = box.scrollTop <= 2;
    const bottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 2;
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  };
  useEffect(() => {
    updateEdges();
    const box = scroller.current;
    if (!box) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Abrir o filtrar cambia el alto del árbol: se recalcula el difuminado.
  useEffect(updateEdges, [expanded, query, nodes]);

  // Búsqueda: los que coinciden y sus ancestros, todo abierto.
  const search = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return null;
    const visible = new Set<string>();
    for (const n of nodes) {
      if (!normalize(n.name).includes(q)) continue;
      let current: CategoryCountNode | undefined = n;
      while (current && !visible.has(current.id)) {
        visible.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
    }
    return { q, visible };
  }, [query, nodes, byId]);

  function toggle(id: string, open?: boolean) {
    setExpanded((prev) => {
      const willOpen = open ?? !prev.has(id);
      const next = new Set(prev);
      if (!willOpen) {
        next.delete(id);
        return next;
      }
      // Acordeón: un solo rubro principal abierto.
      if (byId.get(id)?.parentId == null) for (const other of prev) if (byId.get(other)?.parentId == null) next.delete(other);
      next.add(id);
      return next;
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-tree-row]"));
    const index = rows.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    const row = rows[index];
    const focus = (i: number) => rows[Math.max(0, Math.min(rows.length - 1, i))]?.focus();
    const id = row.dataset.nodeId!;
    const isOpen = row.getAttribute("aria-expanded") === "true";
    switch (event.key) {
      case "ArrowDown":
        focus(index + 1);
        break;
      case "ArrowUp":
        focus(index - 1);
        break;
      case "Home":
        focus(0);
        break;
      case "End":
        focus(rows.length - 1);
        break;
      case "ArrowRight":
        if (row.hasAttribute("aria-expanded") && !isOpen && !search) toggle(id, true);
        else focus(index + 1);
        break;
      case "ArrowLeft":
        if (isOpen && !search) toggle(id, false);
        else rows.find((r) => r.dataset.nodeId === row.dataset.parentId)?.focus();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  const renderLevel = (parentId: string | null, depth: number): React.ReactNode => {
    const list = (children.get(parentId) ?? []).filter((n) => !search || search.visible.has(n.id));
    if (list.length === 0) return null;
    return (
      <ul role={depth === 0 ? undefined : "group"} className={cn(depth > 0 && "ml-[17px] border-l border-border pl-2 motion-safe:animate-[tree-in_160ms_ease-out]")}>
        {list.map((node) => {
          const hasChildren = (children.get(node.id) ?? []).some((c) => !search || search.visible.has(c.id));
          const open = hasChildren && (search ? true : expanded.has(node.id));
          const active = node.id === activeId;
          const onPath = !active && pathIds.includes(node.id);
          const Icon = depth === 0 ? categoryIconFor(node.name) : null;
          return (
            <li key={node.id} className="mt-px">
              <div
                className={cn(
                  "group relative flex items-center rounded-md transition-colors",
                  active ? "bg-primary/[0.07] text-primary" : "text-foreground hover:bg-secondary"
                )}
              >
                {active ? <span aria-hidden="true" className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" /> : null}
                {hasChildren ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => toggle(node.id)}
                    aria-label={`${open ? "Cerrar" : "Abrir"} ${node.name}`}
                    className="flex h-8 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
                  </button>
                ) : (
                  <span className="w-6 shrink-0" aria-hidden="true" />
                )}
                <Link
                  href={hrefFor(basePath, baseQuery, node.id)}
                  data-tree-row=""
                  data-node-id={node.id}
                  data-parent-id={node.parentId ?? ""}
                  aria-current={active ? "page" : undefined}
                  aria-expanded={hasChildren ? open : undefined}
                  onClick={() => hasChildren && toggle(node.id, true)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pr-2 text-[13px] leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "font-semibold" : onPath ? "font-medium" : depth === 0 ? "" : "text-foreground/85"
                  )}
                >
                  {Icon ? <Icon aria-hidden="true" className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} /> : null}
                  <span className="min-w-0 flex-1 break-words">{node.name}</span>
                  <span className={cn("shrink-0 text-[11px] tabular-nums", active ? "text-primary/80" : "text-muted-foreground")}>
                    {node.count.toLocaleString("es-AR")}
                  </span>
                </Link>
              </div>
              {open ? renderLevel(node.id, depth + 1) : null}
            </li>
          );
        })}
      </ul>
    );
  };

  const fade = `linear-gradient(to bottom, ${edges.top ? "black" : "transparent"} 0, black 18px, black calc(100% - 18px), ${edges.bottom ? "black" : "transparent"} 100%)`;
  const tree = renderLevel(null, 0);

  return (
    <nav
      aria-label="Rubros"
      className={cn(
        "flex flex-col rounded-xl border border-border bg-card shadow-sm",
        variant === "sidebar" ? "max-h-[calc(100dvh-7rem)]" : "max-h-[70vh]"
      )}
    >
      <div className="space-y-2 border-b border-border p-3">
        <p className="text-sm font-semibold text-foreground">Rubros</p>
        <label className="relative block">
          <span className="sr-only">Filtrar rubros</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar rubros…"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>

      <div
        ref={scroller}
        onScroll={updateEdges}
        onKeyDown={onKeyDown}
        style={{ maskImage: fade, WebkitMaskImage: fade }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth p-1.5 [scrollbar-width:thin] motion-reduce:scroll-auto"
      >
        {!search ? (
          <Link
            href={hrefFor(basePath, baseQuery, null)}
            data-tree-row=""
            data-node-id=""
            aria-current={activeId ? undefined : "page"}
            className={cn(
              "relative flex items-center gap-2 rounded-md py-1.5 pl-2 pr-2 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              activeId ? "text-muted-foreground hover:bg-secondary hover:text-foreground" : "bg-primary/[0.07] font-semibold text-primary"
            )}
          >
            {!activeId ? <span aria-hidden="true" className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" /> : null}
            Todos los rubros
          </Link>
        ) : null}
        {tree ?? (
          <p className="px-2 py-3 text-[13px] text-muted-foreground">
            {query.trim() ? `No hay rubros con «${query.trim()}».` : "Ningún rubro tiene productos con estos filtros."}
          </p>
        )}
      </div>

      {activeId ? (
        <div className="border-t border-border p-1.5">
          <Link
            href={hrefFor(basePath, baseQuery, null)}
            className="flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Limpiar rubro
          </Link>
        </div>
      ) : null}
    </nav>
  );
}
