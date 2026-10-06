"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveShowcaseProducts, searchShowcaseProducts } from "@/server/actions/expo-events";

export interface PickerProduct {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
}

/** La misma foto que usa la pantalla (recortada, sin blanco sobrante). */
const thumb = (p: PickerProduct) => `/api/expo/product-image/${p.id}`;

function Thumb({ p }: { p: PickerProduct }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={thumb(p)} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-md bg-white object-contain p-0.5 ring-1 ring-border" />
  );
}

/** Elegir y ordenar los productos que pasan en la vidriera de la pantalla del stand. */
export function ShowcasePicker({
  eventId,
  initial,
  autoPreview,
  brands,
}: {
  eventId: string;
  initial: PickerProduct[];
  /** Lo que hoy pasa en la pantalla si no se eligen productos. */
  autoPreview: PickerProduct[];
  brands: string[];
}) {
  const [selected, setSelected] = useState<PickerProduct[]>(initial);
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const dirty = JSON.stringify(selected.map((p) => p.id)) !== JSON.stringify(initial.map((p) => p.id));
  const manual = selected.length > 0;

  useEffect(() => {
    if (query.trim().length < 2 && !brand) return setResults([]);
    const timer = setTimeout(() => startSearch(async () => setResults(await searchShowcaseProducts(query, brand || undefined))), 300);
    return () => clearTimeout(timer);
  }, [query, brand]);

  const move = (index: number, delta: number) =>
    setSelected((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  function save() {
    setMessage(null);
    startSave(async () => {
      const r = await saveShowcaseProducts(eventId, selected.map((p) => p.id));
      setMessage(r.ok ? "Guardado. La pantalla del stand toma la nueva vidriera al recargar." : r.error ?? "Error");
    });
  }

  return (
    <div className="space-y-5">
      {!manual ? (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Hoy pasan en la pantalla (selección automática: los más relevantes de cada marca)</p>
            <Button type="button" size="sm" variant="outline" onClick={() => setSelected(autoPreview)}>
              Elegir a mano empezando por estos
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Tocá la ✕ de uno para sacarlo: la vidriera pasa a ser manual con el resto.</p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {autoPreview.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-md border border-border bg-card p-2">
                <Thumb p={p} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.brand}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Sacar ${p.name}`}
                  title="Sacar de la vidriera"
                  onClick={() => setSelected(autoPreview.filter((x) => x.id !== p.id))}
                  className="rounded p-1 text-destructive hover:bg-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Vidriera elegida a mano: {selected.length} producto{selected.length === 1 ? "" : "s"}, en este orden.
          </p>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {selected.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
                <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
                <Thumb p={p} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.brand}</p>
                </div>
                <button type="button" aria-label="Subir" onClick={() => move(i, -1)} className="rounded p-1 hover:bg-secondary"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" aria-label="Bajar" onClick={() => move(i, 1)} className="rounded p-1 hover:bg-secondary"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" aria-label="Quitar" onClick={() => setSelected((l) => l.filter((x) => x.id !== p.id))} className="rounded p-1 text-destructive hover:bg-secondary"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Agregar productos</p>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Marca"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">Todas las marcas</option>
            {brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <div className="relative min-w-[16rem] flex-1">
            <Input placeholder="Buscar por nombre, SKU o modelo…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {searching ? <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Elegí una marca para ver todos sus productos con foto, o escribí para buscar.</p>
        {results.length > 0 ? (
          <ul className="grid max-h-[28rem] gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {results.map((p) => {
              const already = selected.some((s) => s.id === p.id);
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-md border border-border p-2">
                  <Thumb p={p} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.brand}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" disabled={already} onClick={() => setSelected((l) => [...l, p])}>
                    {already ? "Agregado" : <><Plus className="h-3.5 w-3.5" /> Agregar</>}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (query.trim().length >= 2 || brand) && !searching ? (
          <p className="text-xs text-muted-foreground">Sin resultados.</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={saving || !dirty}>{saving ? "Guardando…" : "Guardar vidriera"}</Button>
        {manual ? (
          <Button type="button" variant="ghost" onClick={() => setSelected([])}>Volver a automático</Button>
        ) : null}
        {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
      </div>
    </div>
  );
}
