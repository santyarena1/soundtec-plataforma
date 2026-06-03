"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToDraftRequest } from "@/server/actions/requests";
import { AccessoryWarningBlock } from "@/components/portal/accessory-warning";
import type { CompatiblePrimary } from "@/lib/accessory-context";
import { Button } from "@/components/ui/button";
import { Plus, Check, Loader2 } from "lucide-react";
import { showToast } from "@/components/portal/portal-toaster";

interface Props {
  productId: string;
  productName: string;
  quantity?: number;
  compact?: boolean;
}

export function AddToDraftButton({ productId, productName, quantity = 1, compact = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [justAdded, setJustAdded] = useState(false);
  const [pendingAck, setPendingAck] = useState<{
    warningMessage: string;
    compatiblePrimaries: CompatiblePrimary[];
  } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  function runAdd(withAck: boolean) {
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("productId", productId);
        fd.set("quantity", String(quantity));
        if (withAck) fd.set("ackAccessoryWarning", "true");

        const result = await addToDraftRequest(fd);
        if (result.requiresAcknowledgement && result.warningMessage) {
          setPendingAck({
            warningMessage: result.warningMessage,
            compatiblePrimaries: result.compatiblePrimaries || [],
          });
          setAcknowledged(false);
          return;
        }
        if (!result?.ok) {
          showToast({
            type: "error",
            title: "No se pudo agregar",
            description: result?.error || "Reintentá en unos segundos.",
          });
          return;
        }
        setPendingAck(null);
        // Toast global con totales y CTA
        showToast({
          type: "success",
          title: `Agregaste ${result.detail?.addedQty ?? quantity} u. de «${productName}»`,
          description: "Quedó cargado en tu solicitud en armado.",
          requestId: result.requestId,
          itemsTotal: result.detail?.itemsTotal,
          unitsTotal: result.detail?.unitsTotal,
        });
        // Estado visual del botón "Agregado" por 2s
        setJustAdded(true);
        window.setTimeout(() => setJustAdded(false), 2200);
        // Re-render para actualizar el mini-cart
        router.refresh();
      } catch {
        showToast({
          type: "error",
          title: "Ocurrió un error",
          description: "Reintentá en unos segundos.",
        });
      }
    });
  }

  if (pendingAck) {
    return (
      <div className="space-y-2">
        <AccessoryWarningBlock
          message={pendingAck.warningMessage}
          compatiblePrimaries={pendingAck.compatiblePrimaries}
          acknowledged={acknowledged}
          onAcknowledgedChange={setAcknowledged}
          compact={compact}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!acknowledged || pending}
            onClick={() => runAdd(true)}
          >
            Agregar igualmente
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setPendingAck(null)}
          >
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => runAdd(false)}
      disabled={pending || justAdded}
      className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border font-medium transition-all ${
        justAdded
          ? "border-success bg-success/10 text-success"
          : "border-primary/30 bg-primary text-primary-foreground hover:bg-primary/90"
      } disabled:opacity-80 ${compact ? "h-8 px-2 text-xs" : "h-10 px-4 text-sm"}`}
    >
      {pending ? (
        <>
          <Loader2 className={`${compact ? "h-3 w-3" : "h-4 w-4"} animate-spin`} />
          Agregando…
        </>
      ) : justAdded ? (
        <>
          <Check className={compact ? "h-3 w-3" : "h-4 w-4"} />
          Agregado
        </>
      ) : (
        <>
          <Plus className={compact ? "h-3 w-3" : "h-4 w-4"} />
          {compact ? "Agregar" : "Agregar a mi solicitud"}
        </>
      )}
    </button>
  );
}
