"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, EyeOff, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RubroPicker } from "@/components/admin/rubro-picker";
import type { CategoryNode } from "@/lib/category-tree";
import { cn } from "@/lib/utils";
import { createSubrubroAction } from "@/server/actions/rubros";
import {
  deactivateRubroAction,
  getRubroDetailAction,
  mergeRubroAction,
  moveRubroProductsAction,
  renameRubroAction,
  setRubroHiddenAction,
  type RubroDetail,
} from "@/server/actions/rubros-admin";

export interface RubroTreeNode extends CategoryNode {
  hidden: boolean;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-AR");

/** Árbol de rubros de Tango con conteos y el panel de acciones del nodo elegido. */
export function RubrosTree({ nodes }: { nodes: RubroTreeNode[] }) {
  const [onlyWithProducts, setOnlyWithProducts] = useState(true);
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const children = useMemo(() => {
    const map = new Map<string | null, RubroTreeNode[]>();
    for (const n of nodes) map.set(n.parentId, [...(map.get(n.parentId) ?? []), n]);
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, "es"));
    return map;
  }, [nodes]);
  const totals = useMemo(() => {
    const out = new Map<string, number>();
    const visit = (n: RubroTreeNode): number => {
      const hit = out.get(n.id);
      if (hit != null) return hit;
      const sum = (n.count ?? 0) + (children.get(n.id) ?? []).reduce((acc, c) => acc + visit(c), 0);
      out.set(n.id, sum);
      return sum;
    };
    nodes.forEach(visit);
    return out;
  }, [nodes, children]);
  const ancestors = (id: string) => {
    const out: string[] = [];
    let current = byId.get(id);
    while (current?.parentId) {
      out.push(current.parentId);
      current = byId.get(current.parentId);
    }
    return out;
  };
  const hiddenEffective = (id: string) => byId.get(id)?.hidden || ancestors(id).some((a) => byId.get(a)?.hidden);
  const pathOf = (id: string) => [...ancestors(id).reverse(), id].map((x) => byId.get(x)?.name ?? "").join(" › ");

  const { visible, autoOpen } = useMemo(() => {
    const q = fold(query.trim());
    const keep = new Set<string>();
    const open = new Set<string>();
    const filtering = q.length >= 2 || onlyHidden || onlyPending;
    for (const n of nodes) {
      if (onlyWithProducts && !(totals.get(n.id) ?? 0) && !n.pendingTango) continue;
      let match = true;
      if (q.length >= 2) match = fold(pathOf(n.id)).includes(q);
      if (match && onlyHidden) match = Boolean(n.hidden);
      if (match && onlyPending) match = Boolean(n.pendingTango);
      if (!match) continue;
      keep.add(n.id);
      for (const a of ancestors(n.id)) {
        keep.add(a);
        if (filtering) open.add(a);
      }
    }
    return { visible: keep, autoOpen: open };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, query, onlyWithProducts, onlyHidden, onlyPending, totals]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function renderLevel(parentId: string | null, depth: number) {
    const list = (children.get(parentId) ?? []).filter((n) => visible.has(n.id));
    if (!list.length) return null;
    return (
      <ul className={cn(depth > 0 && "ml-4 border-l border-border pl-2")}>
        {list.map((n) => {
          const kids = (children.get(n.id) ?? []).some((c) => visible.has(c.id));
          const isOpen = expanded.has(n.id) || autoOpen.has(n.id);
          return (
            <li key={n.id}>
              <div
                className={cn(
                  "flex items-center gap-1 rounded px-1 py-0.5 text-sm",
                  selectedId === n.id ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-secondary/60"
                )}
              >
                {kids ? (
                  <button type="button" onClick={() => toggle(n.id)} aria-label={isOpen ? `Cerrar ${n.name}` : `Abrir ${n.name}`} className="p-0.5 text-muted-foreground">
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")} />
                  </button>
                ) : (
                  <span className="w-4.5 inline-block" style={{ width: 18 }} />
                )}
                <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setSelectedId(n.id)}>
                  {n.name}
                </button>
                {hiddenEffective(n.id) ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-label="Oculto a clientes" /> : null}
                {n.pendingTango ? <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-900">pendiente en Tango</span> : null}
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground" title="Productos activos (con los de abajo)">
                  {(totals.get(n.id) ?? 0).toLocaleString("es-AR")}
                </span>
              </div>
              {kids && isOpen ? renderLevel(n.id, depth + 1) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Árbol de rubros">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar rubro (ej. embutir, keypad, HDMI)" className="pl-7" aria-label="Buscar rubro" />
          </div>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={onlyWithProducts} onChange={(e) => setOnlyWithProducts(e.target.checked)} /> Solo con productos
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={onlyHidden} onChange={(e) => setOnlyHidden(e.target.checked)} /> Ocultos a clientes
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Pendientes en Tango
          </label>
        </div>
        <div className="max-h-[70vh] overflow-auto pr-1">{renderLevel(null, 0) ?? <p className="text-sm text-muted-foreground">No hay rubros con ese filtro.</p>}</div>
      </section>
      <NodePanel key={selectedId ?? "none"} id={selectedId} nodes={nodes} />
    </div>
  );
}

function NodePanel({ id, nodes }: { id: string | null; nodes: CategoryNode[] }) {
  const router = useRouter();
  const [detail, setDetail] = useState<RubroDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [renameTo, setRenameTo] = useState("");
  const [target, setTarget] = useState("");
  const [childName, setChildName] = useState("");

  useEffect(() => {
    if (!id) return;
    let alive = true;
    getRubroDetailAction(id).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setDetail(r.detail);
        setRenameTo(r.detail.path.split(" › ").pop() ?? "");
      } else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (!id) {
    return (
      <aside className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        Elegí un rubro del árbol para ver sus productos y las acciones: renombrar, mover productos, unir con otro, ocultar a clientes, crear subrubro o desactivar.
      </aside>
    );
  }
  if (error) return <aside className="rounded-lg border border-border p-4 text-sm text-destructive">{error}</aside>;
  if (!detail) {
    return (
      <aside className="flex items-center gap-2 rounded-lg border border-border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
      </aside>
    );
  }

  function run(task: () => Promise<{ ok: boolean; error?: string; message?: string; reviewId?: string; applied?: boolean }>, okText: string) {
    start(async () => {
      const r = await task();
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo.");
        return;
      }
      if (r.reviewId && r.applied === false) {
        toast.warning(r.message ?? "Quedó en Revisión de cambios.", {
          duration: 12000,
          action: { label: "Ver revisión", onClick: () => router.push(`/admin/price-reviews/${r.reviewId}`) },
        });
      } else toast.success(r.message ?? okText);
      router.refresh();
      if (id) {
        const fresh = await getRubroDetailAction(id);
        if (fresh.ok) setDetail(fresh.detail);
      }
    });
  }

  const canCreate = detail.level < 4;
  return (
    <aside className="space-y-4 rounded-lg border border-border bg-card p-4 text-sm lg:sticky lg:top-4 lg:self-start" aria-label="Rubro elegido">
      <div>
        <p className="text-xs text-muted-foreground">Nivel {detail.level}</p>
        <h2 className="font-semibold leading-snug">{detail.path}</h2>
        <p className="mt-1 text-muted-foreground">
          {detail.own} producto{detail.own === 1 ? "" : "s"} propio{detail.own === 1 ? "" : "s"} · {detail.total} con los de abajo
          {detail.rules ? ` · ${detail.rules} regla${detail.rules === 1 ? "" : "s"} de precio sobre este rubro` : ""}
        </p>
        {detail.pendingTango ? (
          <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
            Pendiente de cargar en Tango{detail.createdInAppBy ? ` (lo creó o cambió ${detail.createdInAppBy})` : ""}.
          </p>
        ) : null}
        {detail.brands.length ? (
          <p className="mt-1 text-xs text-muted-foreground">Marcas: {detail.brands.map((b) => `${b.name} (${b.count})`).join(" · ")}</p>
        ) : null}
        <Link href={`/admin/products?category=${detail.id}`} className="mt-1 inline-block text-xs text-primary hover:underline">
          Ver productos en el catálogo →
        </Link>
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={detail.hidden}
            disabled={busy}
            onChange={(e) => run(() => setRubroHiddenAction(detail.id, e.target.checked), e.target.checked ? "Oculto a clientes." : "Visible para clientes.")}
          />
          Ocultar a clientes (portal y catálogo público, con todo lo que cuelga)
        </label>
        {detail.inheritedHidden ? <p className="text-xs text-muted-foreground">Ya está oculto porque un rubro de más arriba lo está.</p> : null}
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <p className="font-medium">Renombrar</p>
        <div className="flex gap-2">
          <Input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} aria-label="Nombre nuevo" />
          <Button size="sm" variant="outline" disabled={busy || renameTo.trim().length < 2} onClick={() => run(() => renameRubroAction(detail.id, renameTo), "Renombrado.")}>
            Guardar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Cambia la ruta de este rubro y de sus subrubros. Queda en «Pendientes en Tango» para cambiarlo también allá.</p>
      </div>

      {canCreate ? (
        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="font-medium">Crear subrubro acá</p>
          <div className="flex gap-2">
            <Input value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="Nombre como en Tango" aria-label="Nombre del subrubro" />
            <Button
              size="sm"
              variant="outline"
              disabled={busy || childName.trim().length < 2}
              onClick={() =>
                run(async () => {
                  const r = await createSubrubroAction(detail.id, childName);
                  if (r.ok) setChildName("");
                  return r.ok ? { ok: true, message: `Se creó «${r.node.name}». Queda pendiente de cargar en Tango.` } : r;
                }, "Creado.")
              }
            >
              Crear
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5 border-t border-border pt-3">
        <p className="font-medium">Mover productos o unir con otro rubro</p>
        <RubroPicker nodes={nodes.filter((n) => n.id !== detail.id)} allowEmpty={false} onChange={setTarget} placeholder="Elegir el rubro destino…" />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !target || detail.own === 0}
            onClick={() => run(() => moveRubroProductsAction(detail.id, target), "Movidos.")}
          >
            Mover sus {detail.own} productos
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !target || detail.activeChildren > 0}
            onClick={() => {
              if (window.confirm("¿Unir? Sus productos pasan al rubro elegido y este queda desactivado.")) run(() => mergeRubroAction(detail.id, target), "Unidos.");
            }}
          >
            Unir con el elegido
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {detail.activeChildren > 0
            ? "Para unirlo, primero uní o desactivá sus subrubros."
            : "Si hay reglas de precio por rubro y el cambio mueve precios, queda en Precios › Revisión de cambios."}
        </p>
      </div>

      <div className="border-t border-border pt-3">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || detail.total > 0 || detail.activeChildren > 0}
          onClick={() => {
            if (window.confirm("¿Desactivar este rubro? Deja de aparecer en los selectores.")) run(() => deactivateRubroAction(detail.id), "Desactivado.");
          }}
        >
          Desactivar rubro
        </Button>
        {detail.total > 0 || detail.activeChildren > 0 ? <p className="text-xs text-muted-foreground">Solo se puede desactivar vacío: mové antes sus productos.</p> : null}
      </div>
    </aside>
  );
}
