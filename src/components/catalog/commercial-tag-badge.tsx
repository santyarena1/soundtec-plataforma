import type { CommercialTagView } from "@/lib/commercial-tags";
import { labelColors } from "@/lib/label-colors";
import { cn } from "@/lib/utils";

export type TagSize = "card" | "row" | "detail";

/**
 * Cartel comercial sobre la foto o junto al título. El de descuento se lee
 * más grande y en minúscula («Descuento 20%»): es un dato de precio, no un
 * rótulo. Los elegidos en el panel (A pedido, Liquidación…) van en versalitas.
 */
const SIZES: Record<CommercialTagView["kind"], Record<TagSize, string>> = {
  discount: {
    card: "px-2.5 py-1 text-sm",
    row: "px-3 py-1 text-[15px]",
    detail: "px-3 py-1 text-base",
  },
  chosen: {
    card: "px-2 py-0.5 text-[11px] uppercase tracking-wide",
    row: "px-2.5 py-1 text-xs uppercase tracking-wide",
    detail: "px-2.5 py-1 text-xs uppercase tracking-wide",
  },
};

export function CommercialTagBadge({ tag, size, className }: { tag: CommercialTagView; size: TagSize; className?: string }) {
  return (
    <span
      title={tag.hint}
      className={cn("inline-flex items-center rounded-md font-bold leading-tight shadow-sm", SIZES[tag.kind][size], tag.className, className)}
    >
      {tag.label}
    </span>
  );
}

export interface ProductLabelView {
  id: string;
  name: string;
  color: string;
}

/**
 * Etiquetas del producto (Admin → Etiquetas: «Precio promocional», «Precio
 * especial»…), cada una con su color. `max` corta y suma «+N».
 */
export function ProductLabelChips({
  labels,
  size,
  max,
  className,
}: {
  labels: ProductLabelView[];
  size: TagSize;
  max?: number;
  className?: string;
}) {
  if (labels.length === 0) return null;
  const shown = max != null ? labels.slice(0, max) : labels;
  const rest = labels.length - shown.length;
  const sizing = size === "card" ? "px-2 py-0.5 text-[11px]" : size === "row" ? "px-2.5 py-0.5 text-xs" : "px-2.5 py-1 text-xs";
  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {shown.map((label) => (
        <span key={label.id} className={cn("inline-flex items-center rounded-md font-semibold leading-tight shadow-sm", sizing)} style={labelColors(label.color)}>
          {label.name}
        </span>
      ))}
      {rest > 0 ? (
        <span className={cn("inline-flex items-center rounded-md bg-card/95 font-semibold leading-tight text-foreground shadow-sm ring-1 ring-border", sizing)} title={labels.slice(shown.length).map((l) => l.name).join(", ")}>
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
