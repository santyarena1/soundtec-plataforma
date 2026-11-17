"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Play } from "lucide-react";
import { formatDuration, type TutorialVideo } from "@/lib/tutorial-videos";
import { cn } from "@/lib/utils";
import { TutorialVideoPlayer } from "./tutorial-video-player";

/** Solo para marcar «Visto» en este navegador: no es un dato del sistema. */
const WATCHED_KEY = "soundtec.portal.tutoriales.vistos";
const VIDEO_PARAM = "video";

function readWatched(): string[] {
  try {
    const raw = window.localStorage.getItem(WATCHED_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeWatched(list: string[]) {
  try {
    window.localStorage.setItem(WATCHED_KEY, JSON.stringify(list));
  } catch {
    /* modo privado o almacenamiento bloqueado: el «Visto» queda solo en esta visita */
  }
}

/** ?video=<slug> abre ese video: el link se puede pasar. */
function setVideoParam(slug: string | null) {
  const url = new URL(window.location.href);
  if (slug) url.searchParams.set(VIDEO_PARAM, slug);
  else url.searchParams.delete(VIDEO_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
}

interface TutorialVideosGalleryProps {
  videos: TutorialVideo[];
}

export function TutorialVideosGallery({ videos }: TutorialVideosGalleryProps) {
  const [current, setCurrent] = useState<number | null>(null);
  const [watched, setWatched] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setWatched(readWatched());
    const slug = new URL(window.location.href).searchParams.get(VIDEO_PARAM);
    const index = slug ? videos.findIndex((v) => v.slug === slug) : -1;
    if (index >= 0) setCurrent(index);
  }, [videos]);

  const open = useCallback(
    (index: number) => {
      setCurrent(index);
      setVideoParam(videos[index]?.slug ?? null);
    },
    [videos],
  );

  const close = useCallback(() => {
    setCurrent(null);
    setVideoParam(null);
  }, []);

  const markWatched = useCallback((slug: string) => {
    setWatched((prev) => {
      if (prev.includes(slug)) return prev;
      const next = [...prev, slug];
      writeWatched(next);
      return next;
    });
  }, []);

  return (
    <>
      <ul className="grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" data-testid="tutorial-videos-grid">
        {videos.map((video, index) => {
          const seen = watched.includes(video.slug);
          return (
            <li key={video.slug}>
              <button
                type="button"
                onClick={() => open(index)}
                className="group block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
                aria-label={`Ver «${video.title}» (${formatDuration(video.durationSeconds)})`}
              >
                <span className="relative block aspect-video overflow-hidden rounded-xl border border-border bg-secondary shadow-sm transition-shadow group-hover:shadow-md">
                  {video.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={video.posterUrl}
                      alt=""
                      width={1920}
                      height={1080}
                      loading={index < 3 ? "eager" : "lazy"}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : null}
                  <span className="absolute inset-0 bg-[hsl(213_47%_10%/0)] transition-colors group-hover:bg-[hsl(213_47%_10%/0.18)]" />
                  <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-primary opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Play className="ml-0.5 h-5 w-5 fill-current" />
                  </span>
                  <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                    {formatDuration(video.durationSeconds)}
                  </span>
                  {seen ? (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-white/95 px-1.5 py-0.5 text-[11px] font-medium text-foreground shadow-sm">
                      <Check className="h-3 w-3 text-emerald-600" />
                      Visto
                    </span>
                  ) : null}
                </span>
                <span className="mt-3 flex items-baseline gap-2">
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <span className={cn("text-sm font-semibold leading-snug text-foreground group-hover:text-primary")}>{video.title}</span>
                </span>
                {video.description ? (
                  <span className="mt-1 line-clamp-2 block pl-7 text-xs leading-relaxed text-muted-foreground">{video.description}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {mounted && current !== null && videos[current]
        ? createPortal(
            <TutorialVideoPlayer
              videos={videos}
              index={current}
              watched={watched}
              onSelect={open}
              onClose={close}
              onWatched={markWatched}
            />,
            document.body,
          )
        : null}
    </>
  );
}
