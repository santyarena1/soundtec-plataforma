"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  attachProductImage,
  deleteProductImage,
  searchProductImagesAction,
  setPrimaryImage,
} from "@/server/actions/product-enrichment";
import { ConfirmSubmit } from "@/components/ui/confirm-button";

interface Image {
  id: string;
  url: string;
  alt: string | null;
  isPrimary: boolean;
  source: string | null;
}

interface SerperResult {
  url: string;
  title: string;
  thumbnail?: string;
}

interface Props {
  productId: string;
  productName: string;
  images: Image[];
}

export function ProductImagesPanel({ productId, productName, images }: Props) {
  const [query, setQuery] = useState(productName);
  const [results, setResults] = useState<SerperResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSearch() {
    setError(null);
    startTransition(async () => {
      const r = await searchProductImagesAction(productId, query);
      if (!r.ok) setError(r.error || "No se pudo buscar imágenes.");
      setResults(r.images);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="heading-3">Imágenes del producto</h2>
            <p className="text-xs text-muted-foreground">
              Adjuntá imágenes manualmente o buscalas con Serper (Google Images).
            </p>
          </div>
        </div>

        {images.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((img) => (
              <div key={img.id} className="overflow-hidden rounded-md border border-border">
                <div className="aspect-square bg-secondary">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.alt || ""} className="h-full w-full object-cover" />
                </div>
                <div className="flex items-center justify-between gap-1 p-2">
                  <div className="flex flex-col gap-1">
                    {img.isPrimary ? <Badge tone="accent">Principal</Badge> : null}
                    <span className="text-[10px] text-muted-foreground">{img.source || "manual"}</span>
                  </div>
                  <div className="flex gap-1">
                    {!img.isPrimary ? (
                      <form action={setPrimaryImage}>
                        <input type="hidden" name="id" value={img.id} />
                        <input type="hidden" name="productId" value={productId} />
                        <button type="submit" className="text-[10px] text-accent underline">Principal</button>
                      </form>
                    ) : null}
                    <form action={deleteProductImage}>
                      <input type="hidden" name="id" value={img.id} />
                      <input type="hidden" name="productId" value={productId} />
                      <ConfirmSubmit confirmMessage="Quitar esta imagen?" className="text-[10px]">Quitar</ConfirmSubmit>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Este producto todavía no tiene imágenes.</p>
        )}

        <form action={attachProductImage} className="grid gap-3 rounded-md border border-border bg-secondary/50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="productId" value={productId} />
          <div>
            <Label htmlFor="manualUrl">URL manual</Label>
            <Input id="manualUrl" name="url" type="url" placeholder="https://..." required />
          </div>
          <div>
            <Label htmlFor="manualAlt">Texto alternativo</Label>
            <Input id="manualAlt" name="alt" placeholder="Descripción breve" />
          </div>
          <Button type="submit" size="sm">Adjuntar</Button>
        </form>

        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="serperQuery">Búsqueda en Serper</Label>
              <Input
                id="serperQuery"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ej. Shure SLXD24/SM58"
              />
            </div>
            <Button type="button" size="sm" onClick={handleSearch} disabled={pending}>
              {pending ? "Buscando…" : "Buscar imágenes"}
            </Button>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {results.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {results.map((r) => (
                <form key={r.url} action={attachProductImage} className="flex flex-col overflow-hidden rounded-md border border-border bg-card">
                  <input type="hidden" name="productId" value={productId} />
                  <input type="hidden" name="url" value={r.url} />
                  <input type="hidden" name="alt" value={r.title} />
                  <div className="aspect-square bg-secondary">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.thumbnail || r.url} alt={r.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="p-2">
                    <p className="line-clamp-2 text-[11px] text-muted-foreground">{r.title}</p>
                    <button type="submit" className="mt-1 text-xs font-medium text-accent underline">
                      Adjuntar
                    </button>
                  </div>
                </form>
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
