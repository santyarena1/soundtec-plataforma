"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import type { NcmResult } from "@/app/api/admin/ncm-search/route";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (position: string, dieNumber: number | null, aecNumber: number | null, teNumber: number | null) => void;
}

function RateBadge({ value, color }: { value: string; color: "orange" | "blue" }) {
  return color === "orange" ? (
    <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
      {value}
    </span>
  ) : (
    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
      {value}
    </span>
  );
}

export function NcmModal({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NcmResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset and focus when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSearched(false);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const q = query.trim();
    if (q.length < 3) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/admin/ncm-search?q=${encodeURIComponent(q)}`);
      setResults(res.ok ? await res.json() : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(item: NcmResult) {
    onSelect(item.position, item.dieNumber, item.aecNumber, item.teNumber);
    onClose();
  }

  if (!open) return null;

  const leafCount = results.filter((r) => r.isLeaf).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal card */}
      <div className="relative z-10 flex w-full max-w-4xl flex-col rounded-xl border border-border bg-card shadow-2xl" style={{ maxHeight: "85vh" }}>

        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Buscar posición arancelaria (NCM)</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Buscá por descripción y hacé click en &ldquo;Seleccionar&rdquo; para aplicar al producto
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search bar */}
        <div className="shrink-0 border-b border-border px-5 py-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ej: amplificador de audio, micrófono condensador, altavoz bluetooth…"
                className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={loading || query.trim().length < 3}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </button>
          </form>
        </div>

        {/* Results area */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Consultando PCRAM…
            </div>
          )}

          {!loading && searched && results.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Sin resultados para &ldquo;{query}&rdquo; — probá otro término
            </p>
          )}

          {!loading && !searched && (
            <div className="py-16 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/25" />
              <p className="text-sm text-muted-foreground">Ingresá la descripción del producto para buscar</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Ej: &ldquo;amplificador potencia&rdquo;, &ldquo;micrófono condensador&rdquo;, &ldquo;pantalla led&rdquo;
              </p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-card">
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Posición NCM</th>
                  <th className="px-4 py-2.5">Descripción</th>
                  <th className="px-4 py-2.5 text-right">AEC</th>
                  <th className="px-4 py-2.5 text-right">DIE</th>
                  <th className="px-4 py-2.5 text-right">TE</th>
                  <th className="px-4 py-2.5 text-right">RE</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((r) =>
                  r.isLeaf ? (
                    <tr
                      key={r.position}
                      className="cursor-pointer hover:bg-primary/5"
                      onClick={() => handleSelect(r)}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold">{r.position}</span>
                      </td>
                      <td className="px-4 py-3 max-w-xs text-xs text-muted-foreground">
                        {r.description}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.aec ? <RateBadge value={r.aec} color="orange" /> : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.die ? <RateBadge value={r.die} color="blue" /> : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">
                        {r.te ?? <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">
                        {r.re ?? <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleSelect(r); }}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          <Check className="h-3 w-3" />
                          Seleccionar
                        </button>
                      </td>
                    </tr>
                  ) : (
                    // Category / chapter row
                    <tr key={r.position} className="bg-muted/20">
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs font-medium text-primary/70">{r.position}</span>
                      </td>
                      <td className="px-4 py-2 text-xs italic text-foreground/60" colSpan={6}>
                        {r.description}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="shrink-0 border-t border-border px-5 py-2 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              Fuente: PCRAM · AEC = Arancel externo común · DIE = Derecho de importación · TE = Tasa estadística · RE = Reintegro exportación
            </p>
            <p className="text-[10px] text-muted-foreground">{leafCount} posición{leafCount !== 1 ? "es" : ""} seleccionable{leafCount !== 1 ? "s" : ""}</p>
          </div>
        )}
      </div>
    </div>
  );
}
