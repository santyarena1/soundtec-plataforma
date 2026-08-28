"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PackagePlus } from "lucide-react";
import { addProductToQuote, searchProductsForQuote } from "@/server/actions/quotes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Hit = Awaited<ReturnType<typeof searchProductsForQuote>>[number];

export function QuoteProductPicker({ quoteId, groupId }: { quoteId: string; groupId?: string | null }) {
  const router = useRouter();
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

  async function addProduct(productId: string) {
    const fd = new FormData();
    fd.set("quoteId", quoteId);
    fd.set("productId", productId);
    fd.set("quantity", "1");
    if (groupId) fd.set("groupId", groupId);
    const result = await addProductToQuote(fd);
    if (result && typeof result === "object" && "ok" in result && !result.ok) {
      toast.error(result.error || "No se pudo agregar el producto.");
      return;
    }
    toast.success("Producto agregado a la planilla.");
    setHits([]);
    setQ("");
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border bg-secondary/10 p-3">
      <p className="text-xs font-medium text-muted-foreground">Agregar desde catálogo</p>
      <Input
        value={q}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Nombre, marca, categoría, familia, SKU o descripción…"
        disabled={pending}
      />
      {hits.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-md border border-border bg-card shadow-sm">
          {hits.map((p) => {
            const sku = [p.internalSku, p.supplierSku, p.modelNumber].filter(Boolean).join(" · ");
            const meta = [p.brand?.name, p.category?.name, p.family?.name].filter(Boolean).join(" · ");
            return (
              <li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm hover:bg-secondary/30">
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{p.normalizedName}</p>
                  {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
                  {sku ? <p className="text-[11px] text-muted-foreground/80">{sku}</p> : null}
                  {p.shortDescription ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-foreground/70">{p.shortDescription}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await addProduct(p.id);
                    })
                  }
                >
                  <PackagePlus className="mr-1 h-3.5 w-3.5" />
                  Agregar
                </Button>
              </li>
            );
          })}
        </ul>
      ) : q.trim().length >= 2 && !pending ? (
        <p className="text-xs text-muted-foreground">Sin resultados. Probá con marca, SKU o palabras del nombre.</p>
      ) : null}
    </div>
  );
}
