"use client";

import { useRef } from "react";
import { DEFAULT_BRANDS_PLACEMENT, resolveImagePlacement, type ImagePlacement } from "@/lib/quote-defaults";

function marginFor(align: ImagePlacement["align"]) {
  if (align === "center") return "0 auto";
  if (align === "right") return "0 0 0 auto";
  return "0 auto 0 0";
}

export function ResizableQuoteImage({
  src,
  alt,
  placement,
  editable,
  onChange,
}: {
  src: string;
  alt: string;
  placement?: ImagePlacement | null;
  editable: boolean;
  onChange: (next: ImagePlacement) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const safe = resolveImagePlacement(placement, DEFAULT_BRANDS_PLACEMENT);

  function startDrag(edge: "east" | "west", event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const wrap = wrapRef.current;
    const parent = wrap?.parentElement;
    if (!wrap || !parent) return;
    const startX = event.clientX;
    const startPx = wrap.offsetWidth;
    const parentPx = parent.clientWidth || 1;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const nextPx = edge === "east" ? startPx + dx : startPx - dx;
      const width = Math.min(100, Math.max(10, Math.round((nextPx / parentPx) * 100)));
      onChange({ width, align: safe.align });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div>
      <div
        ref={wrapRef}
        className="quote-doc__live-image mt-[3mm]"
        style={{ width: `${safe.width}%`, margin: marginFor(safe.align) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} />
        {editable ? (
          <>
            <button
              type="button"
              aria-label="Redimensionar desde la izquierda"
              className="quote-doc__live-handle quote-doc__live-handle--west print:hidden"
              onPointerDown={(event) => startDrag("west", event)}
            />
            <button
              type="button"
              aria-label="Redimensionar desde la derecha"
              className="quote-doc__live-handle quote-doc__live-handle--east print:hidden"
              onPointerDown={(event) => startDrag("east", event)}
            />
          </>
        ) : null}
      </div>
      {editable ? (
        <div className="quote-doc__live-image-tools quote-doc__live-chrome mt-[2mm] print:hidden">
          <span className="quote-doc__live-hint">{safe.width}%</span>
          {(["left", "center", "right"] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => onChange({ width: safe.width, align })}
              className={`rounded px-2 py-0.5 text-[10px] capitalize ${
                safe.align === align ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {align === "left" ? "Izquierda" : align === "center" ? "Centro" : "Derecha"}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
