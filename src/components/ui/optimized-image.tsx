"use client";

import { optimizedImageUrl } from "@/lib/optimized-image";

/**
 * Foto de listado. Si el optimizador no puede bajarla, muestra la original
 * para que la tarjeta no quede rota.
 */
export function OptimizedImage({
  src,
  alt,
  width,
  quality = 75,
  className,
  loading = "lazy",
  draggable,
  style,
  onLoad,
}: {
  src: string;
  alt: string;
  width: number;
  quality?: number;
  className?: string;
  loading?: "lazy" | "eager";
  draggable?: boolean;
  style?: React.CSSProperties;
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={optimizedImageUrl(src, width, quality)}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      draggable={draggable}
      style={style}
      onLoad={onLoad}
      onError={(event) => {
        const img = event.currentTarget;
        if (img.dataset.full === "1" || img.src.endsWith(src)) return;
        img.dataset.full = "1";
        img.src = src;
      }}
    />
  );
}
