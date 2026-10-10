"use client";

/**
 * Diagrama de señal: cada equipo como bloque con sus puertos reales y cada
 * cable de puerto a puerto. Se conecta tocando un puerto y después otro
 * compatible; se mueven los bloques arrastrando el encabezado; rueda para
 * acercar y arrastrar el fondo para desplazar. Comparte selección y ficha
 * de edición con la planta: es el mismo cableado visto como esquema.
 */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Download, LayoutGrid, Maximize2 } from "lucide-react";
import type { CableLink } from "@/services/room-builder/cabling";
import { blockKey, layoutDiagram, type DiagramBlock, type DiagramPort, type DiagramPositions } from "@/services/room-builder/wiring/diagram-layout";
import type { WiringModel } from "@/services/room-builder/wiring/model";
import { signalsCompatible } from "@/services/room-builder/wiring/ports";
import { WIRE_SIGNAL_STYLE, type WirePort } from "@/services/room-builder/wiring/types";
import type { TechSelection } from "./technical-canvas";

type End = { deviceId: string; unit: number; portId: string };
type ViewBox = { x: number; y: number; w: number; h: number };
type Drag = { kind: "pan"; sx: number; sy: number; vb: ViewBox } | { kind: "block"; key: string; sx: number; sy: number; ox: number; oy: number; moved: boolean };

const MIN_W = 300;
const MAX_W = 12000;
const DRAG_PX = 3;
const PORT_R = 4.5;

type Props = {
  model: WiringModel;
  positions: DiagramPositions;
  selection: TechSelection;
  wiresWithIssues: Set<string>;
  /** Enlaces inalámbricos propuestos por el motor (cliente → gateway/receptor). */
  wireless: CableLink[];
  onSelect: (s: TechSelection) => void;
  onConnect: (a: End, b: End) => void;
  onMoveBlock: (key: string, x: number, y: number) => void;
  onResetLayout: () => void;
};

/** Se pueden unir dos puertos: misma familia de señal y sentidos complementarios. */
export function portsCompatible(a: WirePort, b: WirePort): boolean {
  if (!signalsCompatible(a.signal, b.signal)) return false;
  if (a.direction === "bidir" || b.direction === "bidir") return true;
  return a.direction !== b.direction;
}

