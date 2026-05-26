"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Loader2, Send, ArrowRight } from "lucide-react";
import { addToDraftRequest } from "@/server/actions/requests";
import { AccessoryWarningBlock } from "@/components/portal/accessory-warning";
import type { CompatiblePrimary } from "@/lib/accessory-context";
import { requestTypeLabel } from "@/lib/request-labels";

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
  accessoryContext?: AccessoryContext | null;
}

export function AddToRequestPanel({
  productId,
  draftRequestId,
  draftType,
  draftItemCount,
  accessoryContext,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pendingAck, setPendingAck] = useState(false);

  const ackBlock = accessoryContext?.showWarning;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (ackBlock && !acknowledged) {
      setPendingAck(true);
      return;
    }

    const fd = new FormData(e.currentTarget);
    fd.set("productId", productId);
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
        return;
      }
      setSuccess("Producto agregado a tu solicitud.");
      setPendingAck(false);
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden border-primary/15 shadow-md">
      <div className="border-b border-border bg-gradient-to-r from-primary/8 to-transparent px-5 py-4">
        <CardTitle className="text-lg">Agregar a tu solicitud</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu solicitud en armado ({requestTypeLabel(draftType)}) · {draftItemCount} producto
          {draftItemCount === 1 ? "" : "s"} cargados.
        </p>
      </div>
      <CardContent className="space-y-4 p-5">
        <Link
          href={`/portal/requests/${draftRequestId}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
        >
          Ir a mi solicitud <ArrowRight className="h-3.5 w-3.5" />
        </Link>

        {(pendingAck || ackBlock) && accessoryContext ? (
          <AccessoryWarningBlock
            message={accessoryContext.warningMessage}
            compatiblePrimaries={accessoryContext.compatiblePrimaries}
            acknowledged={acknowledged}
            onAcknowledgedChange={setAcknowledged}
          />
        ) : null}

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[88px_1fr]">
            <div>
              <Label htmlFor="quantity" required>
                Cant.
              </Label>
              <Input id="quantity" name="quantity" type="number" min={1} defaultValue={1} />
            </div>
            <div>
              <Label htmlFor="userNotes">Notas (opcional)</Label>
              <Textarea id="userNotes" name="userNotes" rows={2} placeholder="Detalle para Soundtec…" />
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? <p className="text-sm text-success">{success}</p> : null}

          <Button type="submit" disabled={pending || Boolean(ackBlock && !acknowledged)} className="w-full" size="lg">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Agregar a mi solicitud
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
