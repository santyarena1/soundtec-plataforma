"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, ExternalLink, GripVertical, Loader2, Star, Trash2 } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/confirm-button";
import { VideoThumb } from "@/components/products/video-thumb";
import { galleryKey, moveItem, type GalleryItem } from "@/lib/product-media";
import { videoProviderLabel } from "@/lib/product-video";
import { deleteProductImage, setPrimaryImage } from "@/server/actions/product-enrichment";
import { deleteProductVideoAction, reorderProductMediaAction } from "@/server/actions/product-media";

export type GalleryEditorItem = GalleryItem & { source?: string | null };

function sourceLabel(source: string | null | undefined): string {
  if (!source) return "manual";
  if (source === "url") return "URL pegada";
  if (source === "upload") return "archivo";
  return source;
}

/** Espera tras el último movimiento antes de guardar (con teclado se mueve varias veces seguidas). */
const SAVE_DELAY_MS = 500;

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Galería de la ficha admin: fotos y videos en el orden en que los ve el
 * cliente. Se ordena arrastrando o con el teclado (flechas sobre el asa, o
 * los botones ← →). La primera foto es la principal (tapa de listados y PDF).
 */
export function GalleryEditor({ productId, items }: { productId: string; items: GalleryEditorItem[] }) {
  const router = useRouter();
  const [order, setOrder] = useState<string[]>(() => items.map(galleryKey));
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());
  const [removingVideo, setRemovingVideo] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());

  // La galería cambió en el servidor (foto nueva, video quitado): se toma ese orden.
  const serverOrder = items.map(galleryKey).join("|");
  useEffect(() => {
    setOrder(serverOrder ? serverOrder.split("|") : []);
  }, [serverOrder]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const byKey = new Map(items.map((item) => [galleryKey(item), item]));
  const ordered = order.map((key) => byKey.get(key)).filter((item): item is GalleryEditorItem => Boolean(item));
  const firstImageKey = ordered.find((item) => item.kind === "image");

  function scheduleSave(next: string[]) {
    if (timer.current) clearTimeout(timer.current);
    setSaveState("saving");
    timer.current = setTimeout(async () => {
      try {
        const result = await reorderProductMediaAction({ productId, keys: next });
        if (!result.ok) {
          setSaveState("error");
          setError(result.error);
          return;
        }
        setSaveState("saved");
        setError(null);
        router.refresh();
      } catch {
        setSaveState("error");
        setError("No se pudo guardar el orden. Probá de nuevo.");
      }
    }, SAVE_DELAY_MS);
  }

  function move(key: string, to: number, focus = false) {
    const from = order.indexOf(key);
    if (from < 0 || to < 0 || to >= order.length || from === to) return;
    const next = moveItem(order, from, to);
    setOrder(next);
    const item = byKey.get(key);
    setAnnounce(`${item?.kind === "video" ? "Video" : "Foto"} movido al lugar ${to + 1} de ${next.length}.`);
    scheduleSave(next);
    if (focus) requestAnimationFrame(() => handles.current.get(key)?.focus());
  }

  function onHandleKey(event: React.KeyboardEvent, key: string, index: number) {
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(key, index - 1, true);
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(key, index + 1, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      move(key, 0, true);
    } else if (event.key === "End") {
      event.preventDefault();
      move(key, order.length - 1, true);
    }
  }

  async function removeVideo(id: string) {
    if (!window.confirm("¿Quitar este video de la galería?")) return;
    setRemovingVideo(id);
    try {
      const result = await deleteProductVideoAction({ productId, id });
      if (!result.ok) setError(result.error);
      else router.refresh();
    } finally {
      setRemovingVideo(null);
    }
  }

  if (ordered.length === 0) {
    return <p className="text-sm text-muted-foreground">Este producto todavía no tiene fotos ni videos.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          Arrastrá para ordenar, o con el teclado: tabulá hasta el asa <GripVertical className="inline h-3 w-3" aria-hidden="true" /> y
          usá las flechas. Así lo ven los clientes en el portal y el catálogo. La primera foto es la principal.
        </p>
        <span className="inline-flex items-center gap-1" aria-hidden="true">
          {saveState === "saving" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Guardando orden…
            </>
          ) : saveState === "saved" ? (
            <span className="text-success">Orden guardado</span>
          ) : null}
        </span>
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {error ? (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" /> {error}
        </p>
      ) : null}

      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Fotos y videos del producto, en orden">
        {ordered.map((item, index) => {
          const key = galleryKey(item);
          const isPrimary = firstImageKey ? galleryKey(firstImageKey) === key : false;
          const label = item.kind === "video" ? `Video de ${videoProviderLabel(item.provider)}` : `Foto ${index + 1}`;
          return (
            <li
              key={key}
              draggable
              onDragStart={(event) => {
                setDragKey(key);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", key);
              }}
              onDragEnd={() => {
                setDragKey(null);
                setOverKey(null);
              }}
              onDragOver={(event) => {
                if (!dragKey) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (overKey !== key) setOverKey(key);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const from = dragKey ?? event.dataTransfer.getData("text/plain");
                setDragKey(null);
                setOverKey(null);
                if (from && from !== key) move(from, index);
              }}
              className={`relative overflow-hidden rounded-md border bg-card transition-shadow ${
                isPrimary ? "border-accent ring-2 ring-accent/40" : "border-border"
              } ${dragKey === key ? "opacity-40" : ""} ${overKey === key && dragKey !== key ? "ring-2 ring-primary" : ""}`}
            >
              <div className="aspect-square bg-secondary">
                {item.kind === "video" ? (
                  <VideoThumb provider={item.provider} videoId={item.videoId} title={item.title} />
                ) : brokenIds.has(item.id) ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    No carga: el sitio original ya no la muestra. Quitala y volvé a agregarla.
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={item.alt || ""}
                    draggable={false}
                    className="h-full w-full object-cover"
                    onError={() => setBrokenIds((prev) => new Set(prev).add(item.id))}
                    ref={(el) => {
                      if (el && el.complete && el.naturalWidth === 0 && !brokenIds.has(item.id)) {
                        setBrokenIds((prev) => new Set(prev).add(item.id));
                      }
                    }}
                  />
                )}
              </div>

              <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
                <span className="rounded bg-card/90 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums shadow">{index + 1}</span>
                {isPrimary ? (
                  <span className="inline-flex items-center gap-0.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground shadow">
                    <Star className="h-2.5 w-2.5" /> Principal
                  </span>
                ) : null}
                {item.kind === "video" ? <span className="rounded bg-neutral-900/85 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">Video</span> : null}
              </div>

              <button
                type="button"
                ref={(el) => {
                  if (el) handles.current.set(key, el);
                  else handles.current.delete(key);
                }}
                onKeyDown={(event) => onHandleKey(event, key, index)}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 cursor-grab items-center justify-center rounded bg-card/90 text-muted-foreground shadow hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
                aria-label={`${label}, lugar ${index + 1} de ${ordered.length}. Flechas para mover.`}
                title="Arrastrá o usá las flechas para mover"
              >
                <GripVertical className="h-4 w-4" aria-hidden="true" />
              </button>

              <div className="flex items-center justify-between gap-1 bg-card p-2">
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(key, index - 1)}
                    disabled={index === 0}
                    className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                    aria-label={`Mover ${label.toLowerCase()} antes`}
                    title="Mover antes"
                  >
                    <ArrowLeft className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(key, index + 1)}
                    disabled={index === ordered.length - 1}
                    className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                    aria-label={`Mover ${label.toLowerCase()} después`}
                    title="Mover después"
                  >
                    <ArrowRight className="h-3 w-3" />
                  </button>
                  <span className="ml-1 max-w-[5.5rem] truncate text-[10px] text-muted-foreground">
                    {item.kind === "video" ? videoProviderLabel(item.provider) : sourceLabel(item.source)}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  {item.kind === "image" ? (
                    <>
                      {!isPrimary ? (
                        <form action={setPrimaryImage}>
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="productId" value={productId} />
                          <button type="submit" className="inline-flex items-center gap-0.5 text-[10px] text-accent hover:underline" title="Llevar adelante y usar de tapa">
                            <Star className="h-2.5 w-2.5" />
                            Principal
                          </button>
                        </form>
                      ) : null}
                      <form action={deleteProductImage}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="productId" value={productId} />
                        <ConfirmSubmit confirmMessage="¿Quitar esta imagen?" className="inline-flex items-center gap-0.5 text-[10px] text-destructive">
                          <Trash2 className="h-2.5 w-2.5" />
                          Quitar
                        </ConfirmSubmit>
                      </form>
                    </>
                  ) : (
                    <>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] text-accent hover:underline">
                        <ExternalLink className="h-2.5 w-2.5" /> Abrir
                      </a>
                      <button
                        type="button"
                        onClick={() => void removeVideo(item.id)}
                        disabled={removingVideo === item.id}
                        className="inline-flex items-center gap-0.5 text-[10px] text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="h-2.5 w-2.5" /> Quitar
                      </button>
                    </>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
