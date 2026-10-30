"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addProductToQuote, searchProductsForQuote } from "@/server/actions/quotes";
import { addQuoteServiceToQuote, searchServicesForQuote } from "@/server/actions/quote-services";

const SERVICE = "svc:";
const usd = (n: number) => `USD ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
import { ProductSearchPicker, type PickerItem } from "@/components/products/product-search-picker";
import { productSubtitle, productTitle, tangoCode } from "@/lib/product-display";

export function QuoteProductPicker({
  quoteId,
  groupId,
  alternativeId,
}: {
  quoteId: string;
  groupId?: string | null;
  /** Alternativa que se está editando: el producto entra en su planilla. */
  alternativeId?: string | null;
}) {
  const router = useRouter();

  const search = useCallback(async (q: string): Promise<PickerItem[]> => {
    const [rows, services] = await Promise.all([searchProductsForQuote(q), searchServicesForQuote(q)]);
    // Servicios primero: son pocos y se buscan por nombre (instalación, visita, hora…).
    const serviceItems: PickerItem[] = services.map((s) => ({
      id: `${SERVICE}${s.id}`,
      title: s.name,
      subtitle: [s.priceUsd == null ? "Sin precio: se carga en la fila" : usd(s.priceUsd), s.description].filter(Boolean).join(" · ").slice(0, 160),
      brand: "Servicio",
      code: null,
      imageUrl: null,
    }));
    return [...serviceItems, ...rows.map((p) => ({
      id: p.id,
      title: productTitle(p),
      subtitle: productSubtitle(p),
      brand: p.brand?.name ?? null,
      code: tangoCode(p.internalSku),
      imageUrl: p.images[0]?.url ?? null,
    }))];
  }, []);

  async function addProduct(item: PickerItem) {
    if (item.id.startsWith(SERVICE)) {
      const r = await addQuoteServiceToQuote({ quoteId, serviceId: item.id.slice(SERVICE.length), groupId: groupId ?? null, alternativeId: alternativeId ?? null });
      if (!r.ok) return void toast.error(r.error || "No se pudo agregar el servicio.");
      toast.success(r.message || `${item.title} agregado.`);
      router.refresh();
      return;
    }
    const fd = new FormData();
    fd.set("quoteId", quoteId);
    fd.set("productId", item.id);
    fd.set("quantity", "1");
    if (groupId) fd.set("groupId", groupId);
    if (alternativeId) fd.set("alternativeId", alternativeId);
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
      <ProductSearchPicker label="Agregar producto o servicio" search={search} onPick={addProduct} />
    </div>
  );
}
