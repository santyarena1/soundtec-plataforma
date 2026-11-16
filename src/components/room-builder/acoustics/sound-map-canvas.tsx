"use client";

/**
 * Planta del ambiente con el mapa de sonido encima: celdas coloreadas de la
 * grilla de cálculo, contorno del piso, parlantes con su círculo de cobertura
 * a la altura de oído (arrastrables) y, si hay, la grilla sugerida en
 * punteado. Al pasar el mouse muestra el valor del punto.
 */

import { useMemo, useRef, useState } from "react";
import { heatCells, type HeatMode } from "@/services/room-builder/acoustics/heatmap";
import type { SoundMapResult } from "@/services/room-builder/acoustics/sound-map";
import { pointInPolygon } from "@/services/room-builder/plan-polygon";

type Pt = { x: number; y: number };

export type CanvasSpeaker = { key: string; deviceId: string; unit: number; x: number; z: number; label: string; radiusM: number | null };

const MARGIN_M = 0.6;
const SPEAKER_R = 0.16;
const fmt = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

export function SoundMapCanvas({
  result,
  mode,
  floor,
  speakers,
  ghost,
  onDrag,
  onDrop,
}: {
  result: SoundMapResult;
  mode: HeatMode;
  floor: Pt[];
  speakers: CanvasSpeaker[];
  /** Grilla sugerida a previsualizar (posiciones y radio de cobertura). */
  ghost: { positions: Pt[]; radiusM: number } | null;
  onDrag: (s: CanvasSpeaker, x: number, z: number) => void;
  onDrop: (s: CanvasSpeaker, x: number, z: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<CanvasSpeaker | null>(null);
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const cells = useMemo(() => heatCells(result, mode), [result, mode]);

  const xs = floor.map((p) => p.x);
  const ys = floor.map((p) => p.y);
  const vb = { x: Math.min(...xs) - MARGIN_M, y: Math.min(...ys) - MARGIN_M, w: Math.max(...xs) - Math.min(...xs) + 2 * MARGIN_M, h: Math.max(...ys) - Math.min(...ys) + 2 * MARGIN_M };
  const font = Math.max(0.16, Math.min(vb.w, vb.h) / 40);

  const toMeters = (e: React.PointerEvent): { x: number; z: number } | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: Math.round(p.x * 100) / 100, z: Math.round(p.y * 100) / 100 };
  };

  // Valor del punto bajo el mouse (la celda de la grilla que lo contiene).
  const readout = (() => {
    if (!hover) return null;
    const g = result.grid;
    const c = Math.round((hover.x - g.x0) / g.step);
    const r = Math.round((hover.z - g.z0) / g.step);
    if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return null;
    const i = r * g.cols + c;
    const spl = g.spl[i];
    if (spl == null) return null;
    const sti = g.sti[i];
    const dir = g.direct[i];
    return `${fmt(spl)} dB${dir != null ? ` (directo ${fmt(dir)})` : ""}${sti != null ? ` · STI ${fmt(sti, 2)}` : ""}`;
  })();

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="h-full w-full touch-none select-none"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Mapa de sonido en planta"
        onPointerMove={(e) => {
          const p = toMeters(e);
          if (!p) return;
          setHover(p);
          if (drag && pointInPolygon({ x: p.x, y: p.z }, floor)) onDrag(drag, p.x, p.z);
        }}
        onPointerLeave={() => setHover(null)}
        onPointerUp={(e) => {
          if (!drag) return;
          const p = toMeters(e);
          if (p && pointInPolygon({ x: p.x, y: p.z }, floor)) onDrop(drag, p.x, p.z);
          else onDrop(drag, drag.x, drag.z);
          setDrag(null);
        }}
      >
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#f8fafc" />
        {/* Celdas opacas que se solapan apenas (sin costuras); la transparencia va por grupo para no oscurecer los solapes. */}
        {[true, false].map((aud) => (
          <g key={String(aud)} shapeRendering="crispEdges" opacity={aud ? 0.9 : 0.45}>
            {cells
              .filter((c) => c.audience === aud)
              .map((c, i) => (
                <rect key={i} x={c.x - c.size / 2} y={c.z - c.size / 2} width={c.size * 1.04} height={c.size * 1.04} fill={c.color} />
              ))}
          </g>
        ))}
        <polygon points={floor.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#0f172a" strokeWidth={0.08} strokeLinejoin="round" />
        {ghost ? (
          <g>
            {ghost.positions.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={ghost.radiusM} fill="none" stroke="#1e3553" strokeWidth={0.025} strokeDasharray="0.12 0.08" />
                <circle cx={p.x} cy={p.y} r={SPEAKER_R * 0.7} fill="#ffffff" stroke="#1e3553" strokeWidth={0.04} strokeDasharray="0.06 0.04" />
              </g>
            ))}
          </g>
        ) : null}
        {speakers.map((s, i) => (
          <g key={s.key}>
            {s.radiusM ? <circle cx={s.x} cy={s.z} r={s.radiusM} fill="none" stroke="#ffffff" strokeOpacity={0.85} strokeWidth={0.03} strokeDasharray="0.1 0.07" /> : null}
            <circle
              cx={s.x}
              cy={s.z}
              r={SPEAKER_R}
              fill="#ffffff"
              stroke="#ea580c"
              strokeWidth={0.05}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => {
                e.stopPropagation();
                svgRef.current?.setPointerCapture(e.pointerId);
                setDrag(s);
              }}
            >
              <title>{`${s.label} — arrastrá para moverlo`}</title>
            </circle>
            <text x={s.x} y={s.z + font * 0.35} fontSize={font} textAnchor="middle" fill="#9a3412" fontWeight={700} pointerEvents="none">
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      {readout ? <div className="pointer-events-none absolute left-2 top-2 rounded bg-slate-900/85 px-2 py-1 text-[11px] font-medium text-white">{readout}</div> : null}
    </div>
  );
}
