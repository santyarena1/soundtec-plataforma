"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, X, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";

interface Image {
  id: string;
  url: string;
  alt?: string | null;
}

interface Props {
  images: Image[];
  productName: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;

/**
 * El marco de la foto se adapta a la proporción de la foto.
 *
 * Con un marco fijo de 4:3 una foto cuadrada, que es el formato de casi todo
 * el catálogo, se dibujaba chica y centrada con bandas blancas a los costados,
 * y la columna de texto de al lado quedaba enorme en comparación. Los límites
 * evitan que una foto muy apaisada o muy alargada deforme la ficha.
 */
const MIN_FRAME_RATIO = 0.8;
const MAX_FRAME_RATIO = 1.6;
const DEFAULT_FRAME_RATIO = 1;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Galería del producto con lightbox y zoom.
 *
 * El zoom importa: en una ficha técnica lo que se quiere mirar de cerca son los
 * bornes, los conectores y las medidas, y hasta ahora la imagen ampliada
 * quedaba fija al alto de la pantalla sin poder acercarse.
 *
 * Se puede con la rueda del mouse, con dos dedos en una pantalla táctil, con
 * doble click y con los botones. Con la imagen ampliada se arrastra para
 * recorrerla.
 */
export function ProductGallery({ images, productName }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [frameRatio, setFrameRatio] = useState(DEFAULT_FRAME_RATIO);

  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const close = useCallback(() => {
    setLightbox(false);
    reset();
  }, [reset]);

  const go = useCallback(
    (delta: number) => {
      setActiveIdx((i) => (i + delta + images.length) % images.length);
      reset();
    },
    [images.length, reset]
  );

  /** Multiplica el zoom vigente. Seguro ante clicks rápidos o teclas repetidas. */
  const zoomBy = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const frame = frameRef.current;
    setScale((current) => {
      const target = clamp(current * factor, MIN_SCALE, MAX_SCALE);
      if (target === MIN_SCALE) {
        setOffset({ x: 0, y: 0 });
      } else if (frame && clientX !== undefined && clientY !== undefined && target !== current) {
        const rect = frame.getBoundingClientRect();
        const px = clientX - rect.left - rect.width / 2;
        const py = clientY - rect.top - rect.height / 2;
        const ratio = target / current;
        setOffset((prev) => ({ x: px - (px - prev.x) * ratio, y: py - (py - prev.y) * ratio }));
      }
      return target;
    });
  }, []);

  /** Fija un zoom exacto. Lo usa el gesto de dos dedos, que parte de una escala conocida. */
  const zoomAt = useCallback((nextScale: number, clientX?: number, clientY?: number) => {
    const frame = frameRef.current;
    setScale((current) => {
      const target = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      if (frame && clientX !== undefined && clientY !== undefined && target !== current) {
        const rect = frame.getBoundingClientRect();
        const px = clientX - rect.left - rect.width / 2;
        const py = clientY - rect.top - rect.height / 2;
        const ratio = target / current;
        setOffset((prev) => ({
          x: target === MIN_SCALE ? 0 : px - (px - prev.x) * ratio,
          y: target === MIN_SCALE ? 0 : py - (py - prev.y) * ratio,
        }));
      } else if (target === MIN_SCALE) {
        setOffset({ x: 0, y: 0 });
      }
      return target;
    });
  }, []);

  // Teclado: cerrar, navegar y acercar sin tocar el mouse.
  useEffect(() => {
    if (!lightbox) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      else if (event.key === "ArrowRight" && images.length > 1) go(1);
      else if (event.key === "ArrowLeft" && images.length > 1) go(-1);
      else if (event.key === "+" || event.key === "=") zoomBy(1.4);
      else if (event.key === "-") zoomBy(1 / 1.4);
      else if (event.key === "0") reset();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, close, go, images.length, zoomBy, reset]);

  // Con el lightbox abierto la página de atrás no se mueve.
  useEffect(() => {
    if (!lightbox) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [lightbox]);

  if (images.length === 0) {
    return (
      <div className="aspect-square overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Producto sin imagen
        </div>
      </div>
    );
  }

  const active = images[activeIdx] ?? images[0];

  function onWheel(event: React.WheelEvent) {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.2 : 1 / 1.2, event.clientX, event.clientY);
  }

  function onPointerDown(event: React.PointerEvent) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale };
      drag.current = null;
      return;
    }
    if (scale > 1) {
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
      drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const factor = distance / pinchStart.current.distance;
      zoomAt(pinchStart.current.scale * factor, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }

    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + (event.clientX - drag.current.x),
      y: drag.current.oy + (event.clientY - drag.current.y),
    });
  }

  function onPointerUp(event: React.PointerEvent) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) drag.current = null;
  }

  const zoomed = scale > 1;

  return (
    <div className="space-y-3">
      {/* Imagen principal */}
      <button
        type="button"
        onClick={() => setLightbox(true)}
        className="group relative block w-full overflow-hidden rounded-xl border border-border bg-white p-3 shadow-sm"
        style={{ aspectRatio: String(frameRatio) }}
        aria-label="Ver imagen ampliada"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={active.url}
          alt={active.alt || productName}
          className="h-full w-full object-contain transition-transform group-hover:scale-[1.02]"
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (!naturalWidth || !naturalHeight) return;
            setFrameRatio(clamp(naturalWidth / naturalHeight, MIN_FRAME_RATIO, MAX_FRAME_RATIO));
          }}
        />
        <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-card/85 px-2 py-1 text-[11px] font-medium text-foreground shadow opacity-0 transition-opacity group-hover:opacity-100">
          <ZoomIn className="h-3 w-3" /> Ampliar
        </span>
        {images.length > 1 ? (
          <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center rounded-full bg-card/85 px-2 py-1 text-[11px] font-medium text-muted-foreground shadow">
            {activeIdx + 1} / {images.length}
          </span>
        ) : null}
      </button>

      {/* Thumbnails */}
      {images.length > 1 ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {images.slice(0, 10).map((img, i) => {
            const isActive = i === activeIdx;
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => {
                  setActiveIdx(i);
                  reset();
                }}
                className={`aspect-square overflow-hidden rounded-md border-2 bg-white transition-all ${
                  isActive
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border opacity-70 hover:opacity-100 hover:border-primary/40"
                }`}
                aria-label={`Imagen ${i + 1}`}
                aria-current={isActive}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.alt || `${productName} ${i + 1}`}
                  className="h-full w-full object-contain"
                />
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Lightbox */}
      {lightbox ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/90 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label={`${productName}, imagen ampliada`}
        >
          {/* Barra de controles */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 text-white sm:px-4">
            <p className="truncate text-sm text-white/80">
              {productName}
              {images.length > 1 ? ` · ${activeIdx + 1} de ${images.length}` : ""}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => zoomBy(1 / 1.4)}
                disabled={scale <= MIN_SCALE}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40"
                aria-label="Alejar"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-white/80">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => zoomBy(1.4)}
                disabled={scale >= MAX_SCALE}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40"
                aria-label="Acercar"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={!zoomed}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40"
                aria-label="Ajustar a la pantalla"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={close}
                className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Lienzo */}
          <div
            ref={frameRef}
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={(event) =>
              zoomed ? reset() : zoomAt(2.5, event.clientX, event.clientY)
            }
            onClick={(event) => {
              // Un click en el fondo cierra; sobre la imagen, no.
              if (event.target === event.currentTarget && !zoomed) close();
            }}
            style={{ touchAction: "none", cursor: zoomed ? (drag.current ? "grabbing" : "grab") : "zoom-in" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.url}
              alt={active.alt || productName}
              draggable={false}
              className="max-h-full max-w-full select-none object-contain"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transition: drag.current || pinchStart.current ? "none" : "transform 120ms ease-out",
              }}
            />

            {images.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                  aria-label="Siguiente"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            ) : null}
          </div>

          <p className="px-4 pb-3 text-center text-[11px] text-white/50">
            Rueda del mouse o dos dedos para acercar · doble click para alternar · arrastrá para
            recorrer · Esc para cerrar
          </p>
        </div>
      ) : null}
    </div>
  );
}
