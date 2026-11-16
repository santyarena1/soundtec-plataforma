import { DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

/** Leyenda de precios del portal: una sola, bien a la vista (catálogo y ficha). */
export const PRICE_TAX_NOTICE = "Los precios indicados están expresados en dólares estadounidenses y no incluyen impuestos.";

export function PriceTaxNotice({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 font-semibold text-amber-950",
        compact ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2.5 text-sm sm:text-[15px]",
        className
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-amber-400/90 text-amber-950",
          compact ? "mt-px h-4 w-4" : "h-5 w-5"
        )}
        aria-hidden="true"
      >
        <DollarSign className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      </span>
      {PRICE_TAX_NOTICE}
    </p>
  );
}
