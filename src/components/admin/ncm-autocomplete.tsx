"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import type { NcmResult } from "@/app/api/admin/ncm-search/route";

interface Props {
  value: string;
  onChange: (position: string) => void;
  onApply?: (position: string, dieNumber: number | null, aecNumber: number | null, teNumber: number | null) => void;
  name?: string;
}

function RateBadge({ value, color }: { value: string; color: "orange" | "blue" }) {
  return color === "orange" ? (
    <span className="rounded bg-orange-100 px-1 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">{value}</span>
  ) : (
    <span className="rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{value}</span>
  );
}

export function NcmAutocomplete({ value, onChange, onApply, name = "tariffPosition" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NcmResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [open]);

  function handleToggle() {
    setOpen((v) => !v);
    if (!open) {
      setQuery("");
      setResults([]);
      setSearched(false);
    }
  }

  async function handleSearch() {
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleSearch();
    }
    if (e.key === "Escape") setOpen(false);
  }

  function handleSelect(item: NcmResult) {
    onChange(item.position);
    onApply?.(item.position, item.dieNumber, item.aecNumber, item.teNumber);
    setOpen(false);
  }

  const leafCount = results.filter((r) => r.isLeaf).length;

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden input for FormData */}
      <input type="hidden" name={name} value={value} />

      {/* Trigger row */}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ej. 8518.40.00.000C"
          className="h-9 flex-1 rounded-md border border-border bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={handleToggle}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" />
          Buscar NCM
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Inline dropdown panel */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-border bg-card shadow-xl">
          {/* Search bar */}
          <div className="flex gap-2 border-b border-border p-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ej: amplificador, micrófono, altavoz…"
                className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              disabled={loading || query.trim().length < 3}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Buscar
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-72 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Consultando PCRAM…
              </div>
            )}

            {!loading && searched && results.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin resultados — probá otro término</p>
            )}

            {!loading && !searched && (
              <p className="py-6 text-center text-xs text-muted-foreground">Ingresá descripción del producto y presioná Buscar</p>
            )}

            {!loading && results.length > 0 && (
              <>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 border-b border-border bg-card">
                    <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">NCM</th>
                      <th className="px-3 py-2">Descripción</th>
                      <th className="px-3 py-2 text-right">AEC</th>
                      <th className="px-3 py-2 text-right">DIE</th>
                      <th className="px-3 py-2 text-right">TE</th>
                      <th className="px-3 py-2" />
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
                          <td className="px-3 py-2 font-mono font-semibold">{r.position}</td>
                          <td className="max-w-[200px] px-3 py-2 text-muted-foreground">{r.description}</td>
                          <td className="px-3 py-2 text-right">
                            {r.aec ? <RateBadge value={r.aec} color="orange" /> : <span className="text-muted-foreground/30">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {r.die ? <RateBadge value={r.die} color="blue" /> : <span className="text-muted-foreground/30">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {r.te ?? <span className="text-muted-foreground/30">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleSelect(r); }}
                              className="inline-flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground hover:bg-primary/90"
                            >
                              <Check className="h-2.5 w-2.5" />
                              Usar
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={r.position} className="bg-muted/20">
                          <td className="px-3 py-1.5 font-mono text-[10px] font-medium text-primary/70">{r.position}</td>
                          <td className="px-3 py-1.5 italic text-foreground/60" colSpan={5}>{r.description}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
                <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
                  {leafCount} posición{leafCount !== 1 ? "es" : ""} seleccionable{leafCount !== 1 ? "s" : ""} · Fuente: PCRAM
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
