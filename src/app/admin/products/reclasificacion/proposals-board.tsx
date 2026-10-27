"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { CategoryTreePicker } from "@/components/admin/category-tree-picker";
import type { CategoryNode } from "@/lib/category-tree";
import {
  approveAllHighAction,
  approveProposalsAction,
  approveWithCategoryAction,
  rejectProposalsAction,
  removeBranchAction,
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
  note: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
};
export type NewBranch = { id: string; path: string; label: string; reason: string | null; count: number };
type View = "revisar" | "seguros" | "decididos";

const fmt = (n: number) => n.toLocaleString("es-AR");

export function ProposalsBoard({
  stats,
  view,
  filters,
  brands,
  rows,
  matching,
  pageSize,
  nodes,
  newBranches,
}: {
  stats: { safe: number; doubtful: number; decided: number; approved: number };
  view: View;
  filters: { marca: string; q: string; page: number };
  brands: string[];
  rows: ProposalRow[];
  matching: number;
  pageSize: number;
  nodes: CategoryNode[];
  newBranches: NewBranch[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [picked, setPicked] = useState("");

  const href = (patch: { ver?: View; page?: number; marca?: string; q?: string }) => {
    const next = { ver: view, marca: filters.marca, q: filters.q, page: 1, ...patch };
    const sp = new URLSearchParams();
    if (next.ver !== "revisar") sp.set("ver", next.ver);
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
      setEditing(null);
      router.refresh();
    });
  }

  async function passSafe() {
    const ok = await confirmDialog({
      title: "Pasar los seguros",
      message: `${fmt(stats.safe)} productos pasan a su rubro de Tango. Si alguno no te convence, después lo deshacés desde «Ver lo que ya decidiste».`,
      confirmLabel: "Pasarlos",
    });
    if (ok) run(() => approveAllHighAction());
  }

  async function removeNew(b: NewBranch) {
    const ok = await confirmDialog({
      title: "Quitar rubro nuevo",
      message: `Se quita «${b.label}» y sus ${fmt(b.count)} productos vuelven al rubro de Tango que les correspondía sin este agregado.`,
      confirmLabel: "Quitar",
      tone: "danger",
    });
    if (ok) run(() => removeBranchAction({ id: b.id }));
  }

  const pages = Math.max(1, Math.ceil(matching / pageSize));

  return (
    <div className="space-y-5">
      <ol className="grid gap-3 md:grid-cols-2">
        <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paso 1</p>
          {stats.safe > 0 ? (
            <>
              <p>
                <b className="text-lg">{fmt(stats.safe)}</b> productos tienen el rubro claro.
              </p>
              <Button type="button" className="self-start" disabled={pending} onClick={() => void passSafe()}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Pasar los {fmt(stats.safe)} seguros
              </Button>
              <Link href={href({ ver: "seguros" })} className="text-sm text-muted-foreground hover:underline">
                Mirarlos antes
              </Link>
            </>
          ) : (
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" /> Los seguros ya están pasados.
            </p>
          )}
        </li>
        <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paso 2</p>
          {stats.doubtful > 0 ? (
            <>
              <p>
                <b className="text-lg">{fmt(stats.doubtful)}</b> productos para revisar de a uno.
              </p>
              <p className="text-sm text-muted-foreground">Están en la lista de abajo. En cada uno: «Está bien», «Va en otro rubro» o «Dejarlo como está».</p>
            </>
          ) : (
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" /> No queda nada para revisar.
            </p>
          )}
        </li>
      </ol>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-semibold">
          {view === "revisar" ? "Para revisar" : view === "seguros" ? "Seguros (todavía sin pasar)" : "Lo que ya decidiste"}
          <span className="ml-2 font-normal text-muted-foreground tabular-nums">{fmt(matching)}</span>
        </h2>
        <form method="get" action="/admin/products/reclasificacion" className="flex flex-wrap gap-2">
          {view !== "revisar" ? <input type="hidden" name="ver" value={view} /> : null}
          <Input name="q" defaultValue={filters.q} placeholder="Buscar modelo o código" aria-label="Buscar" className="w-52" />
          <Select name="marca" defaultValue={filters.marca} aria-label="Marca" className="w-44">
            <option value="">Todas las marcas</option>
            {brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </Select>
          <Button type="submit" variant="outline" size="sm">Buscar</Button>
        </form>
      </div>
      {view !== "revisar" ? (
        <Link href={href({ ver: "revisar" })} className="text-sm text-accent hover:underline">← Volver a lo que hay que revisar</Link>
      ) : null}

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <Link href={`/admin/products/${r.productId}`} className="font-mono font-medium hover:underline">{r.model}</Link>
                <span className="ml-2 text-xs text-muted-foreground">{[r.brand, r.sku && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(r.sku) ? r.sku : null].filter(Boolean).join(" · ")}</span>
                {r.description ? <p className="text-xs text-muted-foreground">{r.description}</p> : null}
              </div>
            </div>
            <div className="grid gap-1 text-sm sm:grid-cols-[6rem_minmax(0,1fr)]">
              <span className="text-muted-foreground">Hoy</span>
              <span>{r.current || "Sin rubro"}</span>
              <span className="text-muted-foreground">{r.status === "PENDING" ? "Propuesto" : r.status === "APPROVED" ? "Quedó en" : "Propuesto"}</span>
              <span className="font-medium">{r.status === "REJECTED" ? <s className="font-normal text-muted-foreground">{r.proposed}</s> : r.proposed}</span>
            </div>
            {r.note ? <p className="rounded-md bg-warning/10 px-2 py-1 text-xs">Por qué hay duda: {r.note}</p> : null}

            {r.status === "PENDING" ? (
              editing === r.id ? (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <p className="text-sm font-medium">Elegí el rubro correcto</p>
                  <CategoryTreePicker nodes={nodes} name={`cat-${r.id}`} defaultValue="" onChange={setPicked} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" disabled={pending || !picked} onClick={() => run(() => approveWithCategoryAction({ id: r.id, categoryId: picked }))}>
                      Pasarlo a este rubro
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={pending} onClick={() => run(() => approveProposalsAction({ ids: [r.id] }))}>Está bien</Button>
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => { setPicked(""); setEditing(r.id); }}>Va en otro rubro</Button>
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => rejectProposalsAction({ ids: [r.id] }))}>Dejarlo como está</Button>
                </div>
              )
            ) : (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-muted-foreground">{r.status === "APPROVED" ? "Pasado" : "Quedó como estaba"}</span>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => undoProposalAction({ id: r.id }))}>Deshacer</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!rows.length ? <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No hay productos acá.</p> : null}

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-3 text-sm">
          {filters.page > 1 ? <Link href={href({ page: filters.page - 1 })} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">Anterior</Link> : null}
          <span className="text-muted-foreground tabular-nums">Página {filters.page} de {pages}</span>
          {filters.page < pages ? <Link href={href({ page: filters.page + 1 })} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">Siguiente</Link> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4 border-t border-border pt-4 text-sm">
        {view !== "decididos" && stats.decided > 0 ? (
          <Link href={href({ ver: "decididos" })} className="text-accent hover:underline">Ver lo que ya decidiste ({fmt(stats.decided)})</Link>
        ) : null}
      </div>

      {newBranches.length ? (
        <details className="rounded-lg border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm">
            <b>{newBranches.length} rubros que agregamos porque Tango no los tiene.</b>{" "}
            <span className="text-muted-foreground">Creálos también en Tango para que coincidan. Si alguno no te sirve, quitalo.</span>
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {newBranches.map((b) => (
              <li key={b.id} className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{b.label}</p>
                  <p className="font-mono text-xs text-muted-foreground">{b.path} · {fmt(b.count)} productos</p>
                  {b.reason ? <p className="text-xs text-muted-foreground">{b.reason}</p> : null}
                </div>
                <Button type="button" size="sm" variant="ghost" className="shrink-0" disabled={pending} onClick={() => void removeNew(b)}>Quitar</Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
