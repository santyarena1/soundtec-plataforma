"use client";

import { useState } from "react";
import { Search, Loader2, Copy, Check } from "lucide-react";
import type { NcmResult } from "@/app/api/admin/ncm-search/route";

function Dash() {
  return <span className="text-xs text-muted-foreground/40">—</span>;
}

function RateBadge({ value, color }: { value: string; color: "orange" | "blue" }) {
  const cls =
    color === "orange"
      ? "rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
      : "rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  return <span className={cls}>{value}</span>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copiar"
      className="text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function NcmSearchClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NcmResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 3) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/admin/ncm-search?q=${encodeURIComponent(q)}`);
      const data: NcmResult[] = res.ok ? await res.json() : [];
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscá por descripción del producto… ej: amplificador, micrófono, cable"
            className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={loading || query.trim().length < 3}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </button>
      </form>

      {/* Results */}
      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Consultando PCRAM…
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Sin resultados para &ldquo;{query}&rdquo;. Probá con otro término.
        </p>
      )}

      {!loading && results.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
            {results.length} resultado{results.length !== 1 ? "s" : ""} para &ldquo;{query}&rdquo;
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Posición NCM</th>
                  <th className="px-4 py-2.5">Descripción</th>
                  <th className="px-4 py-2.5 text-right">AEC</th>
                  <th className="px-4 py-2.5 text-right">DIE</th>
                  <th className="px-4 py-2.5 text-right">TE</th>
                  <th className="px-4 py-2.5 text-right">SIMI</th>
                  <th className="px-4 py-2.5 text-right">RE</th>
                  <th className="px-4 py-2.5 text-right">DE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((r) =>
                  r.isLeaf ? (
                    <tr key={r.position} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold">{r.position}</span>
                          <CopyButton text={r.position} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
                        {r.description}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.aec ? <RateBadge value={r.aec} color="orange" /> : <Dash />}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.die ? <RateBadge value={r.die} color="blue" /> : <Dash />}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.te ? <span className="text-xs tabular-nums">{r.te}</span> : <Dash />}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.simi && r.simi !== "--" ? <span className="text-xs tabular-nums">{r.simi}</span> : <Dash />}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.re ? <span className="text-xs tabular-nums">{r.re}</span> : <Dash />}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.de ? <span className="text-xs tabular-nums">{r.de}</span> : <Dash />}
                      </td>
                    </tr>
                  ) : (
                    // Category / chapter row — no tariff data
                    <tr key={r.position} className="bg-muted/20">
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs font-medium text-primary/80">{r.position}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-foreground/70 italic max-w-xs" colSpan={7}>
                        {r.description}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-muted/20 px-4 py-2 text-[10px] text-muted-foreground">
            Fuente: PCRAM NCM · AEC = Arancel externo común · DIE = Derecho de importación específico · TE = Tasa estadística · SIMI = Sistema de importaciones · RE = Reintegro exportación · DE = Derecho de exportación
          </div>
        </div>
      )}

      {!searched && (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Ingresá la descripción del producto para buscar su posición NCM</p>
          <p className="mt-1 text-xs text-muted-foreground/60">Ej: &ldquo;amplificador audio&rdquo;, &ldquo;micrófono condensador&rdquo;, &ldquo;altavoz bluetooth&rdquo;</p>
        </div>
      )}
    </div>
  );
}
