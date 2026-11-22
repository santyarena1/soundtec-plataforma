"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { applyPriceReviewAction, discardPriceReviewAction, refreshPriceReviewAction } from "@/server/actions/price-reviews";

export function ReviewActions({ id, pending: isPending, zero }: { id: string; pending: boolean; zero: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();

  function run(kind: "apply" | "discard" | "refresh") {
    if (kind === "apply" && !zero && !window.confirm("¿Aplicar? Los precios de la lista cambian ya en el portal, el catálogo y las cotizaciones nuevas.")) return;
    if (kind === "discard" && !window.confirm("¿Descartar este cambio? No se aplica nada.")) return;
    start(async () => {
      if (kind === "apply") {
        const r = await applyPriceReviewAction(id);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success(r.affectedProducts === 0 ? "Aplicado. No cambió ningún precio." : `Aplicado: cambió el precio de ${r.affectedProducts} productos.`);
      } else if (kind === "discard") {
        const r = await discardPriceReviewAction(id);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Descartado.");
      } else {
        const r = await refreshPriceReviewAction(id);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success(`Recalculado: ${r.review.affectedProducts} productos cambian.`);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isPending ? (
        <>
          <Button onClick={() => run("apply")} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {zero ? "Aplicar (no cambia precios)" : "Aplicar"}
          </Button>
          <Button variant="outline" onClick={() => run("refresh")} disabled={busy}>
            <RefreshCw className="h-4 w-4" />
            Recalcular
          </Button>
          <Button variant="ghost" onClick={() => run("discard")} disabled={busy}>
            Descartar
          </Button>
        </>
      ) : null}
      <ButtonLink href={`/api/admin/price-reviews/${id}/export`} variant="outline">
        <Download className="h-4 w-4" />
        Exportar Excel
      </ButtonLink>
    </div>
  );
}
