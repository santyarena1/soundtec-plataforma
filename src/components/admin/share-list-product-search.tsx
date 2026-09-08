"use client";

import { useEffect, useState } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchProductsForShareList } from "@/server/actions/shareable-price-lists";
import { Search, X } from "lucide-react";

export type ShareProductOption = { id: string; name: string; sku: string | null };

export function ShareListProductSearch({
  label,
  selected,
  onChange,
  brandIds,
  categoryIds,
}: {
  label: string;
  selected: ShareProductOption[];
  onChange: (items: ShareProductOption[]) => void;
  brandIds: string[];
  categoryIds: string[];
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ShareProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const brandKey = brandIds.join(",");
  const categoryKey = categoryIds.join(",");

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      searchProductsForShareList({ q, brandIds, categoryIds, take: 50 })
        .then(setResults)
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [q, brandKey, categoryKey]);

  const chosen = new Set(selected.map((item) => item.id));
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <Label>{label}</Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8"
          placeholder="Buscá por nombre o SKU…"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {selected.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(selected.filter((value) => value.id !== item.id))}
          >
            {item.name} {item.sku ? `· ${item.sku}` : ""} <X className="h-3 w-3" />
          </Button>
        ))}
      </div>
      <div className="max-h-44 overflow-y-auto rounded border border-border">
        {loading ? (
          <p className="p-2 text-xs text-muted-foreground">Buscando…</p>
        ) : (
          results.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={chosen.has(item.id)}
              onClick={() => onChange([...selected, item])}
              className="block w-full border-b border-border px-3 py-2 text-left text-sm hover:bg-secondary disabled:opacity-40"
            >
              {item.name}{" "}
              <span className="text-xs text-muted-foreground">{item.sku || "Sin SKU"}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
