"use client";

import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { runScraperSearch } from "@/server/actions/scrapers";
import { Loader2 } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export function ScraperRunner({ slug }: { slug: string }) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 450);
  const [results, setResults] = useState<
    Array<{ name: string; supplierSku: string | null; sourceUrl: string; baseCostUsd: number | null }>
  >([]);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setResults([]);
      setMsg(null);
      return;
    }

    setMsg(null);
    start(async () => {
      const r = await runScraperSearch({ slug, query: q });
      if (!r?.ok) {
        setMsg(r?.error || "Error");
        setResults([]);
      } else {
        setResults(r.items);
      }
    });
  }, [debouncedQuery, slug]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar producto (mín. 2 caracteres)..."
          aria-label="Buscar en scraper"
        />
        {pending ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
      {results.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border bg-card text-sm">
          {results.map((r, i) => (
            <li key={i} className="flex items-center justify-between p-3">
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  SKU: {r.supplierSku || "—"} · USD {r.baseCostUsd ?? "—"}
                </p>
              </div>
              <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                Ver fuente
              </a>
            </li>
          ))}
        </ul>
      ) : debouncedQuery.trim().length >= 2 && !pending ? (
        <p className="text-xs text-muted-foreground">Sin resultados para esta búsqueda.</p>
      ) : null}
    </div>
  );
}
