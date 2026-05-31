"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2, ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { NcmResult } from "@/app/api/admin/ncm-search/route";

interface Props {
  value: string;
  onChange: (position: string) => void;
  onApply?: (position: string, dieNumber: number | null) => void;
  name?: string;
}

export function NcmAutocomplete({ value, onChange, onApply, name = "tariffPosition" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NcmResult[]>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (query.length < 3) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/ncm-search?q=${encodeURIComponent(query)}`);
        const data: NcmResult[] = res.ok ? await res.json() : [];
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [query]);

  function handleApply(item: NcmResult) {
    onApply?.(item.position, item.dieNumber);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden input for FormData */}
      <input type="hidden" name={name} value={value} />

      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ej. 8518.40.00.000C"
          className="font-mono"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="Buscar posición arancelaria"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-card shadow-xl">
          {/* Search input */}
          <div className="p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por descripción… (mín. 3 caracteres)"
                className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-8 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); setResults([]); searchRef.current?.focus(); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Consultando PCRAM…
            </div>
          )}

          {!loading && query.length >= 3 && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados para &ldquo;{query}&rdquo;</p>
          )}

          {results.length > 0 && (
            <ul className="max-h-64 overflow-y-auto border-t border-border divide-y divide-border/60">
              {results.map((item) =>
                item.isLeaf ? (
                  <li key={item.position} className="flex items-start gap-2 px-3 py-2 hover:bg-muted/40">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-foreground">{item.position}</span>
                        {item.die && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            DIE {item.die}
                          </span>
                        )}
                        {item.aec && (
                          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                            AEC {item.aec}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApply(item)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary"
                    >
                      <ArrowUpRight className="h-3 w-3" />
                      Aplicar
                    </button>
                  </li>
                ) : (
                  // Category row — informational only, no apply button
                  <li key={item.position} className="flex items-center gap-2 px-3 py-1.5 bg-muted/20">
                    <span className="font-mono text-[11px] font-medium text-primary/70">{item.position}</span>
                    <span className="text-[11px] text-muted-foreground italic truncate">{item.description}</span>
                  </li>
                )
              )}
            </ul>
          )}

          <div className="border-t border-border px-3 py-1.5 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              Fuente: PCRAM · &ldquo;Aplicar&rdquo; completa NCM y DIE en el formulario
            </p>
            <a
              href="/admin/ncm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary hover:underline"
            >
              Abrir buscador completo ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
