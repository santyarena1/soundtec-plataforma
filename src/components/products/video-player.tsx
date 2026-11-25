"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { VideoThumb } from "./video-thumb";
import { videoEmbedUrl, videoProviderLabel } from "@/lib/product-video";

interface VideoPlayerProps {
  provider: string;
  videoId: string;
  url: string;
  title?: string | null;
  productName: string;
}

/**
 * Video de la galería con carga diferida: hasta que el cliente toca play solo
 * se ve una miniatura. Recién ahí se arma el reproductor (youtube-nocookie o
 * el embed de Instagram), así nadie carga scripts de terceros por abrir la ficha.
 */
export function VideoPlayer({ provider, videoId, url, title, productName }: VideoPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const embed = videoEmbedUrl({ provider, videoId });
  const label = videoProviderLabel(provider);
  const isInstagram = provider === "instagram";

  return (
    <div className="space-y-1.5">
      <div
        className={`relative w-full overflow-hidden rounded-xl border border-border bg-black shadow-sm ${
          isInstagram ? "mx-auto aspect-[4/5] max-w-md" : "aspect-video"
        }`}
      >
        {playing && embed ? (
          <iframe
            src={embed}
            title={title || `${productName}: video de ${label}`}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 block h-full w-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
            aria-label={`Reproducir video de ${label}${title ? `: ${title}` : ""}`}
          >
            <VideoThumb provider={provider} videoId={videoId} title={title} large className="transition-transform group-hover:scale-[1.01]" />
          </button>
        )}
      </div>
      <p className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{title || `Video en ${label}`}</span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 hover:text-foreground">
          Ver en {label} <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </p>
    </div>
  );
}
