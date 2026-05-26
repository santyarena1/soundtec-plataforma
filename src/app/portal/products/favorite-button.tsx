"use client";

import { useTransition } from "react";
import { toggleFavorite } from "@/server/actions/wishlist";
import { Heart, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  productId: string;
  isFavorite: boolean;
  label?: boolean;
}

export function FavoriteButton({ productId, isFavorite, label = false }: FavoriteButtonProps) {
  const [pending, start] = useTransition();

  return (
    <form
      action={(formData) =>
        start(async () => {
          await toggleFavorite(formData);
        })
      }
    >
      <input type="hidden" name="productId" value={productId} />
      <button
        type="submit"
        disabled={pending}
        title={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-full border border-border bg-card px-2 text-xs transition-colors hover:border-accent",
          isFavorite ? "text-accent" : "text-muted-foreground"
        )}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Heart className={cn("h-3.5 w-3.5", isFavorite ? "fill-current" : "")} />
        )}
        {label ? (isFavorite ? "En favoritos" : "Agregar a favoritos") : null}
      </button>
    </form>
  );
}
