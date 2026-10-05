"use client";

import { useEffect, useState } from "react";

export interface ShowcaseSlide {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  brandLogo: string | null;
}

const SLIDE_MS = 4500;

/**
 * Vidriera: las fotos se funden una en otra con un zoom lento (Ken Burns).
 * Todas quedan montadas para que el cambio no espere a que cargue la imagen.
 */
export function Showcase({ slides }: { slides: ShowcaseSlide[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, [slides.length]);

  if (slides.length === 0) return null;
  const current = slides[index];

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[2.5vmin] bg-white shadow-[0_2vmin_6vmin_rgba(14,26,43,0.12)]">
      {slides.map((slide, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={slide.id}
          src={slide.imageUrl}
          alt={slide.name}
          className="absolute inset-0 h-full w-full object-contain p-[5%] transition-[opacity,transform] ease-out"
          style={{
            opacity: i === index ? 1 : 0,
            transform: i === index ? "scale(1.06)" : "scale(1)",
            transitionDuration: i === index ? `1200ms, ${SLIDE_MS + 1200}ms` : "1200ms, 1200ms",
          }}
          loading={i < 3 ? "eager" : "lazy"}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-[2vmin] bg-gradient-to-t from-white via-white/90 to-transparent px-[3vmin] pb-[2.5vmin] pt-[6vmin]">
        <div key={current.id} className="animate-[fadeUp_700ms_ease-out]">
          <p className="text-[1.6vmin] font-semibold uppercase tracking-[0.2em] text-[#778]">{current.brand}</p>
          <p className="text-[3.2vmin] font-semibold leading-tight text-[#0E1A2B]">{current.name}</p>
        </div>
        {current.brandLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${current.id}-logo`} src={current.brandLogo} alt="" className="h-[4vmin] w-auto max-w-[25%] object-contain opacity-80" />
        ) : null}
      </div>
      <div className="absolute right-[2.5vmin] top-[2.5vmin] flex gap-[0.6vmin]">
        {slides.map((s, i) => (
          <span
            key={s.id}
            className={`h-[0.7vmin] rounded-full transition-all duration-500 ${i === index ? "w-[3vmin] bg-[#0E1A2B]" : "w-[0.7vmin] bg-[#0E1A2B]/20"}`}
          />
        ))}
      </div>
    </div>
  );
}
