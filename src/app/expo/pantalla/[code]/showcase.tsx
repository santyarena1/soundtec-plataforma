"use client";

import { useEffect, useState } from "react";

export interface ShowcaseSlide {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  brandLogo: string | null;
}

const SLIDE_MS = 5000;

/**
 * Vidriera: las fotos se funden una en otra con un zoom lento (Ken Burns).
 * `delayMs` desfasa dos vidrieras en pantalla para que no cambien a la vez.
 */
export function Showcase({
  slides,
  delayMs = 0,
  className = "",
}: {
  slides: ShowcaseSlide[];
  delayMs?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      setIndex((i) => (i + 1) % slides.length);
      timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
    }, SLIDE_MS + delayMs);
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
    };
  }, [slides.length, delayMs]);

  if (slides.length === 0) return null;
  const current = slides[index];

  return (
    <div
      className={`relative overflow-hidden rounded-[3vmin] bg-white shadow-[0_2vmin_6vmin_rgba(30,53,82,0.14)] ${className}`}
    >
      {slides.map((slide, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={slide.id}
          src={slide.imageUrl}
          alt={slide.name}
          className="absolute inset-0 h-full w-full object-contain p-[9%] pb-[24%] ease-out"
          style={{
            opacity: i === index ? 1 : 0,
            transform: i === index ? "scale(1.07)" : "scale(1)",
            transitionProperty: "opacity, transform",
            transitionDuration: i === index ? `1400ms, ${SLIDE_MS + 1400}ms` : "1400ms, 1400ms",
          }}
          loading={i < 2 ? "eager" : "lazy"}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 px-[3vmin] pb-[3vmin]">
        <div key={current.id} className="flex items-end justify-between gap-[2vmin] animate-[fadeUp_800ms_ease-out]">
          <div className="min-w-0">
            <p className="text-[1.5vmin] font-semibold uppercase tracking-[0.22em] text-[#1E3552]/60">{current.brand}</p>
            <p className="truncate text-[2.8vmin] font-semibold leading-tight text-[#1E3552]">{current.name}</p>
          </div>
          {current.brandLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.brandLogo} alt="" className="h-[3.6vmin] w-auto max-w-[30%] shrink-0 object-contain" />
          ) : null}
        </div>
        <div className="mt-[1.8vmin] h-[0.4vmin] w-full overflow-hidden rounded-full bg-[#1E3552]/10">
          <div key={`bar-${current.id}`} className="h-full bg-[#1E3552]/60 animate-[progress_linear_forwards]" style={{ animationDuration: `${SLIDE_MS}ms` }} />
        </div>
      </div>
    </div>
  );
}
