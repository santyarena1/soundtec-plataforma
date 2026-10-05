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
  layout = "stacked",
}: {
  slides: ShowcaseSlide[];
  delayMs?: number;
  className?: string;
  /** stacked: foto arriba y datos abajo. side: foto a la derecha, nombre y marca a la izquierda. */
  layout?: "stacked" | "side";
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
  const isSide = layout === "side";
  const imageClass = isSide
    ? "absolute right-[2.5%] top-[7%] h-[86%] w-[58%] object-contain p-[4%]"
    : "absolute inset-0 h-full w-full object-contain px-[3%] pt-[3%] pb-[17%]";

  return (
    <div
      className={`relative overflow-hidden rounded-[3vmin] bg-white shadow-[0_2vmin_6vmin_rgba(30,53,82,0.14)] ${className}`}
    >
      {isSide ? (
        <div className="absolute right-[2.5%] top-[7%] h-[86%] w-[58%] rounded-[2.4vmin] bg-[radial-gradient(ellipse_at_center,#ffffff_0%,#f1f4f8_65%,#e4e9f0_100%)] ring-1 ring-[#1E3552]/5" />
      ) : null}
      {slides.map((slide, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={slide.id}
          src={slide.imageUrl}
          alt={slide.name}
          className={`${imageClass} ease-out`}
          style={{
            opacity: i === index ? 1 : 0,
            transform: i === index ? "scale(1.07)" : "scale(1)",
            transitionProperty: "opacity, transform",
            transitionDuration: i === index ? `1400ms, ${SLIDE_MS + 1400}ms` : "1400ms, 1400ms",
          }}
          loading={i < 2 ? "eager" : "lazy"}
        />
      ))}
      {isSide ? (
        <div key={current.id} className="absolute inset-y-0 left-0 flex w-[39.5%] flex-col justify-between gap-[1.5vmin] pb-[4.2vmin] pl-[4vmin] pr-[2vmin] pt-[3.6vmin] animate-[fadeUp_800ms_ease-out]">
          <div className="min-w-0">
            <p className="text-[1.9vmin] font-semibold uppercase tracking-[0.24em] text-[#1E3552]/50">{current.brand}</p>
            <p className="mt-[1vmin] line-clamp-3 break-words text-[4.4vmin] font-semibold leading-[1.06] tracking-tight text-[#1E3552]">{current.name}</p>
            <span className="mt-[2vmin] block h-[0.6vmin] w-[7vmin] rounded-full bg-[#1E3552]" />
          </div>
          {current.brandLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.brandLogo} alt={current.brand} className="h-[8vmin] w-auto max-w-full shrink-0 self-start object-contain object-left" />
          ) : (
            <p className="text-[2.4vmin] font-semibold uppercase tracking-[0.22em] text-[#1E3552]/60">{current.brand}</p>
          )}
        </div>
      ) : null}
      {isSide ? (
        <div className="absolute bottom-[2vmin] left-[4vmin] w-[calc(39.5%-6vmin)] overflow-hidden rounded-full bg-[#1E3552]/10 h-[0.5vmin]">
          <div key={`bar-${current.id}`} className="h-full rounded-full bg-[#1E3552]/60 animate-[progress_linear_forwards]" style={{ animationDuration: `${SLIDE_MS}ms` }} />
        </div>
      ) : (
      <div className="absolute inset-x-0 bottom-0 px-[3vmin] pb-[3vmin]">
        <div key={current.id} className="flex items-end justify-between gap-[2vmin] animate-[fadeUp_800ms_ease-out]">
          <div className="min-w-0">
            <p className="text-[1.5vmin] font-semibold uppercase tracking-[0.22em] text-[#1E3552]/60">{current.brand}</p>
            <p className="truncate text-[2.8vmin] font-semibold leading-tight text-[#1E3552]">{current.name}</p>
          </div>
          {current.brandLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.brandLogo} alt="" className="h-[6vmin] w-auto max-w-[34%] shrink-0 object-contain" />
          ) : null}
        </div>
        <div className="mt-[1.8vmin] h-[0.4vmin] w-full overflow-hidden rounded-full bg-[#1E3552]/10">
          <div key={`bar-${current.id}`} className="h-full bg-[#1E3552]/60 animate-[progress_linear_forwards]" style={{ animationDuration: `${SLIDE_MS}ms` }} />
        </div>
      </div>
      )}
    </div>
  );
}
