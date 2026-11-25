"use client";

import { useState } from "react";
import { Check, GitCompareArrows } from "lucide-react";
import { COMPARE_MAX, type CompareItem } from "@/lib/compare/selection";
import { cn } from "@/lib/utils";
import { compareStore, useCompareSelection } from "./compare-store";

/**
 * «Comparar» en la tarjeta, la fila de la lista y la ficha. Suma o saca el
 * producto de la selección (hasta 4). Con 4 elegidos avisa en vez de sumar.
 *
 * - `card`: pastilla sobre la foto; en PC aparece al pasar el mouse (o si ya
 *   hay algo elegido), en pantallas táctiles está siempre.
 * - `inline`: botón chico de texto (lista).
 * - `button`: botón con borde, como «Agregar a favoritos» (ficha).
 */
export function CompareToggle({ product, variant, className }: { product: CompareItem; variant: "card" | "inline" | "button"; className?: string }) {
  const selection = useCompareSelection();
  const [full, setFull] = useState(false);
  const selected = selection.some((i) => i.id === product.id);
  const anySelected = selection.length > 0;

  function onClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const result = compareStore.toggle(product);
    setFull(result.status === "full");
    if (result.status === "full") window.setTimeout(() => setFull(false), 2600);
  }

  const label = full ? `Máximo ${COMPARE_MAX}: quitá uno` : selected ? "Comparando" : "Comparar";
  const title = selected ? "Quitar de la comparación" : `Sumar a la comparación (hasta ${COMPARE_MAX} productos)`;
  const Icon = selected ? Check : GitCompareArrows;

  if (variant === "card") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        title={title}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold shadow-sm backdrop-blur transition-all focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          selected
            ? "border-primary bg-primary text-primary-foreground opacity-100"
            : full
              ? "border-warning/50 bg-card text-warning opacity-100"
              : cn(
                  "border-border bg-card/95 text-foreground hover:border-primary/50 hover:text-primary group-hover:opacity-100 [@media(hover:none)]:opacity-100",
                  anySelected ? "opacity-100" : "opacity-0"
                ),
          className
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  }

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        title={title}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[13px] font-medium transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : full ? "border-warning/50 text-warning" : "border-border text-foreground hover:border-primary/40 hover:text-primary",
          className
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={title}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-full border px-2 text-xs transition-colors",
        selected ? "border-primary bg-primary text-primary-foreground" : full ? "border-warning/50 text-warning" : "border-border bg-card text-muted-foreground hover:border-accent",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {full ? label : selected ? "En la comparación" : "Comparar"}
    </button>
  );
}
