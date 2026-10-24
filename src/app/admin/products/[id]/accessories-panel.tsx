"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { linkRelatedProduct, searchRelatableProducts, unlinkRelatedProduct, updateIncludedQuantity } from "@/server/actions/accessories";

type RelationKind = "ACCESSORY" | "INCLUDED";

export interface RelationItem {
  id: string;
  kind: RelationKind;
  isRequired: boolean;
  quantity: number | null;
  accessoryProduct: { id: string; normalizedName: string; internalSku: string | null; kind: "PRINCIPAL" | "ACCESORIO" };
}

type Found = Awaited<ReturnType<typeof searchRelatableProducts>>[number];

const KIND_COPY: Record<RelationKind, { title: string; help: string; empty: string }> = {
  INCLUDED: {
    title: "Incluido en la caja",
    help: "Lo que trae el producto (ej. soporte, fuente). La cotización rápida lo agrega solo, sin cargo, según la cantidad.",
    empty: "No tiene nada cargado como incluido.",
  },
  ACCESSORY: {
    title: "Accesorios compatibles",
    help: "Se ofrecen con el producto y en las sugerencias de la cotización. Al vincular, el accesorio pasa a tipo «Accesorio».",
    empty: "No tiene accesorios vinculados.",
  },
};

function AddRelation({ productId, kind, onDone }: { productId: string; kind: RelationKind; onDone: (error?: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [required, setRequired] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchRelatableProducts(query, productId)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, productId]);

  function link(found: Found) {
    start(async () => {
      const result = await linkRelatedProduct({ productId, relatedId: found.id, kind, quantity, isRequired: required });
      onDone(result.ok ? undefined : result.error);
      if (result.ok) {
        setQuery("");
        setResults([]);
      }
    });
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-secondary/40 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Label>Agregar</Label>
          <Search className="pointer-events-none absolute left-2.5 top-[2.15rem] h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscá por nombre, SKU o marca" className="pl-8" aria-label={`Buscar producto para «${KIND_COPY[kind].title}»`} />
        </div>
        {kind === "INCLUDED" ? (
          <div className="w-28">
            <Label>Por unidad</Label>
            <Input type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.round(Number(e.target.value) || 1)))} />
          </div>
        ) : (
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            Obligatorio
          </label>
        )}
      </div>
      {searching ? <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Buscando…</p> : null}
      {results.length ? (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {results.map((found) => (
            <li key={found.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{found.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[found.brand, found.sku].filter(Boolean).join(" · ")}
                  {!found.isActive ? " · inactivo" : ""}
                </span>
              </span>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => link(found)}>
                Agregar
              </Button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 && !searching ? (
        <p className="text-xs text-muted-foreground">Sin resultados.</p>
      ) : null}
    </div>
  );
}

function RelationList({ productId, kind, items, onDone }: { productId: string; kind: RelationKind; items: RelationItem[]; onDone: (error?: string) => void }) {
  const [pending, start] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const result = await action();
      onDone(result.ok ? undefined : result.error);
    });
  if (!items.length) return <p className="text-sm text-muted-foreground">{KIND_COPY[kind].empty}</p>;
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {items.map((relation) => (
        <li key={relation.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
          <Link href={`/admin/products/${relation.accessoryProduct.id}`} className="min-w-0 hover:underline">
            <span className="block truncate font-medium">{relation.accessoryProduct.normalizedName}</span>
            <span className="text-xs text-muted-foreground">{relation.accessoryProduct.internalSku || "Sin código"}</span>
          </Link>
          <div className="flex items-center gap-2">
            {kind === "INCLUDED" ? (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Por unidad
                <Input
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={relation.quantity ?? 1}
                  className="h-8 w-20"
                  disabled={pending}
                  onBlur={(e) => {
                    const next = Math.round(Number(e.currentTarget.value));
                    if (next !== (relation.quantity ?? 1)) run(() => updateIncludedQuantity({ id: relation.id, productId, quantity: next }));
                  }}
                />
              </label>
            ) : relation.isRequired ? (
              <Badge tone="warning">Obligatorio</Badge>
            ) : (
              <Badge tone="muted">Opcional</Badge>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              aria-label={`Quitar ${relation.accessoryProduct.normalizedName}`}
              onClick={() => {
                if (window.confirm(`¿Quitar «${relation.accessoryProduct.normalizedName}»?`)) run(() => unlinkRelatedProduct({ id: relation.id, productId }));
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AccessoriesPanel({ productId, relations }: { productId: string; relations: RelationItem[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const done = (message?: string) => {
    setError(message ?? null);
    if (!message) router.refresh();
  };
  return (
    <Card data-tour="product-accessories">
      <CardContent className="space-y-6 p-6">
        {(["INCLUDED", "ACCESSORY"] as const).map((kind) => (
          <section key={kind} className="space-y-3">
            <div>
              <h2 className="heading-3">{KIND_COPY[kind].title}</h2>
              <p className="text-xs text-muted-foreground">{KIND_COPY[kind].help}</p>
            </div>
            <RelationList productId={productId} kind={kind} items={relations.filter((r) => r.kind === kind)} onDone={done} />
            <AddRelation productId={productId} kind={kind} onDone={done} />
          </section>
        ))}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
