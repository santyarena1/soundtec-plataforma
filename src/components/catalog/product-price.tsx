import { formatUsd } from "@/lib/utils";
import { cn } from "@/lib/utils";

type PriceSize = "card" | "row" | "detail";

const SIZE: Record<PriceSize, string> = {
  card: "text-lg",
  row: "text-lg sm:text-xl",
  detail: "text-3xl",
};

/**
 * Precio con o sin descuento. Con descuento, el precio regular va tachado al
 * lado y con la MISMA letra y el mismo tamaño que el precio con descuento:
 * se leen los dos números de un vistazo y se ve cuánto baja.
 */
export function ProductPrice({
  finalUsd,
  regularUsd,
  discountPercent,
  size,
  className,
}: {
  finalUsd: number;
  regularUsd?: number | null;
  discountPercent?: number | null;
  size: PriceSize;
  className?: string;
}) {
  const showRegular = !!regularUsd && !!discountPercent && discountPercent > 0 && regularUsd > finalUsd;
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-semibold leading-tight tabular-nums", SIZE[size], size === "detail" && "tracking-tight", className)}>
      <span className="text-foreground">{formatUsd(finalUsd)}</span>
      {showRegular ? (
        <span className="text-muted-foreground line-through decoration-[1.5px]">
          <span className="sr-only">Precio regular: </span>
          {formatUsd(regularUsd!)}
        </span>
      ) : null}
    </p>
  );
}
