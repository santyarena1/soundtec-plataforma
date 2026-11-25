"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyPriceReviewAction } from "@/server/actions/price-reviews";

export interface ReviewNoticeData {
  id: string;
  title?: string;
  affectedProducts: number;
  affectedRows: number;
  up: number;
  down: number;
  /** Ya había una revisión pendiente con este mismo cambio: se reutilizó. */
  reused?: boolean;
}

/**
 * Resultado de mandar un cambio a revisión: cuántos precios mueve y qué hacer.
 * Si no mueve ninguno, se aplica acá con un clic (queda registrado igual).
 */
export function PriceReviewNotice({
  notice,
  onDone,
  onDismiss,
}: {
  notice: ReviewNoticeData;
  onDone?: () => void;
  /** Cerrar el aviso sin aplicar (el cambio sigue en Revisión de cambios). */
  onDismiss?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const zero = notice.affectedProducts === 0;

  function apply() {
    start(async () => {
      const result = await applyPriceReviewAction(notice.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.affectedProducts === 0
          ? "Aplicado. No cambió ningún precio."
          : `Aplicado. Cambió el precio de ${result.affectedProducts} producto${result.affectedProducts === 1 ? "" : "s"}.`
      );
      onDone?.();
      router.refresh();
    });
  }

  // Ya se guardó (quedó en revisión): ir a la revisión no pierde nada, el aviso de cambios sin guardar no aplica.
  return (
    <div
      role="status"
      data-unsaved-guard="ignore"
      className={
        zero
          ? "flex flex-wrap items-center gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          : "flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
      }
    >
      {zero ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1">
        {notice.title ? <b>{notice.title}: </b> : null}
        {notice.reused ? <>Ya estaba pendiente de revisión con lo mismo (no se duplicó). </> : null}
        {zero ? (
          <>No mueve ningún precio. Todavía no se guardó: aplicalo y queda registrado en Revisión de cambios.</>
        ) : (
          <>
            Mueve el precio de <b>{notice.affectedProducts}</b> producto{notice.affectedProducts === 1 ? "" : "s"}
            {notice.up ? ` · ${notice.up} suben` : ""}
            {notice.down ? ` · ${notice.down} bajan` : ""}
            {notice.affectedRows > notice.affectedProducts ? ` (${notice.affectedRows} filas contando clientes con condiciones propias)` : ""}.
            Todavía no se aplicó: revisá la lista antes.
          </>
        )}
      </span>
      {zero ? (
        <Button type="button" size="sm" onClick={apply} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Aplicar
        </Button>
      ) : null}
      <Link href={`/admin/price-reviews/${notice.id}`} className="text-sm font-medium underline underline-offset-2">
        {zero ? "Ver registro" : "Ver lista y aplicar"}
      </Link>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar aviso"
          title="Cerrar el aviso. El cambio sigue pendiente en Revisión de cambios."
          className="rounded p-0.5 opacity-70 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
