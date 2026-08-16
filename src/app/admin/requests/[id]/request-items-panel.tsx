"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Minus, Package, Plus, Repeat, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { formatUsd } from "@/lib/utils";
import { adminRemoveRequestItem, adminUpdateRequestItem } from "@/server/actions/requests";
import { SuggestProductDialog, type ReplaceTarget } from "./suggest-product-dialog";

export interface RequestItemRow {
  id: string;
  productId: string;
  productName: string;
  brand: string | null;
  quantity: number;
  unitPriceUsd: number;
  userNotes: string | null;
  adminNotes: string | null;
  isAdminSuggestion: boolean;
  /** Nombre del producto original que esta sugerencia viene a reemplazar. */
  replacesProductName: string | null;
}

interface Props {
  requestId: string;
  items: RequestItemRow[];
  readOnly?: boolean;
}

export function RequestItemsPanel({ requestId, items, readOnly = false }: Props) {
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<ReplaceTarget>(null);
  const [removing, setRemoving] = useState<RequestItemRow | null>(null);
  const [removePending, startRemove] = useTransition();
  const router = useRouter();

  const requested = items.filter((i) => !i.isAdminSuggestion);
  const suggested = items.filter((i) => i.isAdminSuggestion);

  const requestedTotal = requested.reduce((acc, i) => acc + i.unitPriceUsd * i.quantity, 0);
  const suggestedTotal = suggested.reduce((acc, i) => acc + i.unitPriceUsd * i.quantity, 0);

  function openSuggestFor(item: RequestItemRow | null) {
    setReplaceTarget(item ? { id: item.id, productName: item.productName } : null);
    setSuggestOpen(true);
  }

  function confirmRemove() {
    if (!removing) return;
    const item = removing;
    startRemove(async () => {
      const r = await adminRemoveRequestItem({ itemId: item.id });
      if (r.ok) {
        toast.success("Producto quitado", { description: `${item.productName} ya no figura en la solicitud.` });
        setRemoving(null);
        router.refresh();
      } else {
        toast.error(r.error || "No se pudo quitar el producto.");
      }
    });
  }

  return (
    <>
      <div className="space-y-5">
        <Section
          title="Lo que pidió el cliente"
          icon={<Package className="h-4 w-4 text-muted-foreground" />}
          count={requested.length}
          total={requestedTotal}
          emptyMessage="El cliente no cargó productos, solo escribió una consulta."
        >
          {requested.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              readOnly={readOnly}
              onSuggestAlternative={() => openSuggestFor(item)}
              onRemove={() => setRemoving(item)}
            />
          ))}
        </Section>

        <Section
          title="Sugerencias del equipo"
          icon={<Sparkles className="h-4 w-4 text-accent" />}
          count={suggested.length}
          total={suggestedTotal}
          emptyMessage="Todavía no le propusiste nada. Podés sumar un producto alternativo o complementario."
          tone="accent"
        >
          {suggested.map((item) => (
            <ItemRow key={item.id} item={item} readOnly={readOnly} onRemove={() => setRemoving(item)} />
          ))}
        </Section>

        {!readOnly ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-accent/40 bg-accent/5 p-4">
            <div>
              <p className="text-sm font-medium">¿Le proponés otro producto?</p>
              <p className="text-xs text-muted-foreground">
                Buscá en el catálogo con el precio que ve este cliente y agregalo como sugerencia.
              </p>
            </div>
            <Button size="sm" onClick={() => openSuggestFor(null)}>
              <Sparkles className="h-4 w-4" />
              Sugerir producto
            </Button>
          </div>
        ) : null}
      </div>

      <SuggestProductDialog
        open={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        requestId={requestId}
        replaceTarget={replaceTarget}
        originalItems={requested.map((i) => ({ id: i.id, productName: i.productName }))}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        pending={removePending}
        tone="destructive"
        title="Quitar producto de la solicitud"
        confirmLabel="Sí, quitar"
        description={
          removing ? (
            <>
              Vas a quitar <strong className="text-foreground">{removing.quantity} × {removing.productName}</strong>. El
              cliente va a ver el cambio en su portal y no se puede deshacer.
            </>
          ) : null
        }
      />
    </>
  );
}

function Section({
  title,
  icon,
  count,
  total,
  emptyMessage,
  tone = "neutral",
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  total: number;
  emptyMessage: string;
  tone?: "neutral" | "accent";
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
          <Badge tone={tone === "accent" ? "accent" : "muted"}>{count}</Badge>
        </h3>
        {count > 0 ? (
          <p className="text-xs text-muted-foreground">
            Subtotal <span className="font-semibold text-foreground">{formatUsd(total)}</span>
          </p>
        ) : null}
      </div>
      {count === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">{children}</ul>
      )}
    </section>
  );
}

function ItemRow({
  item,
  readOnly,
  onSuggestAlternative,
  onRemove,
}: {
  item: RequestItemRow;
  readOnly: boolean;
  onSuggestAlternative?: () => void;
  onRemove: () => void;
}) {
  return (
    <li className={`p-3 ${item.isAdminSuggestion ? "bg-accent/5" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link href={`/admin/products/${item.productId}`} className="text-sm font-medium hover:underline">
            {item.productName}
          </Link>
          <p className="text-xs text-muted-foreground">{item.brand || "Sin marca"}</p>

          {item.replacesProductName ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-accent">
              <Repeat className="h-3 w-3" />
              En reemplazo de {item.replacesProductName}
            </p>
          ) : null}
          {item.userNotes ? (
            <p className="mt-1 rounded bg-secondary/60 px-2 py-1 text-xs text-muted-foreground">
              Nota del cliente: {item.userNotes}
            </p>
          ) : null}
          {item.adminNotes ? (
            <p className="mt-1 rounded bg-accent/10 px-2 py-1 text-xs text-accent">Tu nota: {item.adminNotes}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-4">
          <QuantityControl itemId={item.id} quantity={item.quantity} readOnly={readOnly} />
          <div className="w-28 text-right">
            <p className="text-sm font-semibold tabular-nums">{formatUsd(item.unitPriceUsd * item.quantity)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{formatUsd(item.unitPriceUsd)} c/u</p>
          </div>
          {!readOnly ? (
            <div className="flex items-center gap-1">
              {onSuggestAlternative ? (
                <Button variant="ghost" size="sm" onClick={onSuggestAlternative} title="Proponer un reemplazo">
                  <Repeat className="h-3.5 w-3.5" />
                  Alternativa
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemove}
                className="text-destructive hover:bg-destructive/10"
                aria-label={`Quitar ${item.productName}`}
                title="Quitar de la solicitud"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function QuantityControl({ itemId, quantity, readOnly }: { itemId: string; quantity: number; readOnly: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  if (readOnly) {
    return <span className="text-sm tabular-nums">{quantity} u.</span>;
  }

  function commit(next: number) {
    if (next < 1 || next > 9999 || next === quantity) return;
    start(async () => {
      const r = await adminUpdateRequestItem({ itemId, quantity: next });
      if (r.ok) {
        toast.success(`Cantidad actualizada a ${next}`);
        router.refresh();
      } else {
        toast.error(r.error || "No se pudo actualizar la cantidad.");
      }
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        disabled={pending || quantity <= 1}
        onClick={() => commit(quantity - 1)}
        aria-label="Restar una unidad"
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="w-10 text-center text-sm font-medium tabular-nums">
        {pending ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : quantity}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        disabled={pending}
        onClick={() => commit(quantity + 1)}
        aria-label="Sumar una unidad"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
