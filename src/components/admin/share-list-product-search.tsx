"use client";

import { useCallback, useMemo } from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductSearchPicker, type PickerItem } from "@/components/products/product-search-picker";
import { searchProductsForShareList } from "@/server/actions/shareable-price-lists";

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
  const brandKey = brandIds.join(",");
  const categoryKey = categoryIds.join(",");
  const search = useCallback(
    (q: string): Promise<PickerItem[]> => searchProductsForShareList({ q, brandIds, categoryIds, take: 50 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandKey, categoryKey],
  );
  const pickedIds = useMemo(() => new Set(selected.map((item) => item.id)), [selected]);

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <Label>{label}</Label>
      {selected.length ? (
        <div className="flex flex-wrap gap-1">
          {selected.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Sacar ${item.name}`}
              onClick={() => onChange(selected.filter((value) => value.id !== item.id))}
            >
              {item.name} {item.sku ? `· ${item.sku}` : ""} <X className="h-3 w-3" />
            </Button>
          ))}
        </div>
      ) : null}
      <ProductSearchPicker
        search={search}
        minChars={0}
        clearOnPick={false}
        pickedIds={pickedIds}
        onPick={(item) => onChange([...selected, { id: item.id, name: item.title, sku: item.code ?? null }])}
      />
    </div>
  );
}
