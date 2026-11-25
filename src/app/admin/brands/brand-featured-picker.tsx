"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchBrandProducts, setProductFeatured, type BrandProductHit } from "@/server/actions/brand-listing";

const SEARCH_DELAY_MS = 300;

/**
 * Destacados de la marca (estrella): la lista de los que hoy tienen estrella y
 * un buscador para sumar otros. La estrella se guarda al toque.
 */
export function BrandFeaturedPicker({ brandId, onChange }: { brandId: string; onChange: () => void }) {
  const [featured, setFeatured] = useState<BrandProductHit[] | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<BrandProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    let alive = true;
    searchBrandProducts(brandId, "")
      .then((rows) => alive && setFeatured(rows))
      .catch(() => alive && setError("No se pudieron cargar los destacados."));
    return () => {
      alive = false;
    };
  }, [brandId]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      searchBrandProducts(brandId, q)
        .then((rows) => alive && setHits(rows))
        .catch(() => alive && setError("No se pudo buscar."))
        .finally(() => alive && setSearching(false));
    }, SEARCH_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [brandId, query]);

  function toggle(product: BrandProductHit) {
    const next = !product.isFeatured;
    setBusyId(product.id);
    setError(null);
    start(async () => {
      const result = await setProductFeatured(product.id, next);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const updated = { ...product, isFeatured: next };
      setHits((rows) => rows.map((r) => (r.id === product.id ? updated : r)));
      setFeatured((rows) => (next ? [...(rows ?? []).filter((r) => r.id !== product.id), updated] : (rows ?? []).filter((r) => r.id !== product.id)));
      onChange();
    });
  }

  const row = (product: BrandProductHit) => (
    <li key={product.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-sm">
      <button
        type="button"
        onClick={() => toggle(product)}
        disabled={busyId === product.id}
        aria-pressed={product.isFeatured}
        title={product.isFeatured ? "Quitar la estrella: vuelve a su lugar por rubro" : "Destacar: sale arriba de todo al entrar a la marca"}
        className={cn("rounded p-1 hover:bg-secondary", product.isFeatured ? "text-accent" : "text-muted-foreground")}
      >
        {busyId === product.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className={cn("h-4 w-4", product.isFeatured ? "fill-current" : "")} />}
      </button>
      <span className="min-w-0 flex-1 truncate" title={product.title}>
        {product.title}
      </span>
      {product.subtitle ? <span className="hidden shrink-0 truncate text-xs text-muted-foreground sm:inline">{product.subtitle}</span> : null}
    </li>
  );

  return (
    <div className="space-y-2">
      {featured === null && !error ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Cargando destacados…
        </p>
      ) : null}
      {featured?.length === 0 ? <p className="rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">Ningún producto con estrella todavía.</p> : null}
      {featured?.length ? <ul className="space-y-1">{featured.map(row)}</ul> : null}

      <div className="relative" data-unsaved-guard="ignore">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar un producto de la marca para destacarlo…"
          className="h-9 pl-8 text-sm"
          aria-label="Buscar producto para destacar"
        />
        {searching ? <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
      </div>
      {query.trim().length >= 2 && !searching && hits.length === 0 ? <p className="text-xs text-muted-foreground">Sin productos activos con «{query.trim()}».</p> : null}
      {hits.length ? <ul className="space-y-1">{hits.map(row)}</ul> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
