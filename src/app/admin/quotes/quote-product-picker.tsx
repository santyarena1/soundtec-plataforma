"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addProductToQuote, searchProductsForQuote } from "@/server/actions/quotes";
import { ProductSearchPicker, type PickerItem } from "@/components/products/product-search-picker";
import { productSubtitle, productTitle, tangoCode } from "@/lib/product-display";

export function QuoteProductPicker({ quoteId, groupId }: { quoteId: string; groupId?: string | null }) {
  const router = useRouter();

  const search = useCallback(async (q: string): Promise<PickerItem[]> => {
    const rows = await searchProductsForQuote(q);
    return rows.map((p) => ({
      id: p.id,
      title: productTitle(p),
      subtitle: productSubtitle(p),
      brand: p.brand?.name ?? null,
      code: tangoCode(p.internalSku),
      imageUrl: p.images[0]?.url ?? null,
    }));
  }, []);

  async function addProduct(item: PickerItem) {
    const fd = new FormData();
    fd.set("quoteId", quoteId);
    fd.set("productId", item.id);
    fd.set("quantity", "1");
    if (groupId) fd.set("groupId", groupId);
    const result = await addProductToQuote(fd);
    if (result && typeof result === "object" && "ok" in result && !result.ok) {
      toast.error(result.error || "No se pudo agregar el producto.");
      return;
    }
    toast.success(`${item.title} agregado a la cotización.`);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-secondary/10 p-3">
      <ProductSearchPicker label="Agregar producto del catálogo" search={search} onPick={addProduct} />
    </div>
  );
}
