"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toggleProductCrestron } from "@/server/actions/crestron-home";

interface Product {
  id: string;
  internalSku: string | null;
  normalizedName: string;
  isCrestronHomeCompatible: boolean;
}

export function ProductCompatList({ products }: { products: Product[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const filtered = query.trim()
    ? products.filter(
        (p) =>
          p.normalizedName.toLowerCase().includes(query.toLowerCase()) ||
          (p.internalSku ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : products;

  function handleToggle(product: Product) {
    setTogglingId(product.id);
    start(async () => {
      await toggleProductCrestron(product.id, !product.isCrestronHomeCompatible);
      router.refresh();
      setTogglingId(null);
    });
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre o código..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="divide-y divide-border rounded-lg border">
        {filtered.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">Sin resultados.</p>
        )}
        {filtered.map((p) => {
          const isToggling = pending && togglingId === p.id;
          return (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.normalizedName}</p>
                {p.internalSku && (
                  <p className="text-xs text-muted-foreground">{p.internalSku}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {p.isCrestronHomeCompatible && (
                  <Badge tone="primary">Compatible</Badge>
                )}
                <button
                  type="button"
                  onClick={() => handleToggle(p)}
                  disabled={isToggling || (pending && togglingId !== p.id)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                    p.isCrestronHomeCompatible ? "bg-primary" : "bg-input"
                  }`}
                  aria-label={p.isCrestronHomeCompatible ? "Quitar compatibilidad" : "Marcar como compatible"}
                >
                  {isToggling ? (
                    <Loader2 className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
                  ) : (
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${
                        p.isCrestronHomeCompatible ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
