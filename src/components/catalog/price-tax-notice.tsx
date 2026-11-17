import { CircleDollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

/** Leyenda de precios del portal (catálogo y ficha). El texto es el que pidió Soundtec: no se resume. */
export const PRICE_TAX_NOTICE = "Los precios indicados están expresados en dólares estadounidenses y no incluyen impuestos.";

/**
 * Una línea en el mismo azul apagado de la marca, con su ícono: se lee como
 * parte del encabezado (catálogo) o del bloque de precio (ficha), sin caja de
 * alerta ni colores de advertencia.
 */
export function PriceTaxNotice({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-primary/75", compact ? "text-xs leading-snug" : "text-[13px] leading-5", className)}>
      <CircleDollarSign aria-hidden="true" className={cn("shrink-0", compact ? "mt-px h-3.5 w-3.5" : "mt-0.5 h-4 w-4")} strokeWidth={1.75} />
      <span>{PRICE_TAX_NOTICE}</span>
    </p>
  );
}
