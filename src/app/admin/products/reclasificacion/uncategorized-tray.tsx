"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { CategoryTreePicker } from "@/components/admin/category-tree-picker";
import type { CategoryNode } from "@/lib/category-tree";
import { assignUncategorizedAction } from "@/server/actions/category-proposals";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

export type UncategorizedRow = {
  productId: string;
  model: string;
  sku: string | null;
  brand: string | null;
  image: string | null;
  description: string | null;
  /** Categoría vieja (la que tenía antes de pasar a «Sin categorizar»). */
  previous: string | null;
  /** Propuesta de la reclasificación, si hay. */
  proposal: { label: string; categoryId: string | null; note: string | null } | null;
};

const fmt = (n: number) => n.toLocaleString("es-AR");

/** Bandeja «Para revisar uno a uno»: los productos de «Sin categorizar», de a uno, con el árbol para elegir. */
export function UncategorizedTray({
  rows,
  matching,
  pageSize,
  filters,
  brands,
  nodes,
}: {
  rows: UncategorizedRow[];
  matching: number;
  pageSize: number;
  filters: { marca: string; q: string; page: number };
  brands: string[];
  nodes: CategoryNode[];
}) {
  const pages = Math.max(1, Math.ceil(matching / pageSize));
  const href = (page: number) => {
    const sp = new URLSearchParams({ ver: "uno-a-uno" });
    if (filters.marca) sp.set("marca", filters.marca);
    if (filters.q) sp.set("q", filters.q);
    if (page > 1) sp.set("pagina", String(page));
    return `/admin/products/reclasificacion?${sp.toString()}`;
  };

  return (
    <div className="space-y-4">
      <Link href="/admin/products/reclasificacion" className="text-sm text-accent hover:underline">← Volver a la reclasificación</Link>
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p>
          <b className="text-lg tabular-nums">{fmt(matching)}</b> productos en <b>Sin categorizar</b>: no se sabía con certeza en qué rubro de Tango van.
        </p>
        <p className="text-muted-foreground">
          Los clientes los siguen encontrando por búsqueda y por marca, pero no aparecen en la columna de rubros. Elegí el rubro de cada uno y tocá «Guardar».
        </p>
      </div>

      <form method="get" action="/admin/products/reclasificacion" className="flex flex-wrap gap-2">
        <input type="hidden" name="ver" value="uno-a-uno" />
        <Input name="q" defaultValue={filters.q} placeholder="Buscar modelo o código" aria-label="Buscar" className="w-52" />
        <Select name="marca" defaultValue={filters.marca} aria-label="Marca" className="w-44">
          <option value="">Todas las marcas</option>
          {brands.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </Select>
        <Button type="submit" variant="outline" size="sm">Buscar</Button>
      </form>

      <ul className="space-y-2">
        {rows.map((r) => (
          <TrayItem key={r.productId} row={r} nodes={nodes} />
        ))}
      </ul>
      {!rows.length ? <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No queda nada sin categorizar.</p> : null}

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-3 text-sm">
          {filters.page > 1 ? <Link href={href(filters.page - 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">Anterior</Link> : null}
          <span className="text-muted-foreground tabular-nums">Página {filters.page} de {pages}</span>
          {filters.page < pages ? <Link href={href(filters.page + 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">Siguiente</Link> : null}
        </div>
      ) : null}
    </div>
  );
}

function TrayItem({ row, nodes }: { row: UncategorizedRow; nodes: CategoryNode[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState(row.proposal?.categoryId ?? "");
  useUnsavedChangesGuard(picked !== (row.proposal?.categoryId ?? ""));

  function save() {
    start(async () => {
      const r = await assignUncategorizedAction({ productId: row.productId, categoryId: picked });
      if (!r.ok) return void toast.error(r.error || "No se pudo guardar.");
      toast.success(r.message || "Guardado.");
      router.refresh();
    });
  }

  return (
    <li className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-[6rem_minmax(0,1fr)]" data-testid="uncategorized-item">
      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
        {row.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.image} alt={row.model} className="h-full w-full object-contain" loading="lazy" />
        ) : (
          <ImageOff className="h-6 w-6 text-muted-foreground" aria-label="Sin foto" />
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <div>
          <Link href={`/admin/products/${row.productId}`} className="font-mono font-medium hover:underline">{row.model}</Link>
          <span className="ml-2 text-xs text-muted-foreground">
            {[row.brand, row.sku && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(row.sku) ? row.sku : null].filter(Boolean).join(" · ")}
          </span>
          {row.description ? <p className="text-xs text-muted-foreground">{row.description}</p> : null}
        </div>
        <div className="grid gap-1 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
          <span className="text-muted-foreground">Categoría vieja</span>
          <span>{row.previous || "Sin rubro"}</span>
          <span className="text-muted-foreground">Propuesta</span>
          <span className={row.proposal ? "font-medium" : "text-muted-foreground"}>{row.proposal?.label ?? "No hay"}</span>
        </div>
        {row.proposal?.note ? <p className="rounded-md bg-warning/10 px-2 py-1 text-xs">Por qué hay duda: {row.proposal.note}</p> : null}
        <div className="space-y-2 rounded-md border border-border p-3">
          <CategoryTreePicker nodes={nodes} name={`cat-${row.productId}`} defaultValue={row.proposal?.categoryId ?? ""} onChange={setPicked} allowCreate />
          <Button type="button" size="sm" disabled={pending || !picked} onClick={save}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Guardar
          </Button>
        </div>
      </div>
    </li>
  );
}
