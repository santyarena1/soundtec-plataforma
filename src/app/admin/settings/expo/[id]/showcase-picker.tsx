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

/** Elegir y ordenar los productos que pasan en la vidriera de la pantalla del stand. */
export function ShowcasePicker({ eventId, initial }: { eventId: string; initial: PickerProduct[] }) {
  const [selected, setSelected] = useState<PickerProduct[]>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const dirty = JSON.stringify(selected.map((p) => p.id)) !== JSON.stringify(initial.map((p) => p.id));

  useEffect(() => {
    if (query.trim().length < 2) return setResults([]);
    const timer = setTimeout(() => startSearch(async () => setResults(await searchShowcaseProducts(query))), 300);
    return () => clearTimeout(timer);
  }, [query]);

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
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {selected.length === 0
          ? "Sin productos elegidos: la vidriera muestra automáticamente los más relevantes de cada marca."
          : `${selected.length} producto${selected.length === 1 ? "" : "s"} en este orden.`}
      </p>

      {selected.length > 0 ? (
        <ol className="grid gap-2 sm:grid-cols-2">
          {selected.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-md border border-border bg-card p-2">
              <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded bg-white object-contain" />
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
      ) : null}

      <div className="relative">
        <Input placeholder="Buscar producto por nombre, SKU o marca…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {searching ? <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>
      {results.length > 0 ? (
        <ul className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
          {results.map((p) => {
            const already = selected.some((s) => s.id === p.id);
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-md border border-border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded bg-white object-contain" />
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
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={saving || !dirty}>{saving ? "Guardando…" : "Guardar vidriera"}</Button>
        {selected.length > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setSelected([])}>Volver a automático</Button>
        ) : null}
        {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
      </div>
    </div>
  );
}
