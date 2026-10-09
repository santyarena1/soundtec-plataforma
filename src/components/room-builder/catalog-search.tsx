"use client";

/** Búsqueda libre en todo el catálogo, con foto, marca y precio. */

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { CatalogHit } from "@/services/room-builder/custom-devices";

const DEBOUNCE_MS = 280;
const MIN_QUERY = 2;

export function CatalogSearch({
  onPick,
  disabled,
  autoFocus,
  placeholder = "Buscar en todo el catálogo: marca, modelo o SKU…",
}: {
  onPick: (hit: CatalogHit) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setResults([]);
      setError(null);
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/room-builder/catalog-search?q=${encodeURIComponent(q)}`);
        const json = await res.json().catch(() => null);
        if (id !== seq.current) return;
        if (!json?.ok) {
          setError(json?.error || "No se pudo buscar");
          setResults([]);
          return;
        }
        setError(null);
        setResults(json.results);
      } catch {
        if (id === seq.current) setError("No se pudo buscar");
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm focus:border-[#1e3553] focus:outline-none focus:ring-2 focus:ring-[#1e3553]/15"
        />
        {loading ? <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-slate-400" /> : null}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {query.trim().length >= MIN_QUERY && !loading && !error && !results.length ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500">Nada con “{query.trim()}” en el catálogo.</p>
      ) : null}
      <ul className="space-y-1.5">
        {results.map((hit) => (
          <li key={hit.productId}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(hit)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2 text-left transition hover:border-[#1e3553]/50 hover:shadow-sm disabled:opacity-50"
            >
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-slate-100 bg-white">
                {hit.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={hit.imageUrl} alt="" className="h-full w-full object-contain p-0.5" loading="lazy" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                {hit.brand ? <span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">{hit.brand}</span> : null}
                <span className="line-clamp-2 block text-[13px] font-medium leading-snug text-slate-900">{hit.name}</span>
                {hit.sku ? <span className="block truncate text-[10.5px] text-slate-400">{hit.sku}</span> : null}
              </span>
              {hit.priceUsd != null ? <span className="shrink-0 text-xs font-semibold text-slate-700">USD {hit.priceUsd.toFixed(0)}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
