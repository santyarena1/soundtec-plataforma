"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff, Loader2, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { optimizedImage } from "@/lib/image-url";
import { formatUsd } from "@/lib/utils";

/**
 * Buscador de productos único para todo el sistema (cotizaciones, accesorios,
 * pedidos, listas…). Se ve y se usa igual en todas las pantallas:
 * escribís, aparecen los productos con foto, modelo, marca y descripción, y
 * tocás «Agregar» (o Enter para el primero).
 */
export type PickerItem = {
  id: string;
  /** Modelo (título). */
  title: string;
  subtitle?: string | null;
  brand?: string | null;
  /** Código para reconocerlo (ej. Tango). */
  code?: string | null;
  imageUrl?: string | null;
  price?: number | null;
  /** Aviso corto (ej. «inactivo», «ya está en la lista»). */
  note?: string | null;
  disabled?: boolean;
};

export function ProductSearchPicker({
  search,
  onPick,
  placeholder = "Buscá por modelo, marca o código",
  actionLabel = "Agregar",
  label,
  autoFocus,
  clearOnPick = true,
  showPrice = false,
  minChars = 2,
  pickedIds,
}: {
  search: (query: string) => Promise<PickerItem[]>;
  onPick: (item: PickerItem) => void | Promise<void>;
  placeholder?: string;
  actionLabel?: string;
  label?: string;
  autoFocus?: boolean;
  clearOnPick?: boolean;
  showPrice?: boolean;
  /** 0 = muestra resultados sin escribir (ej. todos los de las marcas elegidas). */
  minChars?: number;
  /** Ya elegidos: se ven atenuados con «ya agregado». */
  pickedIds?: ReadonlySet<string>;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < minChars) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      search(q)
        .then((rows) => {
          if (id !== requestId.current) return; // llegó una búsqueda más nueva
          setItems(rows);
          setActive(0);
        })
        .catch(() => id === requestId.current && setItems([]))
        .finally(() => id === requestId.current && setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, search, minChars]);

  const isOff = (item: PickerItem) => item.disabled || !!pickedIds?.has(item.id);

  async function pick(item: PickerItem) {
    if (isOff(item) || picking) return;
    setPicking(item.id);
    try {
      await onPick(item);
      if (clearOnPick) {
        setQuery("");
        setItems([]);
      }
    } finally {
      setPicking(null);
    }
  }

  return (
    <div className="space-y-2">
      {label ? <p className="text-sm font-medium">{label}</p> : null}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && items[active]) {
              e.preventDefault();
              void pick(items[active]!);
            }
          }}
          placeholder={placeholder}
          aria-label={label ?? placeholder}
          className="h-11 pl-9 text-base"
        />
        {loading ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
      </div>

      {items.length ? (
        <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card shadow-sm" role="listbox">
          {items.map((item, index) => (
            <li
              key={item.id}
              role="option"
              aria-selected={index === active}
              className={`flex items-center gap-3 px-3 py-2 ${index === active ? "bg-secondary/60" : ""} ${isOff(item) ? "opacity-60" : ""}`}
              onMouseEnter={() => setActive(index)}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={optimizedImage(item.imageUrl, 96) ?? undefined} alt="" className="h-full w-full object-contain" loading="lazy" />
                ) : (
                  <ImageOff className="h-4 w-4 text-muted-foreground/50" aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[item.brand, item.code ? `Cód. ${item.code}` : null, item.note, pickedIds?.has(item.id) ? "ya agregado" : null].filter(Boolean).join(" · ")}
                </span>
                {item.subtitle ? <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span> : null}
              </span>
              {showPrice && item.price != null ? (
                <span className="shrink-0 text-sm font-semibold tabular-nums">{item.price > 0 ? formatUsd(item.price) : "Consultá precio"}</span>
              ) : null}
              <button
                type="button"
                disabled={isOff(item) || !!picking}
                onClick={() => void pick(item)}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50"
              >
                {picking === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {actionLabel}
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= Math.max(minChars, 1) && !loading ? (
        <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          No encontramos productos con «{query.trim()}». Probá con el modelo, la marca o una palabra de la descripción.
        </p>
      ) : minChars > 1 && query.trim().length > 0 && query.trim().length < minChars ? (
        <p className="text-xs text-muted-foreground">Escribí al menos {minChars} letras.</p>
      ) : null}
    </div>
  );
}
