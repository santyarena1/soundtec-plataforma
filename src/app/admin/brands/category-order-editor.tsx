"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useUnsavedValue } from "@/hooks/use-unsaved-changes-guard";
import { getBrandCategoryOrder, saveBrandCategoryOrder, type BrandCategoryOption } from "@/server/actions/brand-listing";

/**
 * Orden de rubros al entrar a la marca (vista cliente). Los rubros elegidos van
 * primero y en este orden; el resto, después, por nombre. Elegir un rubro
 * abarca sus subrubros. Los productos con estrella van siempre arriba de todo.
 */
export function CategoryOrderEditor({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [options, setOptions] = useState<BrandCategoryOption[] | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tracker = useUnsavedValue(order, { ready: options !== null });

  useEffect(() => {
    let alive = true;
    getBrandCategoryOrder(brandId)
      .then((result) => {
        if (!alive) return;
        setOptions(result.options);
        setOrder(result.order);
      })
      .catch(() => alive && setLoadError("No se pudieron cargar los rubros de la marca."));
    return () => {
      alive = false;
    };
  }, [brandId]);

  const byId = useMemo(() => new Map((options ?? []).map((o) => [o.id, o])), [options]);
  const available = (options ?? []).filter((o) => !order.includes(o.id));

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setStatus(null);
  }

  function save() {
    setStatus(null);
    start(async () => {
      const result = await saveBrandCategoryOrder(brandId, order);
      if (result.ok) tracker.markSaved(order);
      setStatus(result.ok ? { tone: "ok", text: "Orden guardado." } : { tone: "error", text: result.error });
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4 text-left">
      <div>
        <p className="text-sm font-semibold">Orden de rubros en el catálogo</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Al entrar a {brandName}, el cliente ve primero los productos con estrella y después los rubros en este orden. Los rubros
          que no estén en la lista van al final, por nombre. Elegir un rubro incluye sus subrubros.
        </p>
      </div>

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      {!options && !loadError ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando rubros…
        </p>
      ) : null}

      {options ? (
        <>
          {order.length === 0 ? (
            <p className="rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">Sin orden elegido: los rubros salen por nombre.</p>
          ) : (
            <ol className="space-y-1">
              {order.map((id, index) => {
                const option = byId.get(id);
                return (
                  <li key={id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm">
                    <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}.</span>
                    <span className="min-w-0 flex-1 truncate" title={option?.label}>
                      {option?.label ?? "Rubro borrado"}
                    </span>
                    {option ? <span className="shrink-0 text-xs text-muted-foreground">{option.count}</span> : null}
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="rounded p-1 hover:bg-secondary disabled:opacity-30" aria-label="Subir">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === order.length - 1}
                      className="rounded p-1 hover:bg-secondary disabled:opacity-30"
                      aria-label="Bajar"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOrder(order.filter((x) => x !== id));
                        setStatus(null);
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                      aria-label="Quitar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                setOrder([...order, e.target.value]);
                setStatus(null);
              }}
              className="h-9 flex-1 text-sm"
              aria-label="Agregar rubro al orden"
              disabled={available.length === 0}
            >
              <option value="">{available.length ? "Agregar rubro…" : "No quedan rubros por agregar"}</option>
              {available.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} ({option.count})
                </option>
              ))}
            </Select>
            <Button type="button" size="sm" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar orden
            </Button>
          </div>
          {status ? <p className={`text-sm ${status.tone === "ok" ? "text-success" : "text-destructive"}`}>{status.text}</p> : null}
        </>
      ) : null}
    </div>
  );
}
