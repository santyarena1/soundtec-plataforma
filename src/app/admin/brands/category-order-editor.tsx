"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, GripVertical, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUnsavedValue } from "@/hooks/use-unsaved-changes-guard";
import {
  getBrandCategoryOrder,
  previewBrandListing,
  saveBrandCategoryOrder,
  type BrandCategoryOption,
  type BrandPreview,
} from "@/server/actions/brand-listing";
import { BrandListingPreview } from "./brand-listing-preview";
import { BrandFeaturedPicker } from "./brand-featured-picker";

const PREVIEW_DELAY_MS = 350;

/**
 * Cómo se ordena la marca en el catálogo del cliente: destacados (estrella),
 * rubros que van primero (arrastrar para ordenar) y una vista previa real con
 * el orden que se está editando. Ver lib/brand-listing-order.
 */
export function CategoryOrderEditor({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [options, setOptions] = useState<BrandCategoryOption[] | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BrandPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTick, setPreviewTick] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const tracker = useUnsavedValue(order, { ready: options !== null });
  const savedOnce = useRef(false);

  useEffect(() => {
    let alive = true;
    getBrandCategoryOrder(brandId)
      .then((result) => {
        if (!alive) return;
        setOptions(result.options);
        setOrder(result.order);
        setNotices(result.notices);
        // Con rubros viejos limpiados queda «sin guardar» para que se note y se guarde.
        tracker.markSaved(result.needsSave ? result.saved : result.order);
      })
      .catch(() => alive && setLoadError("No se pudieron cargar los rubros de la marca."));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  // Vista previa con el orden en edición (sin guardar).
  useEffect(() => {
    if (options === null) return;
    let alive = true;
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      previewBrandListing(brandId, order)
        .then((result) => {
          if (!alive) return;
          setPreview(result);
          setPreviewError(null);
        })
        .catch(() => alive && setPreviewError("No se pudo armar la vista previa."))
        .finally(() => alive && setPreviewLoading(false));
    }, PREVIEW_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [brandId, order, options, previewTick]);

  const byId = useMemo(() => new Map((options ?? []).map((o) => [o.id, o])), [options]);

  /** Rubro elegido que ya abarca a este (un ancestro en el orden). */
  const coveredBy = useCallback(
    (id: string): BrandCategoryOption | null => {
      let parent = byId.get(id)?.parentId ?? null;
      while (parent) {
        if (order.includes(parent)) return byId.get(parent) ?? null;
        parent = byId.get(parent)?.parentId ?? null;
      }
      return null;
    },
    [byId, order]
  );

  function update(next: string[]) {
    setOrder(next);
    setStatus(null);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    update(next);
  }

  function save() {
    setStatus(null);
    start(async () => {
      const result = await saveBrandCategoryOrder(brandId, order);
      if (result.ok) {
        tracker.markSaved(order);
        setNotices([]);
        savedOnce.current = true;
      }
      setStatus(result.ok ? { tone: "ok", text: "Orden guardado. Ya lo ven los clientes." } : { tone: "error", text: result.error });
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4 text-left">
      <div>
        <p className="text-sm font-semibold">Orden de {brandName} en el catálogo</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Cuando un cliente entra a {brandName} ve, en este orden: <strong>1)</strong> los productos con estrella, <strong>2)</strong> los
          rubros que elijas abajo, en el orden de la lista, y <strong>3)</strong> el resto de los rubros por nombre. Vale con «Más
          relevantes» y sin búsqueda: si el cliente busca u ordena por precio o nombre, manda lo que eligió.
        </p>
      </div>

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      {!options && !loadError ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando rubros…
        </p>
      ) : null}

      {notices.length ? (
        <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          <p className="font-medium">El orden guardado tenía rubros viejos (de antes del árbol de Tango):</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="text-muted-foreground">Revisalo y tocá «Guardar orden» para dejarlo así.</p>
        </div>
      ) : null}

      {options ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="space-y-5">
            <section className="space-y-2">
              <StepTitle n={1} title="Destacados" hint="Salen arriba de todo. Al quitar la estrella, el producto vuelve a su rubro." />
              <BrandFeaturedPicker brandId={brandId} onChange={() => setPreviewTick((t) => t + 1)} />
            </section>

            <section className="space-y-2">
              <StepTitle n={2} title="Rubros que van primero" hint="Arrastrá para ordenar. Un rubro incluye todo lo que cuelga de él." />
              {order.length === 0 ? (
                <p className="rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                  Ninguno elegido: después de los destacados, los rubros salen por nombre.
                </p>
              ) : (
                <ol className="space-y-1">
                  {order.map((id, index) => {
                    const option = byId.get(id);
                    return (
                      <li
                        key={id}
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragIndex === null || dragIndex === index) return;
                          move(dragIndex, index);
                          setDragIndex(index);
                        }}
                        onDragEnd={() => setDragIndex(null)}
                        className={cn(
                          "flex cursor-grab items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm active:cursor-grabbing",
                          dragIndex === index ? "border-accent opacity-60" : ""
                        )}
                      >
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="w-6 shrink-0 text-xs font-semibold tabular-nums text-accent">{index + 1}.º</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{option?.name ?? "Rubro sin productos de la marca"}</span>
                          {option && option.label !== option.name ? (
                            <span className="block truncate text-[11px] text-muted-foreground">{option.label}</span>
                          ) : null}
                        </span>
                        {option ? <span className="shrink-0 text-xs text-muted-foreground">{option.count} prod.</span> : null}
                        <IconButton label="Subir" onClick={() => move(index, index - 1)} disabled={index === 0}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton label="Bajar" onClick={() => move(index, index + 1)} disabled={index === order.length - 1}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton label="Sacar del orden" onClick={() => update(order.filter((x) => x !== id))} danger>
                          <X className="h-3.5 w-3.5" />
                        </IconButton>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <section className="space-y-2">
              <StepTitle n={3} title={`Rubros de ${brandName}`} hint="Del árbol de Tango, con cuántos productos activos tiene la marca en cada uno." />
              <ul className="max-h-72 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
                {options.map((option) => {
                  const at = order.indexOf(option.id);
                  const parentChosen = at < 0 ? coveredBy(option.id) : null;
                  return (
                    <li
                      key={option.id}
                      className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-secondary/60"
                      style={{ paddingLeft: `${0.5 + (option.depth - 1) * 1}rem` }}
                    >
                      <span className={cn("min-w-0 flex-1 truncate", option.depth === 1 ? "font-semibold" : "")} title={option.label}>
                        {option.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{option.count}</span>
                      {at >= 0 ? (
                        <span className="w-24 shrink-0 text-right text-xs font-medium text-accent">{at + 1}.º en la lista</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => update([...order, option.id])}
                          title={parentChosen ? `Ya entra dentro de «${parentChosen.name}». Agregalo para que salga antes, con su propio lugar.` : "Agregar al final de la lista"}
                          className="inline-flex w-24 shrink-0 items-center justify-end gap-1 text-xs text-muted-foreground hover:text-accent"
                        >
                          {parentChosen ? <span className="truncate">en {parentChosen.name}</span> : null}
                          <Plus className="h-3.5 w-3.5 shrink-0" />
                        </button>
                      )}
                    </li>
                  );
                })}
                {options.length === 0 ? <li className="px-2 py-2 text-xs text-muted-foreground">La marca no tiene productos en rubros de Tango.</li> : null}
              </ul>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" onClick={save} disabled={pending || !tracker.isDirty}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Guardar orden
              </Button>
              {tracker.isDirty ? <span className="text-xs text-warning">Hay cambios sin guardar en el orden de rubros.</span> : null}
              {status ? <span className={`text-sm ${status.tone === "ok" ? "text-success" : "text-destructive"}`}>{status.text}</span> : null}
            </div>
          </div>

          <BrandListingPreview brandName={brandName} preview={preview} loading={previewLoading} error={previewError} dirty={tracker.isDirty} />
        </div>
      ) : null}
    </div>
  );
}

function StepTitle({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-[11px] text-accent">{n}</span>
        {title}
      </p>
      <p className="ml-7 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn("rounded p-1 hover:bg-secondary disabled:opacity-30", danger ? "text-muted-foreground hover:text-destructive" : "")}
    >
      {children}
    </button>
  );
}
