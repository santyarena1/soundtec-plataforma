"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { addAdminSuggestion } from "@/server/actions/requests";
import { Loader2, Sparkles, Search } from "lucide-react";

type ProductOption = { id: string; name: string; sku: string | null; brand: string | null };

type ItemRef = { id: string; productName: string };

interface Props {
  requestId: string;
  products: ProductOption[];
  existingItems: ItemRef[];
}

export function AddSuggestionPanel({ requestId, products, existingItems }: Props) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [adminNotes, setAdminNotes] = useState("");
  const [replacesItemId, setReplacesItemId] = useState("");
  const [search, setSearch] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  const filteredProducts = search.trim()
    ? products.filter((p) =>
        `${p.name} ${p.sku || ""} ${p.brand || ""}`.toLowerCase().includes(search.toLowerCase())
      )
    : products.slice(0, 200);

  function submit() {
    setMsg(null);
    if (!productId) {
      setMsg({ ok: false, text: "Seleccioná un producto para sugerir." });
      return;
    }
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("requestId", requestId);
        fd.set("productId", productId);
        fd.set("quantity", quantity || "1");
        if (adminNotes) fd.set("adminNotes", adminNotes);
        if (replacesItemId) fd.set("replacesItemId", replacesItemId);
        const r = await addAdminSuggestion(fd);
        if (r.ok) {
          setMsg({ ok: true, text: "Sugerencia agregada y notificada al cliente." });
          setProductId("");
          setQuantity("1");
          setAdminNotes("");
          setReplacesItemId("");
          setSearch("");
          router.refresh();
        } else {
          setMsg({ ok: false, text: r.error || "No se pudo agregar." });
        }
      } catch {
        setMsg({ ok: false, text: "Error inesperado." });
      }
    });
  }

  return (
    <div className="rounded-md border border-accent/30 bg-accent/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold">Sugerir producto al cliente</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Agregá un producto como propuesta. Se marcará como sugerencia del equipo y el cliente lo verá destacado en su solicitud.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Buscar producto</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrá por nombre, SKU o marca..."
              className="h-9 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <Label required>Producto sugerido</Label>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Seleccionar producto</option>
            {filteredProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.sku ? ` · ${p.sku}` : ""}
                {p.brand ? ` · ${p.brand}` : ""}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Cantidad</Label>
          <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div>
          <Label>Reemplaza al ítem original (opcional)</Label>
          <Select value={replacesItemId} onChange={(e) => setReplacesItemId(e.target.value)}>
            <option value="">No reemplaza nada</option>
            {existingItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.productName}
              </option>
            ))}
          </Select>
        </div>

        <div className="sm:col-span-2">
          <Label>Nota para el cliente (opcional)</Label>
          <Textarea
            rows={2}
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            placeholder="Ej: Mismo rendimiento, mejor precio y disponibilidad inmediata."
          />
        </div>
      </div>

      {msg ? (
        <p className={`mt-2 text-sm ${msg.ok ? "text-success" : "text-destructive"}`}>{msg.text}</p>
      ) : null}

      <div className="mt-3 flex justify-end">
        <Button onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Agregar sugerencia
        </Button>
      </div>
    </div>
  );
}
