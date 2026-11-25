"use client";

import { Instagram, Play } from "lucide-react";
import { videoProviderLabel, videoThumbnailUrl } from "@/lib/product-video";
import { cn } from "@/lib/utils";

interface VideoThumbProps {
  provider: string;
  videoId: string;
  title?: string | null;
  /** Ícono de play más grande (vista principal de la galería). */
  large?: boolean;
  className?: string;
}

/**
 * Miniatura de un video de la galería: la imagen estática de YouTube o una
 * tarjeta propia para Instagram (no ofrece miniatura sin su API). No carga
 * el reproductor: eso pasa recién cuando se toca.
 */
export function VideoThumb({ provider, videoId, title, large, className }: VideoThumbProps) {
  const thumb = videoThumbnailUrl({ provider, videoId });
  const label = videoProviderLabel(provider);
  return (
    <span className={cn("relative block h-full w-full overflow-hidden bg-neutral-900", className)}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt={title || `Video de ${label}`} loading="lazy" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#833ab4] via-[#e1306c] to-[#f77737] text-white">
          <Instagram className={large ? "h-10 w-10" : "h-5 w-5"} aria-hidden="true" />
          {large ? <span className="text-sm font-medium">Video de Instagram</span> : null}
        </span>
      )}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-black/65 text-white shadow-lg ring-1 ring-white/40",
            large ? "h-16 w-16" : "h-8 w-8"
          )}
        >
          <Play className={cn("translate-x-[1px] fill-current", large ? "h-7 w-7" : "h-3.5 w-3.5")} aria-hidden="true" />
        </span>
      </span>
      <span className="sr-only">{`Video de ${label}${title ? `: ${title}` : ""}`}</span>
    </span>
  );
}
