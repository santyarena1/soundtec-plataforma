"use client";

import { useEffect, useState } from "react";
import { Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "soundtec.quoteCanvasZoom";
const LEVELS = [0.55, 0.75, 1] as const;
const DEFAULT_ZOOM = 0.75;

function nearestLevel(value: number) {
  return LEVELS.reduce((best, level) => (Math.abs(level - value) < Math.abs(best - value) ? level : best), LEVELS[0]);
}

export function QuotePreviewZoom({ children }: { children: React.ReactNode }) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    if (LEVELS.includes(saved as (typeof LEVELS)[number])) setZoom(saved);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, String(zoom));
  }, [ready, zoom]);

  function step(delta: -1 | 1) {
    const index = LEVELS.indexOf(nearestLevel(zoom) as (typeof LEVELS)[number]);
    const next = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, index + delta))];
    setZoom(next);
  }

  const toolbar = (
    <div className="quote-preview-toolbar print:hidden">
      <p className="text-xs font-medium">Vista del documento</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" variant="outline" onClick={() => step(-1)} disabled={zoom <= LEVELS[0]}>
          <ZoomOut className="h-3.5 w-3.5" />
          Reducir
        </Button>
        {LEVELS.map((level) => (
          <Button
            key={level}
            type="button"
            size="sm"
            variant={nearestLevel(zoom) === level ? "primary" : "outline"}
            onClick={() => setZoom(level)}
          >
            {Math.round(level * 100)}%
          </Button>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => step(1)} disabled={zoom >= LEVELS[LEVELS.length - 1]}>
          <ZoomIn className="h-3.5 w-3.5" />
          Ampliar
        </Button>
        <Button type="button" size="sm" variant={expanded ? "secondary" : "primary"} onClick={() => setExpanded((v) => !v)}>
          {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {expanded ? "Cerrar vista amplia" : "Ampliar vista"}
        </Button>
      </div>
    </div>
  );

  const sheet = (
    <div className="overflow-x-auto bg-neutral-300/40 p-6">
      <div style={{ zoom }}>{children}</div>
    </div>
  );

  if (expanded) {
    return (
      <>
        <div className="quote-preview-lightbox print:hidden">
          <div className="quote-preview-lightbox__bar">
            {toolbar}
          </div>
          <div className="quote-preview-lightbox__body">{sheet}</div>
        </div>
        <div className="hidden print:block">{children}</div>
      </>
    );
  }

  return (
    <div className="space-y-3">
      {toolbar}
      {sheet}
    </div>
  );
}
