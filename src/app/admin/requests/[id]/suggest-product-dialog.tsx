"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { formatUsd } from "@/lib/utils";
import { addAdminSuggestion, adminSearchProductsForRequest } from "@/server/actions/requests";
import { ProductSearchPicker, type PickerItem } from "@/components/products/product-search-picker";

type Found = { id: string; name: string; sku: string | null; brand: string | null; priceUsd: number | null };

export type ReplaceTarget = { id: string; productName: string } | null;

interface Props {
  open: boolean;
  onClose: () => void;
  requestId: string;
  /** Ítems originales del cliente, para elegir cuál reemplaza la sugerencia. */
  originalItems: Array<{ id: string; productName: string }>;
  /** Si se abre desde un ítem puntual, ya viene elegido a quién reemplaza. */
  replaceTarget?: ReplaceTarget;
}

export function SuggestProductDialog({ open, onClose, requestId, originalItems, replaceTarget = null }: Props) {
  const router = useRouter();
  const found = useRef(new Map<string, Found>());
  const [selected, setSelected] = useState<Found | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [replacesItemId, setReplacesItemId] = useState("");
  const [announce, setAnnounce] = useState(true);
  const [saving, startSaving] = useTransition();
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setQuantity("1");
    setNote("");
    setAnnounce(true);
    setReplacesItemId(replaceTarget?.id ?? "");
  }, [open, replaceTarget]);

  const search = useCallback(
    async (term: string): Promise<PickerItem[]> => {
      const r = await adminSearchProductsForRequest({ requestId, query: term });
      if (!r.ok && r.error) toast.error(r.error);
      found.current = new Map(r.products.map((p) => [p.id, p]));
      return r.products.map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: p.subtitle,
        brand: p.brand,
        code: p.sku,
        imageUrl: p.imageUrl,
        price: p.priceUsd,
      }));
    },
    [requestId],
  );

  function save() {
    if (!selected) return;
    startSaving(async () => {
      const r = await addAdminSuggestion({
        requestId,
        productId: selected.id,
        quantity: Number(quantity) || 1,
        adminNotes: note.trim() || null,
        replacesItemId: replacesItemId || null,
        announce,
      });
      if (r.ok) {
        toast.success("Sugerencia agregada", {
          description: announce
            ? `${quantity} × ${selected.name}. El cliente ya la ve en su portal y le avisamos en la conversación.`
            : `${quantity} × ${selected.name}. El cliente la ve en su portal.`,
        });
        router.refresh();
        onClose();
      } else {
        toast.error(r.error || "No se pudo agregar la sugerencia.");
      }
    });
  }

  const replacedName =
    replacesItemId ? originalItems.find((i) => i.id === replacesItemId)?.productName ?? null : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={<Sparkles className="h-4 w-4 text-accent" />}
      title={selected ? "Confirmá la sugerencia" : "Sugerir un producto al cliente"}
      description={
        selected
          ? "Revisá cantidad y nota. El cliente lo verá destacado como propuesta del equipo."
          : "Buscá por modelo, marca o código. Los precios son los que ve este cliente."
      }
      footer={
        selected ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)} disabled={saving}>
              <ArrowLeft className="h-4 w-4" />
              Elegir otro
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Agregar sugerencia
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
        )
      }
    >
      {selected ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
            <p className="text-sm font-semibold">{selected.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[selected.brand, selected.sku].filter(Boolean).join(" · ") || "Sin marca ni SKU"}
            </p>
            <p className="mt-2 text-sm">
              <span className="text-muted-foreground">Precio para este cliente: </span>
              <span className="font-semibold">{selected.priceUsd != null ? formatUsd(selected.priceUsd) : "—"}</span>
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="suggest-qty">Cantidad</Label>
              <Input
                id="suggest-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1"
              />
              {selected.priceUsd != null ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Subtotal: {formatUsd(selected.priceUsd * (Number(quantity) || 0))}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="suggest-replaces">¿Reemplaza algo que pidió?</Label>
              <Select
                id="suggest-replaces"
                value={replacesItemId}
                onChange={(e) => setReplacesItemId(e.target.value)}
                className="mt-1"
              >
                <option value="">No, es un agregado</option>
                {originalItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    Reemplaza a {i.productName}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="suggest-note">Por qué se lo sugerís (lo lee el cliente)</Label>
            <Textarea
              id="suggest-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej: mismo rendimiento que el que pediste, mejor precio y entrega inmediata."
              className="mt-1"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3">
            <input
              type="checkbox"
              checked={announce}
              onChange={(e) => setAnnounce(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
            />
            <span className="text-sm">
              Avisarle en la conversación
              <span className="block text-xs text-muted-foreground">
                {announce
                  ? `Se publica un mensaje contándole ${replacedName ? `que le proponés cambiar ${replacedName}` : "la sugerencia"}.`
                  : "La sugerencia aparece en su lista de productos, sin mensaje."}
              </span>
            </span>
          </label>
        </div>
      ) : (
        <ProductSearchPicker
          autoFocus
          showPrice
          actionLabel="Elegir"
          clearOnPick={false}
          search={search}
          onPick={(item) => {
            const product = found.current.get(item.id);
            if (product) setSelected(product);
          }}
        />
      )}
    </Modal>
  );
}
