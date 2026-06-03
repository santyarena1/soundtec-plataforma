"use client";

import { useState } from "react";
import { ZoomIn, X, ChevronLeft, ChevronRight } from "lucide-react";

interface Image {
  id: string;
  url: string;
  alt?: string | null;
}

interface Props {
  images: Image[];
  productName: string;
}

/**
 * Galería de imágenes del producto con thumbnails clickeables y lightbox.
 *
 * - La imagen grande es la activa; los thumbnails permiten cambiarla.
 * - Click en la imagen grande abre lightbox a pantalla completa.
 * - En el lightbox, flechas izq/der navegan entre imágenes.
 * - Botón Esc o click fuera cierra.
 */
export function ProductGallery({ images, productName }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  if (images.length === 0) {
    return (
      <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Producto sin imagen
        </div>
      </div>
    );
  }

  const active = images[activeIdx] ?? images[0];

  function next() {
    setActiveIdx((i) => (i + 1) % images.length);
  }
  function prev() {
    setActiveIdx((i) => (i - 1 + images.length) % images.length);
  }

  return (
    <div className="space-y-3">
      {/* Imagen principal */}
      <button
        type="button"
        onClick={() => setLightbox(true)}
        className="group relative block aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-white shadow-sm"
        aria-label="Ver imagen ampliada"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={active.url}
          alt={active.alt || productName}
          className="h-full w-full object-contain transition-transform group-hover:scale-[1.02]"
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
                onClick={() => setActiveIdx(i)}
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
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 animate-in fade-in duration-200"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(false);
            }}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>

          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                aria-label="Anterior"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                aria-label="Siguiente"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}

          <div
            className="relative max-h-full max-w-6xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.url}
              alt={active.alt || productName}
              className="max-h-[85vh] max-w-full object-contain"
            />
            {images.length > 1 ? (
              <p className="mt-3 text-center text-sm text-white/80">
                {activeIdx + 1} de {images.length}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
