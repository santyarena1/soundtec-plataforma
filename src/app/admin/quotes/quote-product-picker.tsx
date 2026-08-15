"use client";

import { useState, useTransition } from "react";
import { addProductToQuote, searchProductsForQuote } from "@/server/actions/quotes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Hit = Awaited<ReturnType<typeof searchProductsForQuote>>[number];

export function QuoteProductPicker({ quoteId }: { quoteId: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [pending, start] = useTransition();

  function onSearch(value: string) {
    setQ(value);
    if (value.trim().length < 2) {
      setHits([]);
      return;
    }
    start(async () => {
      const rows = await searchProductsForQuote(value);
      setHits(rows);
    });
  }

  return (
    <div className="space-y-2">
      <Input
        value={q}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Buscar en catálogo: modelo, SKU, marca…"
      />
      {hits.length > 0 ? (
        <ul className="divide-y rounded-md border border-border bg-card">
          {hits.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {p.brand?.name ? `${p.brand.name} · ` : ""}
                  {p.normalizedName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[p.internalSku, p.supplierSku, p.modelNumber].filter(Boolean).join(" · ") || "Sin SKU"}
                </p>
              </div>
              <form
                action={async () => {
                  const fd = new FormData();
                  fd.set("quoteId", quoteId);
                  fd.set("productId", p.id);
                  fd.set("quantity", "1");
                  await addProductToQuote(fd);
                  setHits([]);
                  setQ("");
                }}
              >
                <Button type="submit" size="sm" variant="outline" disabled={pending}>
                  Agregar
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
