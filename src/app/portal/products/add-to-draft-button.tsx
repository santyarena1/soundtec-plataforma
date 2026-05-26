"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { addToDraftRequest } from "@/server/actions/requests";
import { AccessoryWarningBlock } from "@/components/portal/accessory-warning";
import type { CompatiblePrimary } from "@/lib/accessory-context";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface Props {
  productId: string;
  productName: string;
  quantity?: number;
  compact?: boolean;
}

export function AddToDraftButton({ productId, productName, quantity = 1, compact = false }: Props) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [pendingAck, setPendingAck] = useState<{
    warningMessage: string;
    compatiblePrimaries: CompatiblePrimary[];
  } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  function runAdd(withAck: boolean) {
    setFeedback(null);
    setIsError(false);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("productId", productId);
        fd.set("quantity", String(quantity));
        if (withAck) fd.set("ackAccessoryWarning", "true");

        const result = await addToDraftRequest(fd);
        if (result.requiresAcknowledgement && result.warningMessage) {
          setRequestId(result.requestId || null);
          setPendingAck({
            warningMessage: result.warningMessage,
            compatiblePrimaries: result.compatiblePrimaries || [],
          });
          setAcknowledged(false);
          return;
        }
        if (!result?.ok) {
          setIsError(true);
          setFeedback(result?.error || "No se pudo agregar.");
          return;
        }
        setPendingAck(null);
        if (result.requestId) setRequestId(result.requestId);
        const detail = result.detail;
        if (detail) {
          setFeedback(
            `Agregaste ${detail.addedQty} u. de «${productName}». En tu solicitud: ${detail.itemsTotal} producto(s) / ${detail.unitsTotal} unidades.`
          );
        } else {
          setFeedback(`«${productName}» agregado a tu solicitud.`);
        }
        setIsError(false);
      } catch {
        setIsError(true);
        setFeedback("Ocurrió un error. Reintentá en unos segundos.");
      }
    });
  }

  return (
    <div className="space-y-2">
      {pendingAck ? (
        <div className="space-y-2">
          <AccessoryWarningBlock
            message={pendingAck.warningMessage}
            compatiblePrimaries={pendingAck.compatiblePrimaries}
            acknowledged={acknowledged}
            onAcknowledgedChange={setAcknowledged}
            compact={compact}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={!acknowledged || pending} onClick={() => runAdd(true)}>
              Agregar igualmente
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPendingAck(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => runAdd(false)}
          disabled={pending}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 ${
            compact ? "h-8 px-2 text-xs" : "h-10 px-4 text-sm"
          }`}
        >
          {pending ? (
            "Agregando…"
          ) : (
            <>
              <Plus className="h-4 w-4" />
              {compact ? "Solicitud" : "Agregar a mi solicitud"}
            </>
          )}
        </button>
      )}

      {feedback ? (
        <p className={`text-[11px] ${isError ? "text-destructive" : "text-success"}`}>
          {feedback}{" "}
          {!isError && requestId ? (
            <Link href={`/portal/requests/${requestId}`} className="underline">
              Ver solicitud
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