export function TechnicalDiagram(p: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [live, setLive] = useState<DiagramPositions>({});
  const positions = useMemo(() => ({ ...p.positions, ...live }), [p.positions, live]);
  const d = useMemo(() => layoutDiagram(p.model, positions), [p.model, positions]);
  const fit = useMemo(() => ({ x: 0, y: 0, w: d.width, h: d.height }), [d.width, d.height]);
  const [vb, setVb] = useState<ViewBox>(fit);
  const [fitted, setFitted] = useState(false);
  useEffect(() => {
    if (!fitted && d.blocks.length) {
      setVb(fit);
      setFitted(true);
    }
  }, [fit, fitted, d.blocks.length]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState<{ end: End; port: WirePort } | null>(null);
  const [hoverWire, setHoverWire] = useState<string | null>(null);
  const [onlySignal, setOnlySignal] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPending(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const r = pt.matrixTransform(ctm.inverse());
    return { x: r.x, y: r.y };
  };

  function onWheel(e: React.WheelEvent) {
    const f = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const c = toSvg(e.clientX, e.clientY);
    setVb((v) => {
      const w = Math.min(MAX_W, Math.max(MIN_W, v.w * f));
      const k = w / v.w;
      return { x: c.x - (c.x - v.x) * k, y: c.y - (c.y - v.y) * k, w, h: v.h * k };
    });
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!drag) return;
    if (drag.kind === "pan") {
      const svg = svgRef.current;
      if (!svg) return;
      const scale = drag.vb.w / svg.clientWidth;
      setVb({ ...drag.vb, x: drag.vb.x - (e.clientX - drag.sx) * scale, y: drag.vb.y - (e.clientY - drag.sy) * scale });
      return;
    }
    const moved = drag.moved || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > DRAG_PX;
    if (!moved) return;
    const a = toSvg(drag.sx, drag.sy);
    const b = toSvg(e.clientX, e.clientY);
    setDrag({ ...drag, moved: true });
    setLive((l) => ({ ...l, [drag.key]: { x: Math.round(drag.ox + b.x - a.x), y: Math.round(drag.oy + b.y - a.y) } }));
  }

  function onPointerUp() {
    if (drag?.kind === "block") {
      const pos = live[drag.key];
      if (drag.moved && pos) p.onMoveBlock(drag.key, pos.x, pos.y);
      if (!drag.moved) {
        const b = d.blocks.find((x) => x.key === drag.key);
        if (b) p.onSelect({ kind: "device", deviceId: b.deviceId, unit: b.unit });
      }
    }
    setDrag(null);
  }

  // Al recibir las posiciones guardadas, se descartan las provisorias del arrastre.
  useEffect(() => setLive({}), [p.positions]);

  function clickPort(b: DiagramBlock, port: DiagramPort) {
    const end = { deviceId: b.deviceId, unit: b.unit, portId: port.id };
    if (!pending) {
      setPending({ end, port });
      return;
    }
    if (pending.end.deviceId === end.deviceId && pending.end.unit === end.unit && pending.end.portId === end.portId) {
      setPending(null);
      return;
    }
    if (!portsCompatible(pending.port, port)) return;
    // El cable va de la salida a la entrada, sin importar por cuál se empezó.
    const pendingIsSource = pending.port.direction === "out" || (pending.port.direction === "bidir" && port.direction !== "out");
    if (pendingIsSource) p.onConnect(pending.end, end);
    else p.onConnect(end, pending.end);
    setPending(null);
  }

  const selectedWire = p.selection?.kind === "wire" ? p.selection.id : null;
  const selectedBlock = p.selection?.kind === "device" ? blockKey(p.selection.deviceId, p.selection.unit) : null;
  const signals = useMemo(() => [...new Set(d.wires.map((w) => w.signal))], [d.wires]);
  const byKey = useMemo(() => new Map(d.blocks.map((b) => [b.key, b])), [d.blocks]);

  function exportSvg() {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("viewBox", `0 0 ${d.width} ${d.height}`);
    clone.setAttribute("width", String(d.width));
    clone.setAttribute("height", String(d.height));
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "diagrama-de-senal.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="relative h-full w-full bg-[#f8fafc]">
      <div className="absolute right-2 top-2 z-10 flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        <button type="button" onClick={() => setVb(fit)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100" title="Ver todo">
          <Maximize2 className="h-3.5 w-3.5" /> Ver todo
        </button>
        <button type="button" onClick={p.onResetLayout} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100" title="Vuelve a ordenar todos los bloques por flujo de señal">
          <LayoutGrid className="h-3.5 w-3.5" /> Ordenar
        </button>
        <button type="button" onClick={exportSvg} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">
          <Download className="h-3.5 w-3.5" /> SVG
        </button>
        <select value={onlySignal ?? ""} onChange={(e) => setOnlySignal(e.target.value || null)} className="rounded-md border border-slate-200 px-1.5 py-1 text-[11px]" aria-label="Filtrar por señal">
          <option value="">Todas las señales</option>
          {signals.map((s) => (
            <option key={s} value={s}>
              {WIRE_SIGNAL_STYLE[s].label}
            </option>
          ))}
        </select>
      </div>
      {pending ? (
        <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full bg-[#1e3553] px-3 py-1.5 text-xs font-semibold text-white shadow">
          Desde {pending.port.label}: tocá un puerto compatible (resaltado) · Esc cancela
        </div>
      ) : null}
      <svg
        ref={svgRef}
        className={`h-full w-full touch-none select-none ${drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab"}`}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        fontFamily="Inter, Arial, sans-serif"
        onWheel={onWheel}
        onPointerDown={(e) => {
          if (e.target === svgRef.current) {
            (e.target as Element).setPointerCapture(e.pointerId);
            setDrag({ kind: "pan", sx: e.clientX, sy: e.clientY, vb });
            p.onSelect(null);
          }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {d.columns.map((t, i) => {
          const xs = d.blocks.filter((b) => b.column === [...new Set(d.blocks.map((x) => x.column))].sort((a, c) => a - c)[i]).map((b) => b.x);
          return xs.length ? (
            <text key={`${t}-${i}`} x={Math.min(...xs)} y={36} fontSize={12} fontWeight={700} fill="#94a3b8" letterSpacing={1} pointerEvents="none">
              {t.toUpperCase()}
            </text>
          ) : null;
        })}

        {/* Enlaces inalámbricos (no son cables): punteados entre los bordes de los bloques. */}
        {p.wireless.map((l) => {
          const a = byKey.get(l.from);
          const b = byKey.get(l.to);
          if (!a || !b) return null;
          return (
            <g key={l.id} pointerEvents="none" opacity={0.7}>
              <line x1={a.x + a.w / 2} y1={a.y} x2={b.x + b.w / 2} y2={b.y + b.h} stroke="#a855f7" strokeWidth={1.4} strokeDasharray="5 5" />
              <text x={(a.x + b.x + a.w) / 2} y={(a.y + b.y + b.h) / 2} fontSize={10} fill="#7e22ce">
                {l.protocol ?? "inalámbrico"}
              </text>
            </g>
          );
        })}

        {d.wires.map((w) => {
          const dim = (onlySignal && w.signal !== onlySignal) || (selectedWire && selectedWire !== w.id && hoverWire !== w.id);
          const strong = selectedWire === w.id || hoverWire === w.id;
          const mid = w.points[2]!;
          const mid2 = w.points[3]!;
          return (
            <g key={w.id} opacity={dim ? 0.18 : 1} onPointerEnter={() => setHoverWire(w.id)} onPointerLeave={() => setHoverWire(null)} onPointerDown={(e) => { e.stopPropagation(); p.onSelect({ kind: "wire", id: w.id }); }} className="cursor-pointer">
              <polyline points={w.points.map((q) => q.join(",")).join(" ")} fill="none" stroke="transparent" strokeWidth={10} />
              <polyline points={w.points.map((q) => q.join(",")).join(" ")} fill="none" stroke={w.color} strokeWidth={strong ? 3 : 1.6} strokeLinejoin="round" />
              {p.wiresWithIssues.has(w.id) ? <circle cx={mid[0]} cy={(mid[1] + mid2[1]) / 2} r={5} fill="#e11d48" /> : null}
              {w.label ? (
                <text x={mid[0] + 4} y={(mid[1] + mid2[1]) / 2 - 3} fontSize={9} fill={w.color} fontWeight={600}>
                  {w.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {d.blocks.map((b) => {
          const sel = selectedBlock === b.key;
          return (
            <g key={b.key}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} fill={b.remote ? "#f8fafc" : "#ffffff"} stroke={sel ? "#f59e0b" : b.remote ? "#94a3b8" : "#1e3553"} strokeWidth={sel ? 2.4 : 1.2} strokeDasharray={b.remote ? "5 3" : undefined} />
              <g
                className="cursor-move"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture(e.pointerId);
                  setDrag({ kind: "block", key: b.key, sx: e.clientX, sy: e.clientY, ox: b.x, oy: b.y, moved: false });
                }}
              >
                <rect x={b.x} y={b.y} width={b.w} height={28} rx={6} fill={b.remote ? "#e2e8f0" : "#1e3553"} />
                <rect x={b.x} y={b.y + 20} width={b.w} height={8} fill={b.remote ? "#e2e8f0" : "#1e3553"} />
                <text x={b.x + 8} y={b.y + 13} fontSize={10.5} fontWeight={700} fill={b.remote ? "#334155" : "#ffffff"}>
                  {b.short.length > 34 ? `${b.short.slice(0, 33)}…` : b.short}
                </text>
                <text x={b.x + 8} y={b.y + 24} fontSize={8.5} fill={b.remote ? "#64748b" : "#cbd5e1"}>
                  {b.remote ? "RACK CENTRAL" : b.label.length > 44 ? `${b.label.slice(0, 43)}…` : b.label}
                </text>
              </g>
              {b.noPorts ? (
                <text x={b.x + 10} y={b.y + 48} fontSize={10} fill="#b45309">
                  Sin puertos cargados: cargalos en su ficha
                </text>
              ) : null}
              {b.ports.map((port) => {
                const px = port.side === "left" ? b.x : b.x + b.w;
                const py = b.y + port.y;
                const color = WIRE_SIGNAL_STYLE[port.signal].color;
                const isPending = pending && pending.end.deviceId === b.deviceId && pending.end.unit === b.unit && pending.end.portId === port.id;
                const usable = pending && !isPending ? portsCompatible(pending.port, port) && (port.used === 0 || port.signal === "speaker") : true;
                return (
                  <g key={port.id} opacity={pending && !usable && !isPending ? 0.25 : 1} className={usable ? "cursor-crosshair" : "cursor-not-allowed"} onPointerDown={(e) => { e.stopPropagation(); if (usable || isPending) clickPort(b, port); }}>
                    <rect x={port.side === "left" ? b.x + 1 : b.x + b.w / 2} y={py - 8} width={b.w / 2 - 1} height={16} fill={isPending ? "#fef3c7" : "transparent"} />
                    <circle cx={px} cy={py} r={pending && usable && !isPending ? PORT_R + 1.5 : PORT_R} fill={port.used ? color : "#ffffff"} stroke={color} strokeWidth={1.6} />
                    <text x={port.side === "left" ? px + 9 : px - 9} y={py + 3.2} fontSize={9.5} textAnchor={port.side === "left" ? "start" : "end"} fill="#1f2937">
                      {port.label}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[11px] text-slate-500">
        Tocá un puerto y después otro compatible para cablear · arrastrá el encabezado para mover · rueda para acercar
      </p>
    </div>
  );
}
