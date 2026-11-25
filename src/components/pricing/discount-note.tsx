import { BadgePercent } from "lucide-react";
import { formatUsd, cn } from "@/lib/utils";
import { formatDiscountPercent, type DiscountInfo } from "@/lib/price-discount-label";

const ORIGIN_SHORT: Record<DiscountInfo["origin"], string> = {
  PRODUCT: "del producto",
  RULE: "por regla",
  CLIENT: "del cliente",
};

/**
 * Aviso para el admin: el precio de venta ya tiene un descuento aplicado.
 * Muestra el %, el precio sin descuento y de dónde sale (producto, regla o cliente).
 * `detailed` agrega el nombre de la regla (ficha y columna «Descuento»).
 */
export function DiscountNote({ info, detailed, className }: { info: DiscountInfo | null | undefined; detailed?: boolean; className?: string }) {
  if (!info) return null;
  const title = `Incluye descuento ${formatDiscountPercent(info.percent)} (${info.originLabel}). Sin descuento: ${formatUsd(info.listPriceUsd)}.`;
  return (
    <span className={cn("block text-[11px] leading-snug", className)} title={title}>
      <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
        <BadgePercent className="h-3 w-3 shrink-0" aria-hidden="true" />
        incluye desc. {formatDiscountPercent(info.percent)} {ORIGIN_SHORT[info.origin]}
      </span>
      <span className="block text-muted-foreground">
        sin desc. <span className="line-through">{formatUsd(info.listPriceUsd)}</span>
        {detailed ? ` · ${info.originLabel}` : null}
      </span>
    </span>
  );
}
