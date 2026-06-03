"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Loader2, Send, ArrowRight, CheckCircle2, Plus, Minus, ShoppingBag } from "lucide-react";
import { addToDraftRequest } from "@/server/actions/requests";
import { AccessoryWarningBlock } from "@/components/portal/accessory-warning";
import type { CompatiblePrimary } from "@/lib/accessory-context";
import { requestTypeLabel } from "@/lib/request-labels";
import { formatUsd } from "@/lib/utils";
import { showToast } from "@/components/portal/portal-toaster";

interface AccessoryContext {
  showWarning: boolean;
  warningMessage: string;
  compatiblePrimaries: CompatiblePrimary[];
}

interface Props {
  productId: string;
  draftRequestId: string;
  draftType: string;
  draftItemCount: number;
  productName?: string;
  unitPriceUsd?: number;
  accessoryContext?: AccessoryContext | null;
}

interface AddedDetail {
  addedQty: number;
  itemsTotal: number;
  unitsTotal: number;
}

export function AddToRequestPanel({
  productId,
  draftRequestId,
  draftType,
  draftItemCount,
  productName,
  unitPriceUsd = 0,
  accessoryContext,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<AddedDetail | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pendingAck, setPendingAck] = useState(false);

  const ackBlock = accessoryContext?.showWarning;

  function dec() {
    setQuantity((q) => Math.max(1, q - 1));
  }
  function inc() {
    setQuantity((q) => Math.min(9999, q + 1));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setAdded(null);

    if (ackBlock && !acknowledged) {
      setPendingAck(true);
      return;
    }

    const fd = new FormData(e.currentTarget);
    fd.set("productId", productId);
    fd.set("quantity", String(quantity));
    if (acknowledged) fd.set("ackAccessoryWarning", "true");

    start(async () => {
      const result = await addToDraftRequest(fd);
      if (result.requiresAcknowledgement && result.warningMessage) {
        setPendingAck(true);
        setAcknowledged(false);
        return;
      }
      if (!result.ok) {
        setError(result.error || "No se pudo agregar.");
        showToast({
          type: "error",
          title: "No se pudo agregar",
          description: result.error || "Reintentá en unos segundos.",
        });
        return;
      }
      setPendingAck(false);
      if (result.detail) {
        setAdded({
          addedQty: result.detail.addedQty,
          itemsTotal: result.detail.itemsTotal,
          unitsTotal: result.detail.unitsTotal,
        });
      }
      showToast({
        type: "success",
        title: `Agregaste ${result.detail?.addedQty ?? quantity} u. de «${productName || "este producto"}»`,
        description: "Quedó cargado en tu solicitud en armado.",
        requestId: draftRequestId,
        itemsTotal: result.detail?.itemsTotal,
        unitsTotal: result.detail?.unitsTotal,
      });
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden border-primary/20 shadow-md">
      <div className="border-b border-border bg-gradient-to-r from-primary/10 to-transparent px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <CardTitle className="text-lg">Agregar a tu solicitud</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {requestTypeLabel(draftType)} ·{" "}
              <Link href={`/portal/requests/${draftRequestId}`} className="underline hover:text-foreground">
                {draftItemCount} producto{draftItemCount === 1 ? "" : "s"} cargados
              </Link>
            </p>
          </div>
          <ShoppingBag className="h-5 w-5 text-primary shrink-0" />
        </div>
      </div>

      <CardContent className="space-y-4 p-5">
        {/* Feedback visible: card de éxito con totales actualizados */}
        {added ? (
          <div className="rounded-md border-l-4 border-success bg-success/10 p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              <p className="text-sm font-medium">
                Agregaste <span className="tabular-nums">{added.addedQty}</span>{" "}
                {added.addedQty === 1 ? "unidad" : "unidades"}
                {productName ? ` de «${productName}»` : ""}.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-md bg-card p-2 text-center">
              <div>
                <p className="text-base font-semibold tabular-nums">{added.itemsTotal}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  producto{added.itemsTotal === 1 ? "" : "s"}
                </p>
              </div>
              <div className="border-x border-border">
                <p className="text-base font-semibold tabular-nums">{added.unitsTotal}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">unidades</p>
              </div>
              <div>
                <Link
                  href={`/portal/requests/${draftRequestId}`}
                  className="inline-flex h-full items-center justify-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Ver <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        {(pendingAck || ackBlock) && accessoryContext ? (
          <AccessoryWarningBlock
            message={accessoryContext.warningMessage}
            compatiblePrimaries={accessoryContext.compatiblePrimaries}
            acknowledged={acknowledged}
            onAcknowledgedChange={setAcknowledged}
          />
        ) : null}

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label required>Cantidad</Label>
            <div className="flex items-stretch gap-1">
              <button
                type="button"
                onClick={dec}
                disabled={quantity <= 1 || pending}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-border hover:bg-secondary disabled:opacity-50"
                aria-label="Disminuir"
              >
                <Minus className="h-4 w-4" />
              </button>
              <Input
                name="quantity"
                type="number"
                min={1}
                max={9999}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                className="h-10 flex-1 text-center text-base font-medium"
              />
              <button
                type="button"
                onClick={inc}
                disabled={pending}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-border hover:bg-secondary disabled:opacity-50"
                aria-label="Aumentar"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {unitPriceUsd > 0 ? (
              <p className="text-xs text-muted-foreground">
                Subtotal previsto:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatUsd(unitPriceUsd * quantity)}
                </span>
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="userNotes">Notas para Soundtec (opcional)</Label>
            <Textarea
              id="userNotes"
              name="userNotes"
              rows={2}
              placeholder="Plazos, características especiales, color, etc."
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button
            type="submit"
            disabled={pending || Boolean(ackBlock && !acknowledged)}
            className="w-full"
            size="lg"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Agregar a mi solicitud
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
