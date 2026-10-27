"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { CategoryTreePicker } from "@/components/admin/category-tree-picker";
import type { CategoryNode } from "@/lib/category-tree";
import {
  approveAllHighAction,
  approveProposalsAction,
  approveWithCategoryAction,
  loadTangoProposalsAction,
  rejectProposalsAction,
  undoProposalAction,
} from "@/server/actions/category-proposals";

export type ProposalRow = {
  id: string;
  productId: string;
  model: string;
  sku: string | null;
  brand: string | null;
  description: string | null;
  current: string | null;
  proposed: string;
  applied: string | null;
  confidence: "alta" | "media" | "baja";
  note: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  previous: string | null;
};

type Filters = { estado: string; conf: string; rubro: string; marca: string; q: string; page: number };
type Stats = { total: number; pending: number; pendingHigh: number; pendingMedium: number; pendingLow: number; approved: number; rejected: number };

const CONF_LABEL = { alta: "Segura", media: "Con dudas", baja: "No se sabe qué es" } as const;
const CONF_TONE = { alta: "success", media: "warning", baja: "destructive" } as const;

export function ProposalsBoard({
  loaded,
  stats,
  filters,
  rubros,
  brands,
  rows,
  matching,
  pageSize,
  nodes,
}: {
  loaded: boolean;
  stats: Stats;
  filters: Filters;
  rubros: Array<{ value: string; label: string }>;
  brands: string[];
  rows: ProposalRow[];
  matching: number;
  pageSize: number;
  nodes: CategoryNode[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [pickedCategory, setPickedCategory] = useState<string>("");
  const pendingRows = rows.filter((r) => r.status === "PENDING");

  const href = (patch: Partial<Filters>) => {
    const next = { ...filters, page: 1, ...patch };
    const sp = new URLSearchParams();
    if (next.estado !== "pendientes") sp.set("estado", next.estado);
    if (next.conf) sp.set("conf", next.conf);
    if (next.rubro) sp.set("rubro", next.rubro);
    if (next.marca) sp.set("marca", next.marca);
    if (next.q) sp.set("q", next.q);
    if (next.page > 1) sp.set("pagina", String(next.page));
    const s = sp.toString();
    return `/admin/products/reclasificacion${s ? `?${s}` : ""}`;
  };

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    start(async () => {
      const r = await action();
      if (!r.ok) return void toast.error(r.error || "No se pudo hacer.");
      toast.success(r.message || "Listo.");
      setSelected(new Set());
      setEditing(null);
      router.refresh();
    });
  }

  async function applyAllHigh() {
    const ok = await confirmDialog({
      title: "Aplicar las de confianza alta",
      message: `${stats.pendingHigh.toLocaleString("es-AR")} productos pasan a su rubro de Tango. Se puede deshacer de a uno desde «Aprobadas». No cambia ningún precio.`,
      confirmLabel: "Aplicar",
    });
    if (ok) run(() => approveAllHighAction());
  }

  const allSelected = pendingRows.length > 0 && pendingRows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(pendingRows.map((r) => r.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pages = Math.max(1, Math.ceil(matching / pageSize));
  const tabs = useMemo(
    () => [
      { key: "pendientes", label: "Pendientes", n: stats.pending },
      { key: "aprobadas", label: "Aprobadas", n: stats.approved },
      { key: "rechazadas", label: "Rechazadas", n: stats.rejected },
    ],
    [stats],
  );

  if (!loaded) {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-card p-6">
        <p className="font-medium">Todavía no están cargadas las propuestas.</p>
        <p className="text-sm text-muted-foreground">
          Carga el árbol de rubros de Tango (2.101 rubros, incluida la rama nueva «Bafles exterior») y una propuesta de rubro para cada producto. No mueve ningún producto: eso pasa cuando aprobás.
        </p>
        <Button type="button" onClick={() => run(() => loadTangoProposalsAction())} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Cargando… (puede tardar un minuto)" : "Cargar el árbol y las propuestas"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
          <span><b className="text-base">{stats.pending.toLocaleString("es-AR")}</b> pendientes</span>
          <span className="text-muted-foreground">{stats.pendingHigh.toLocaleString("es-AR")} seguras · {stats.pendingMedium.toLocaleString("es-AR")} con dudas · {stats.pendingLow} sin saber qué es</span>
          <span className="text-muted-foreground">{stats.approved.toLocaleString("es-AR")} aprobadas · {stats.rejected.toLocaleString("es-AR")} rechazadas</span>
        </div>
        <Button type="button" onClick={() => void applyAllHigh()} disabled={pending || stats.pendingHigh === 0}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Aplicar todas las de confianza alta ({stats.pendingHigh.toLocaleString("es-AR")})
        </Button>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Estado">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={href({ estado: t.key })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${filters.estado === t.key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label} <span className="tabular-nums text-muted-foreground">{t.n.toLocaleString("es-AR")}</span>
          </Link>
        ))}
      </nav>

      <form method="get" className="flex flex-wrap items-end gap-2" action="/admin/products/reclasificacion">
        {filters.estado !== "pendientes" ? <input type="hidden" name="estado" value={filters.estado} /> : null}
        <Input name="q" defaultValue={filters.q} placeholder="Modelo o código" aria-label="Buscar" className="w-56" />
        <Select name="conf" defaultValue={filters.conf} aria-label="Confianza" className="w-44">
          <option value="">Cualquier confianza</option>
          <option value="alta">Seguras</option>
          <option value="media">Con dudas</option>
          <option value="baja">Sin saber qué es</option>
        </Select>
        <Select name="rubro" defaultValue={filters.rubro} aria-label="Rubro" className="w-48">
          <option value="">Todos los rubros</option>
          {rubros.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </Select>
        <Select name="marca" defaultValue={filters.marca} aria-label="Marca" className="w-48">
          <option value="">Todas las marcas</option>
          {brands.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </Select>
        <Button type="submit" variant="outline" size="sm">Filtrar</Button>
        <Link href="/admin/products/reclasificacion" className="px-2 py-1.5 text-sm text-muted-foreground hover:underline">Limpiar</Link>
      </form>

      {filters.estado === "pendientes" && pendingRows.length ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} /> Elegir las {pendingRows.length} de esta página
          </label>
          {selected.size ? (
            <>
              <Button type="button" size="sm" disabled={pending} onClick={() => run(() => approveProposalsAction({ ids: [...selected] }))}>
                Aprobar {selected.size}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => rejectProposalsAction({ ids: [...selected] }))}>
                Rechazar {selected.size}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground tabular-nums">{matching.toLocaleString("es-AR")} productos con estos filtros</p>

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
            <div className="pt-1">
              {r.status === "PENDING" ? <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Elegir ${r.model}`} /> : null}
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {r.brand || "Sin marca"}{r.sku ? ` · ${r.sku}` : ""}
              </p>
              <Link href={`/admin/products/${r.productId}`} className="font-mono text-sm font-medium hover:underline">{r.model}</Link>
              {r.description ? <p className="text-xs text-muted-foreground">{r.description}</p> : null}
              <div className="grid gap-0.5 text-sm">
                {r.status === "APPROVED" ? (
                  <>
                    <p><span className="text-muted-foreground">Quedó en:</span> <b>{r.applied}</b></p>
                    <p className="text-xs text-muted-foreground">Antes: {r.previous}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Hoy: {r.current || "Sin rubro"}</p>
                    <p><span className="text-muted-foreground">Propuesto:</span> <b>{r.proposed}</b></p>
                  </>
                )}
              </div>
              {r.note ? <p className="rounded bg-warning/10 px-2 py-1 text-xs">{r.note}</p> : null}
              {editing === r.id ? (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <p className="text-sm font-medium">¿Dónde va?</p>
                  <CategoryTreePicker nodes={nodes} name={`cat-${r.id}`} defaultValue="" onChange={setPickedCategory} />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={pending || !pickedCategory} onClick={() => run(() => approveWithCategoryAction({ id: r.id, categoryId: pickedCategory }))}>
                      Aprobar con este rubro
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-start gap-2 sm:flex-col sm:items-end">
              <Badge tone={CONF_TONE[r.confidence]}>{CONF_LABEL[r.confidence]}</Badge>
              {r.status === "PENDING" ? (
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" disabled={pending} onClick={() => run(() => approveProposalsAction({ ids: [r.id] }))}>Aprobar</Button>
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => { setPickedCategory(""); setEditing(editing === r.id ? null : r.id); }}>Cambiar</Button>
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => rejectProposalsAction({ ids: [r.id] }))}>Rechazar</Button>
                </div>
              ) : (
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => undoProposalAction({ id: r.id }))}>Deshacer</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!rows.length ? <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No hay productos con estos filtros.</p> : null}

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-3 text-sm">
          {filters.page > 1 ? <Link href={href({ page: filters.page - 1 })} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">Anterior</Link> : null}
          <span className="text-muted-foreground tabular-nums">Página {filters.page} de {pages}</span>
          {filters.page < pages ? <Link href={href({ page: filters.page + 1 })} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">Siguiente</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
