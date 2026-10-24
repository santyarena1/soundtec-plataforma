"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { linkRelatedProduct, searchRelatableProducts, unlinkRelatedProduct, updateIncludedQuantity } from "@/server/actions/accessories";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { ProductSearchPicker, type PickerItem } from "@/components/products/product-search-picker";

type RelationKind = "ACCESSORY" | "INCLUDED";

export interface RelationItem {
  id: string;
  kind: RelationKind;
  isRequired: boolean;
  quantity: number | null;
  accessoryProduct: { id: string; normalizedName: string; internalSku: string | null; kind: "PRINCIPAL" | "ACCESORIO" };
}

const KIND_COPY: Record<RelationKind, { title: string; help: string; empty: string }> = {
  INCLUDED: {
    title: "Incluido en la caja",
    help: "Lo que trae el producto (ej. soporte, fuente). La cotización rápida lo agrega solo, sin cargo, según la cantidad.",
    empty: "No tiene nada cargado como incluido.",
  },
  ACCESSORY: {
    title: "Accesorios compatibles",
    help: "Se ofrecen con el producto y en las sugerencias de la cotización. Al vincular, el accesorio pasa a tipo «Accesorio».",
    empty: "No tiene accesorios vinculados.",
  },
};

function AddRelation({ productId, kind, onDone }: { productId: string; kind: RelationKind; onDone: (error?: string) => void }) {
  const [quantity, setQuantity] = useState(1);
  const [required, setRequired] = useState(false);

  const search = useCallback((q: string): Promise<PickerItem[]> => searchRelatableProducts(q, productId), [productId]);

  async function link(found: PickerItem) {
    const result = await linkRelatedProduct({ productId, relatedId: found.id, kind, quantity, isRequired: required });
    onDone(result.ok ? undefined : result.error);
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-secondary/40 p-3">
      {kind === "INCLUDED" ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">Viene</span>
          <Input
            type="number"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.round(Number(e.target.value) || 1)))}
            className="w-20"
            aria-label="Unidades por cada producto"
          />
          <span className="text-muted-foreground">por cada producto</span>
        </div>
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Obligatorio
        </label>
      )}
      <ProductSearchPicker label={`Agregar a «${KIND_COPY[kind].title}»`} search={search} onPick={link} />
    </div>
  );
}

function RelationList({ productId, kind, items, onDone }: { productId: string; kind: RelationKind; items: RelationItem[]; onDone: (error?: string) => void }) {
  const [pending, start] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const result = await action();
      onDone(result.ok ? undefined : result.error);
    });
  if (!items.length) return <p className="text-sm text-muted-foreground">{KIND_COPY[kind].empty}</p>;
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {items.map((relation) => (
        <li key={relation.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
          <Link href={`/admin/products/${relation.accessoryProduct.id}`} className="min-w-0 hover:underline">
            <span className="block truncate font-medium">{relation.accessoryProduct.normalizedName}</span>
            <span className="text-xs text-muted-foreground">{relation.accessoryProduct.internalSku || "Sin código"}</span>
          </Link>
          <div className="flex items-center gap-2">
            {kind === "INCLUDED" ? (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Por unidad
                <Input
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={relation.quantity ?? 1}
                  className="h-8 w-20"
                  disabled={pending}
                  onBlur={(e) => {
                    const next = Math.round(Number(e.currentTarget.value));
                    if (next !== (relation.quantity ?? 1)) run(() => updateIncludedQuantity({ id: relation.id, productId, quantity: next }));
                  }}
                />
              </label>
            ) : relation.isRequired ? (
              <Badge tone="warning">Obligatorio</Badge>
            ) : (
              <Badge tone="muted">Opcional</Badge>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              aria-label={`Quitar ${relation.accessoryProduct.normalizedName}`}
              onClick={async () => {
                if (await confirmDialog({ message: `¿Quitar «${relation.accessoryProduct.normalizedName}»?`, tone: "danger", confirmLabel: "Quitar" }))
                  run(() => unlinkRelatedProduct({ id: relation.id, productId }));
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AccessoriesPanel({ productId, relations }: { productId: string; relations: RelationItem[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const done = (message?: string) => {
    setError(message ?? null);
    if (!message) router.refresh();
  };
  return (
    <Card data-tour="product-accessories">
      <CardContent className="space-y-6 p-6">
        {(["INCLUDED", "ACCESSORY"] as const).map((kind) => (
          <section key={kind} className="space-y-3">
            <div>
              <h2 className="heading-3">{KIND_COPY[kind].title}</h2>
              <p className="text-xs text-muted-foreground">{KIND_COPY[kind].help}</p>
            </div>
            <RelationList productId={productId} kind={kind} items={relations.filter((r) => r.kind === kind)} onDone={done} />
            <AddRelation productId={productId} kind={kind} onDone={done} />
          </section>
        ))}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
