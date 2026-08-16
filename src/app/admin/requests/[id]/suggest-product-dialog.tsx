"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, PackageSearch, Search, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { formatUsd } from "@/lib/utils";
import { addAdminSuggestion, adminSearchProductsForRequest } from "@/server/actions/requests";

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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Found | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [replacesItemId, setReplacesItemId] = useState("");
  const [announce, setAnnounce] = useState(true);
  const [saving, startSaving] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSearched(false);
    setSelected(null);
    setQuantity("1");
    setNote("");
    setAnnounce(true);
    setReplacesItemId(replaceTarget?.id ?? "");
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open, replaceTarget]);

  // Búsqueda con debounce: escribís y los resultados llegan solos.
  useEffect(() => {
    if (!open || selected) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const r = await adminSearchProductsForRequest({ requestId, query: term });
        if (cancelled) return;
        setResults(r.products);
        setSearched(true);
        if (!r.ok && r.error) toast.error(r.error);
      } catch {
        if (!cancelled) toast.error("No se pudo buscar productos.");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, requestId, selected]);

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
          : "Buscá por nombre, SKU o marca. Los precios son los que ve este cliente."
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
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej: amplificador, SON-12345, Sonance…"
              className="pl-9"
            />
            {searching ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          {query.trim().length < 2 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <PackageSearch className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Escribí al menos 2 letras para buscar</p>
            </div>
          ) : searched && results.length === 0 && !searching ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <PackageSearch className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Sin resultados para “{query.trim()}”</p>
              <p className="text-xs text-muted-foreground/70">Probá con la marca o parte del SKU.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[p.brand, p.sku].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {p.priceUsd != null ? formatUsd(p.priceUsd) : "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
