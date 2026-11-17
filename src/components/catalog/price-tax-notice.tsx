import { cn } from "@/lib/utils";

/** Leyenda de precios del portal (catálogo y ficha): una línea chica, mismo ámbar suave de siempre. */
export const PRICE_TAX_NOTICE = "Precios en USD, sin impuestos.";

export function PriceTaxNotice({ className }: { compact?: boolean; className?: string }) {
  return (
    <p className={cn("inline-flex rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900", className)}>
      {PRICE_TAX_NOTICE}
    </p>
  );
}
