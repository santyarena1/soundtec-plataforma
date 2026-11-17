"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Play, RotateCcw, X } from "lucide-react";
import { formatDuration, type TutorialVideo } from "@/lib/tutorial-videos";
import { cn } from "@/lib/utils";

/** A partir de qué parte del video se cuenta como visto. */
const WATCHED_RATIO = 0.9;

interface TutorialVideoPlayerProps {
  videos: TutorialVideo[];
  index: number;
  watched: string[];
  onSelect: (index: number) => void;
  onClose: () => void;
  onWatched: (slug: string) => void;
}

export function TutorialVideoPlayer({ videos, index, watched, onSelect, onClose, onWatched }: TutorialVideoPlayerProps) {
  const video = videos[index]!;
  const next = videos[index + 1] ?? null;
  const prev = index > 0 ? videos[index - 1]! : null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.fullscreenElement) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  // Cada video nuevo arranca solo (se abrió con un toque) y la lista lo deja a la vista.
  useEffect(() => {
    setEnded(false);
    videoRef.current?.play().catch(() => undefined);
    // Solo mueve la lista cuando tiene su propio scroll (PC): en el celular el video queda arriba.
    const list = listRef.current;
    const item = activeItemRef.current;
    if (list && item && list.scrollHeight > list.clientHeight) {
      const top = item.offsetTop; // la lista es relative: offsetTop ya es dentro de ella
      if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top - 8;
    }
  }, [video.slug]);

  function handleTimeUpdate() {
    const el = videoRef.current;
    if (el && el.duration && el.currentTime / el.duration >= WATCHED_RATIO) onWatched(video.slug);
  }

  function replay() {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = 0;
    setEnded(false);
    el.play().catch(() => undefined);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-[hsl(213_47%_6%/0.88)] backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-player-title"
        className="flex h-dvh w-full max-w-7xl flex-col overflow-y-auto bg-[hsl(213_40%_9%)] text-white shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-2xl sm:border sm:border-white/10 lg:flex-row lg:overflow-hidden"
        data-testid="tutorial-player"
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/55">
              Video {index + 1} de {videos.length}
            </p>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Cerrar el video"
              className="-mr-1.5 rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative aspect-video w-full shrink-0 bg-black">
            <video
              key={video.slug}
              ref={videoRef}
              src={video.videoUrl}
              poster={video.posterUrl || undefined}
              controls
              playsInline
              autoPlay
              preload="metadata"
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => {
                onWatched(video.slug);
                setEnded(true);
              }}
              onPlay={() => setEnded(false)}
              className="h-full w-full"
              data-testid="tutorial-video"
            >
              Tu navegador no puede reproducir este video.
            </video>

            {ended ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[hsl(213_40%_7%/0.94)] p-4 text-center">
                {next ? (
                  <>
                    <p className="text-xs uppercase tracking-[0.14em] text-white/60">Sigue</p>
                    <p className="max-w-md text-lg font-semibold sm:text-xl">{next.title}</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelect(index + 1)}
                        className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[hsl(213_47%_22%)] transition-colors hover:bg-white/90"
                      >
                        <Play className="h-4 w-4 fill-current" />
                        Ver el siguiente
                      </button>
                      <button
                        type="button"
                        onClick={replay}
                        className="inline-flex items-center gap-2 rounded-md border border-white/25 px-4 py-2 text-sm text-white/85 transition-colors hover:bg-white/10"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Volver a ver
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold">Viste todos los videos</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={replay}
                        className="inline-flex items-center gap-2 rounded-md border border-white/25 px-4 py-2 text-sm text-white/85 transition-colors hover:bg-white/10"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Volver a ver
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[hsl(213_47%_22%)] transition-colors hover:bg-white/90"
                      >
                        Cerrar
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>

          <div className="space-y-3 px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 id="tutorial-player-title" className="text-lg font-semibold leading-snug sm:text-xl">
                  {video.title}
                </h2>
                {video.description ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/65">{video.description}</p> : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => prev && onSelect(index - 1)}
                  disabled={!prev}
                  className="inline-flex items-center gap-1 rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-35"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => next && onSelect(index + 1)}
                  disabled={!next}
                  className="inline-flex items-center gap-1 rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-35"
                  data-testid="tutorial-next"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <aside className="border-t border-white/10 lg:flex lg:w-80 lg:shrink-0 lg:flex-col lg:border-l lg:border-t-0 xl:w-96" aria-label="Lista de videos">
          <p className="px-4 pb-2 pt-4 text-xs font-medium uppercase tracking-[0.14em] text-white/55 sm:px-5 lg:pt-5">Todos los videos</p>
          <ol ref={listRef} className="relative pb-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            {videos.map((item, i) => {
              const active = i === index;
              const seen = watched.includes(item.slug);
              return (
                <li key={item.slug} ref={active ? activeItemRef : undefined}>
                  <button
                    type="button"
                    onClick={() => onSelect(i)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors sm:px-5",
                      active ? "bg-white/10" : "hover:bg-white/5",
                    )}
                  >
                    <span className="relative block aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-white/5">
                      {item.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.posterUrl} alt="" width={224} height={126} loading="lazy" className="h-full w-full object-cover" />
                      ) : null}
                      <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[10px] tabular-nums text-white">
                        {formatDuration(item.durationSeconds)}
                      </span>
                      {active ? <span className="absolute inset-0 rounded-md ring-2 ring-inset ring-white/80" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("line-clamp-2 text-sm leading-snug", active ? "font-semibold text-white" : "text-white/80")}>{item.title}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-white/45">
                        {active ? "Reproduciendo" : seen ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            Visto
                          </>
                        ) : (
                          `Video ${i + 1}`
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
