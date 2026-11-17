"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Star } from "lucide-react";
import { setProductFeatured } from "@/server/actions/brand-listing";
import { cn } from "@/lib/utils";

/**
 * Estrella del equipo Soundtec: el producto destacado sale primero al entrar a
 * su marca. Al quitarla vuelve a su lugar por rubro. El cliente no la ve.
 */
export function FeaturedStarButton({ productId, isFeatured, label = false }: { productId: string; isFeatured: boolean; label?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [featured, setFeatured] = useState(isFeatured);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !featured;
    setFeatured(next);
    setError(null);
    start(async () => {
      const result = await setProductFeatured(productId, next);
      if (!result.ok) {
        setFeatured(!next);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const title = featured ? "Destacado: sale primero en su marca. Tocá para quitarlo." : "Destacar: que salga primero al entrar a su marca";
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={error ?? title}
      aria-pressed={featured}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-full border border-border bg-card px-2 text-xs transition-colors hover:border-accent",
        featured ? "text-accent" : "text-muted-foreground",
        error ? "border-destructive text-destructive" : ""
      )}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className={cn("h-3.5 w-3.5", featured ? "fill-current" : "")} />}
      {label ? (featured ? "Destacado en su marca" : "Destacar en su marca") : null}
    </button>
  );
}
