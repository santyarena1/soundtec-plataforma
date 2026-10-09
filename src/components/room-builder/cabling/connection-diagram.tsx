"use client";

/**
 * Diagrama de conexiones a pantalla completa: bloques con sus puertos,
 * cables con el color de su señal, zoom con la rueda y descarga en SVG.
 */

import { useMemo, useRef, useState } from "react";
import { Download, Minus, Plus, X } from "lucide-react";
import { SIGNAL_INFO, type Signal } from "@/services/room-builder/device-ports";
import type { CablingPlan } from "@/services/room-builder/cabling";
import { buildDiagram } from "@/services/room-builder/connection-diagram";

export function DiagramSvg({ plan, highlight, onHover }: { plan: CablingPlan; highlight?: string | null; onHover?: (id: string | null) => void }) {
  const d = useMemo(() => buildDiagram(plan), [plan]);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${d.width} ${d.height}`} width={d.width} height={d.height} fontFamily="Inter, Arial, sans-serif">
      <rect width={d.width} height={d.height} fill="#ffffff" />
      {d.columns.map((t, c) => (
        <text key={t} x={30 + c * 370} y={30} fontSize={12} fontWeight={700} fill="#64748b" letterSpacing={1}>
          {t.toUpperCase()}
        </text>
      ))}
      {d.wires.map((w) => (
        <g key={w.id} onMouseEnter={() => onHover?.(w.id)} onMouseLeave={() => onHover?.(null)} opacity={highlight && highlight !== w.id ? 0.25 : 1}>
          <polyline points={w.points.map((p) => p.join(",")).join(" ")} fill="none" stroke={w.color} strokeWidth={highlight === w.id ? 3 : 1.8} strokeDasharray={w.dashed ? "6 4" : undefined} />
          <text x={(w.points[1]![0] + w.points[2]![0]) / 2 + 4} y={(w.points[1]![1] + w.points[2]![1]) / 2} fontSize={9} fill={w.color}>
            {w.label}
          </text>
        </g>
      ))}
      {d.blocks.map((b) => (
        <g key={b.id}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={8} fill={b.virtual ? "#f8fafc" : "#ffffff"} stroke={b.virtual ? "#94a3b8" : "#1e3553"} strokeWidth={1.2} strokeDasharray={b.virtual ? "4 3" : undefined} />
          <rect x={b.x} y={b.y} width={b.w} height={24} rx={8} fill={b.virtual ? "#e2e8f0" : "#1e3553"} />
          <rect x={b.x} y={b.y + 16} width={b.w} height={8} fill={b.virtual ? "#e2e8f0" : "#1e3553"} />
          <text x={b.x + 10} y={b.y + 16} fontSize={11} fontWeight={600} fill={b.virtual ? "#334155" : "#ffffff"}>
            {b.label.length > 34 ? `${b.label.slice(0, 33)}…` : b.label}
          </text>
          {b.inputs.map((p) => (
            <g key={`i${p.label}`}>
              <circle cx={b.x} cy={p.y} r={3.5} fill={p.used ? SIGNAL_INFO[p.signal].color : "#ffffff"} stroke={SIGNAL_INFO[p.signal].color} />
              <text x={b.x + 8} y={p.y + 3} fontSize={9.5} fill={p.used ? "#0f172a" : "#94a3b8"}>
                {p.label}
              </text>
            </g>
          ))}
          {b.outputs.map((p) => (
            <g key={`o${p.label}`}>
              <circle cx={b.x + b.w} cy={p.y} r={3.5} fill={p.used ? SIGNAL_INFO[p.signal].color : "#ffffff"} stroke={SIGNAL_INFO[p.signal].color} />
              <text x={b.x + b.w - 8} y={p.y + 3} fontSize={9.5} textAnchor="end" fill={p.used ? "#0f172a" : "#94a3b8"}>
                {p.label}
              </text>
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

export function ConnectionDiagram({ plan, title, onClose }: { plan: CablingPlan; title: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(0.8);
  const [hover, setHover] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const signals = [...new Set(plan.links.map((l) => l.signal))] as Signal[];
  const hovered = plan.links.find((l) => l.id === hover);
  const label = new Map(plan.nodes.map((n) => [n.id, n.label]));

  const download = () => {
    const svg = wrap.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\w\-]+/g, "_")}_diagrama.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/60 p-3 backdrop-blur-sm" role="dialog" aria-label="Diagrama de conexiones">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Diagrama de conexiones · {title}</h2>
            <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-600">
              {signals.map((s) => (
                <span key={s} className="inline-flex items-center gap-1">
                  <span className="inline-block h-0.5 w-4" style={{ background: SIGNAL_INFO[s].color }} /> {SIGNAL_INFO[s].label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} className="rounded-md border border-slate-200 p-1.5 hover:bg-slate-50" aria-label="Alejar">
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-12 text-center text-xs tabular-nums text-slate-600">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(2, z + 0.1))} className="rounded-md border border-slate-200 p-1.5 hover:bg-slate-50" aria-label="Acercar">
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" onClick={download} className="ml-2 inline-flex items-center gap-1 rounded-md bg-[#1e3553] px-2.5 py-1.5 text-xs font-semibold text-white">
              <Download className="h-3.5 w-3.5" /> SVG
            </button>
            <button type="button" onClick={onClose} className="ml-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div
          ref={wrap}
          className="min-h-0 flex-1 overflow-auto bg-slate-50"
          onWheel={(e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            setZoom((z) => Math.min(2, Math.max(0.3, z - e.deltaY * 0.001)));
          }}
        >
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
            <DiagramSvg plan={plan} highlight={hover} onHover={setHover} />
          </div>
        </div>
        <footer className="border-t border-slate-200 px-4 py-2 text-xs text-slate-600">
          {hovered ? (
            <>
              <b>{label.get(hovered.from)}</b> ({hovered.fromPort}) → <b>{label.get(hovered.to)}</b> ({hovered.toPort}) · {hovered.signal === "wireless" ? "inalámbrico" : `${hovered.cableM} m`}
              {hovered.note ? ` · ${hovered.note}` : ""}
            </>
          ) : (
            "Pasá el mouse por un cable para ver su detalle · Ctrl + rueda para zoom"
          )}
        </footer>
      </div>
    </div>
  );
}
