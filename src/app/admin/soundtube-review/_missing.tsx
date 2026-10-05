"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, TableEmpty } from "@/components/ui/table";
import { decideMissing } from "@/server/actions/soundtube-review";
import type { MissingItem } from "@/server/soundtube/review";
import { useDecision, usd } from "./_use-decision";

type Filter = "all" | "kit" | "zero" | "deactivate";

/** Productos del sistema que la lista no trae: dejarlos como están o desactivarlos. */
export function MissingSection({ items }: { items: MissingItem[] }) {
  const { pending, error, run } = useDecision();
  const [brand, setBrand] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const brands = useMemo(() => [...new Set(items.map((i) => i.product.brand))].sort(), [items]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (brand && i.product.brand !== brand) return false;
      if (filter === "kit" && !/\bkit\b/i.test(i.product.sku ?? "")) return false;
      if (filter === "zero" && i.product.costUsd > 0) return false;
      if (filter === "deactivate" && i.action !== "deactivate") return false;
      return !q || (i.product.sku ?? i.product.name).toLowerCase().includes(q);
    });
  }, [items, brand, filter, query]);

  const toDeactivate = items.filter((i) => i.action === "deactivate").length;
  const visibleIds = rows.map((r) => r.product.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function apply(action: "keep" | "deactivate", ids: string[]) {
    if (ids.length === 0) return;
    run(async () => {
      const r = await decideMissing(ids, action);
      if (r.ok) setSelected(new Set());
      return r;
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {items.length} productos no están en la lista. Por defecto se dejan como están; {toDeactivate} marcados para desactivar.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar SKU…"
          className="h-8 w-44 rounded-md border border-border bg-card px-2 text-xs"
        />
        <select aria-label="Marca" value={brand} onChange={(e) => setBrand(e.target.value)} className="h-8 rounded-md border border-border bg-card px-2 text-xs">
          <option value="">Todas las marcas</option>
          {brands.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <select aria-label="Filtro" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="h-8 rounded-md border border-border bg-card px-2 text-xs">
          <option value="all">Todos</option>
          <option value="kit">Solo KIT</option>
          <option value="zero">Solo costo 0</option>
          <option value="deactivate">Marcados para desactivar</option>
        </select>
        <span className="text-xs text-muted-foreground">{rows.length} visibles · {selected.size} seleccionados</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="destructive" disabled={pending || selected.size === 0} onClick={() => apply("deactivate", [...selected])}>
            Desactivar seleccionados
          </Button>
          <Button size="sm" variant="outline" disabled={pending || selected.size === 0} onClick={() => apply("keep", [...selected])}>
            Dejar seleccionados
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="max-h-[32rem] overflow-y-auto rounded-md border border-border">
        <Table>
          <THead>
            <TR>
              <TH className="w-8">
                <input
                  type="checkbox"
                  aria-label="Seleccionar visibles"
                  checked={allSelected}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      for (const id of visibleIds) {
                        if (allSelected) next.delete(id);
                        else next.add(id);
                      }
                      return next;
                    })
                  }
                />
              </TH>
              <TH>SKU</TH>
              <TH>Marca</TH>
              <TH>Costo actual</TH>
              <TH>Estado</TH>
              <TH>Qué se hace</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty message="No hay productos con este filtro." />
            ) : (
              rows.map((i) => (
                <TR key={i.product.id}>
                  <TD>
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${i.product.sku}`}
                      checked={selected.has(i.product.id)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(i.product.id)) next.delete(i.product.id);
                          else next.add(i.product.id);
                          return next;
                        })
                      }
                    />
                  </TD>
                  <TD className="font-mono text-xs font-semibold">{i.product.sku ?? i.product.name}</TD>
                  <TD className="text-xs text-muted-foreground">{i.product.brand}</TD>
                  <TD className={`whitespace-nowrap text-xs ${i.product.costUsd === 0 ? "font-semibold text-destructive" : ""}`}>{usd(i.product.costUsd)}</TD>
                  <TD className="text-xs">{i.product.isActive ? "Activo" : "Inactivo"}</TD>
                  <TD>
                    <button
                      type="button"
                      disabled={pending}
                      className="text-xs"
                      onClick={() => apply(i.action === "deactivate" ? "keep" : "deactivate", [i.product.id])}
                      title="Cambiar"
                    >
                      {i.action === "deactivate" ? <Badge tone="destructive">Desactivar</Badge> : <Badge tone="muted">Dejar como está</Badge>}
                    </button>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
