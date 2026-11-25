"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListOrdered, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ordinal } from "@/lib/brand-listing-order";
import { getProductRubroHighlight, setProductRubroFirst } from "@/server/actions/brand-listing";
import type { ProductRubroHighlight } from "@/server/catalog/brand-listing-data";

export interface FeaturedRubroButtonProps {
  productId: string;
  /** Estado ya calculado (tarjetas). Sin definir = lo pide al montarse (ficha, edición rápida). */
  initial?: ProductRubroHighlight | null;
  /** Solo el ícono (tarjeta del catálogo); el estado va en el tooltip. */
  compact?: boolean;
  className?: string;
}

/** Texto del estado actual: «Rubro destacado en SONANCE: Bafles de embutir · 1.º». */
export function rubroHighlightText(h: ProductRubroHighlight): string {
  if (h.position === 0) return `Rubro destacado en ${h.brandName}: ${h.rubroName} · 1.º`;
  if (h.position != null) return `${h.rubroName} va ${ordinal(h.position)} en el orden de ${h.brandName}`;
  if (h.coveredBy) return `${h.rubroName} sale dentro de ${h.coveredBy.name} (${ordinal(h.coveredBy.position)} en ${h.brandName})`;
  return `${h.rubroName} sale por nombre en ${h.brandName}, después de los rubros elegidos`;
}

function helpText(h: ProductRubroHighlight): string {
  return (
    `Pone «${h.rubroName}» primero al entrar a ${h.brandName}: sus productos salen arriba, justo después de los destacados con estrella. ` +
    `Es el rubro con el que se agrupa este producto en la marca (nivel 3 del árbol de Tango, con todo lo que cuelga). ` +
    `El orden completo se edita en Admin › Marcas.`
  );
}

/**
 * «Destacar rubro en su marca»: pone el rubro del producto 1.º en el orden de
 * rubros de su marca, o lo saca del orden. Solo para el equipo (products.edit),
 * igual que la estrella. Reusable desde la ficha, la tarjeta y la edición rápida.
 */
export function FeaturedRubroButton({ productId, initial, compact = false, className }: FeaturedRubroButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<ProductRubroHighlight | null | undefined>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (initial !== undefined) {
      setState(initial);
      return;
    }
    let alive = true;
    getProductRubroHighlight(productId)
      .then((h) => alive && setState(h))
      .catch(() => alive && setState(null));
    return () => {
      alive = false;
    };
  }, [productId, initial]);

  if (state === undefined) {
    return compact ? null : (
      <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3 w-3 animate-spin" /> Rubro en su marca…
      </p>
    );
  }
  if (state === null) return null;

  const isFirst = state.position === 0;
  const current = state;

  function toggle() {
    setError(null);
    start(async () => {
      const result = await setProductRubroFirst(productId, !isFirst);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState(result.highlight);
      router.refresh();
    });
  }

  const action = isFirst ? `Sacar «${current.rubroName}» del orden` : `Destacar rubro «${current.rubroName}» en ${current.brandName}`;
  const title = error ?? `${rubroHighlightText(current)}.\n${action}.\n\n${helpText(current)}`;

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title={title}
        aria-label={action}
        aria-pressed={isFirst}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-full border border-border bg-card px-2 text-xs transition-colors hover:border-accent",
          isFirst ? "text-accent" : "text-muted-foreground",
          error ? "border-destructive text-destructive" : "",
          className
        )}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListOrdered className="h-3.5 w-3.5" />}
      </button>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title={helpText(current)}
        aria-pressed={isFirst}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs transition-colors hover:border-accent",
          isFirst ? "border-accent/40 text-accent" : "text-muted-foreground"
        )}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListOrdered className="h-3.5 w-3.5" />}
        {isFirst ? "Rubro destacado · quitar" : "Destacar rubro en su marca"}
      </button>
      <span className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")} title={helpText(current)}>
        {error ?? rubroHighlightText(current)}
      </span>
    </div>
  );
}
