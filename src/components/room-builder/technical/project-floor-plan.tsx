"use client";

/**
 * Planta del proyecto: todos los ambientes de un piso con sus equipos y
 * cables, el rack (se arrastra a donde va) y las troncales que salen del
 * rack hacia cada ambiente con la cantidad de cables por tipo. Sobre el
 * plano subido o, si no hay, en una planta esquemática a escala.
 */

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Maximize2, Server } from "lucide-react";
import type { FloorRoom, ProjectFloor } from "@/services/room-builder/project-technical";

const LEVELS = ["Subsuelo", "Planta baja", "Primer piso", "Segundo piso", "Tercer piso", "Terraza / exterior"];
/** Planta esquemática: px por metro y separación entre ambientes. */
const S = 40;
const GAP = 36;
const ROW_W = 1500;
const MARGIN = 60;

type Placed = FloorRoom & { map: (x: number, z: number) => { x: number; y: number }; rect: { x: number; y: number; w: number; h: number } };

function placeRooms(rooms: FloorRoom[], image: ProjectFloor["image"]): { placed: Placed[]; width: number; height: number; planMode: boolean } {
  const planMode = Boolean(image && rooms.length && rooms.every((r) => r.box));
  if (planMode && image) {
    const W = image.widthPx;
    const H = image.heightPx;
    const placed = rooms.map((r) => {
      const b = r.box!;
      const cx = ((b.x0 + b.x1) / 2) * W;
      const cy = ((b.y0 + b.y1) / 2) * H;
      const sx = ((b.x1 - b.x0) * W) / Math.max(0.5, r.widthM);
      const sz = ((b.y1 - b.y0) * H) / Math.max(0.5, r.depthM);
      return { ...r, map: (x: number, z: number) => ({ x: cx + x * sx, y: cy + z * sz }), rect: { x: b.x0 * W, y: b.y0 * H, w: (b.x1 - b.x0) * W, h: (b.y1 - b.y0) * H } };
    });
    return { placed, width: W, height: H, planMode };
  }
  // Sin plano: ambientes a escala, uno al lado del otro (deja lugar a la izquierda para el rack).
  let x = MARGIN + 220;
  let y = MARGIN;
  let rowH = 0;
  const placed = rooms.map((r) => {
    const w = r.widthM * S;
    const h = r.depthM * S;
    if (x + w > ROW_W && x > MARGIN + 220) {
      x = MARGIN + 220;
      y += rowH + GAP;
      rowH = 0;
    }
    const ox = x;
    const oy = y;
    x += w + GAP;
    rowH = Math.max(rowH, h);
    return { ...r, map: (px: number, pz: number) => ({ x: ox + (px + r.widthM / 2) * S, y: oy + (pz + r.depthM / 2) * S }), rect: { x: ox, y: oy, w, h } };
  });
  const width = Math.max(...placed.map((p) => p.rect.x + p.rect.w), 600) + MARGIN;
  const height = Math.max(...placed.map((p) => p.rect.y + p.rect.h), 400) + MARGIN;
  return { placed, width, height, planMode };
}

export function ProjectFloorPlan({ floor, onSaveRack, onSaveLevel }: { floor: ProjectFloor; onSaveRack: (pos: { u: number; v: number }) => void; onSaveLevel: (roomId: string, level: string) => void }) {
  const levels = useMemo(() => [...new Set(floor.rooms.map((r) => r.level))].sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b)), [floor.rooms]);
  const [level, setLevel] = useState(levels[0] ?? "Planta baja");
  const current = levels.includes(level) ? level : (levels[0] ?? "Planta baja");
  const rooms = floor.rooms.filter((r) => r.level === current);
  const { placed, width, height, planMode } = useMemo(() => placeRooms(rooms, floor.image), [rooms, floor.image]);

  // Rack: posición guardada (plano: 0..1 de la imagen; esquema: px) o, si no hay, a la izquierda.
  const saved = floor.rack ? (planMode ? { x: floor.rack.u * width, y: floor.rack.v * height } : { x: floor.rack.u, y: floor.rack.v }) : null;
  const [rackLive, setRackLive] = useState<{ x: number; y: number } | null>(null);
  const rack = rackLive ?? saved ?? { x: planMode ? width * 0.05 : MARGIN + 60, y: planMode ? height * 0.5 : MARGIN + 80 };

  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const view = vb ?? { x: 0, y: 0, w: width, h: height };
  const [drag, setDrag] = useState<{ kind: "pan"; sx: number; sy: number; v: typeof view } | { kind: "rack" } | null>(null);
  const toSvg = (cx: number, cy: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = svg.createSVGPoint();
    p.x = cx;
    p.y = cy;
    const r = p.matrixTransform(ctm.inverse());
    return { x: r.x, y: r.y };
  };
  function onMove(e: ReactPointerEvent) {
    if (!drag) return;
    if (drag.kind === "rack") return setRackLive(toSvg(e.clientX, e.clientY));
    const svg = svgRef.current;
    if (!svg) return;
    const k = drag.v.w / svg.clientWidth;
    setVb({ ...drag.v, x: drag.v.x - (e.clientX - drag.sx) * k, y: drag.v.y - (e.clientY - drag.sy) * k });
  }
  function onUp() {
    if (drag?.kind === "rack" && rackLive) onSaveRack(planMode ? { u: rackLive.x / width, v: rackLive.y / height } : { u: rackLive.x, v: rackLive.y });
    setDrag(null);
  }

  const totalTrunk = (r: FloorRoom) => Object.values(r.trunk).reduce((a, n) => a + n, 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
          {levels.map((l) => (
            <button key={l} type="button" onClick={() => setLevel(l)} className={`rounded-md px-3 py-1 text-xs font-semibold ${l === current ? "bg-[#1e3553] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {l}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">{planMode ? "Sobre el plano del proyecto." : "Planta esquemática a escala (el proyecto no tiene plano subido)."} Arrastrá el rack a donde va.</p>
        <button type="button" onClick={() => setVb(null)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
          <Maximize2 className="h-3.5 w-3.5" /> Ver todo
        </button>
      </div>
      <div className="h-[64vh] overflow-hidden rounded-xl border border-slate-200 bg-white">
        <svg
          ref={svgRef}
          className={`h-full w-full touch-none select-none ${drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab"}`}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          fontFamily="Inter, Arial, sans-serif"
          onWheel={(e) => {
            const f = e.deltaY > 0 ? 1.12 : 1 / 1.12;
            const c = toSvg(e.clientX, e.clientY);
            setVb({ x: c.x - (c.x - view.x) * f, y: c.y - (c.y - view.y) * f, w: view.w * f, h: view.h * f });
          }}
          onPointerDown={(e) => {
            if (e.target === svgRef.current || (e.target as Element).tagName === "image") {
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              setDrag({ kind: "pan", sx: e.clientX, sy: e.clientY, v: view });
            }
          }}
          onPointerMove={onMove}
          onPointerUp={onUp}
        >
          {planMode && floor.image ? <image href={floor.image.url} x={0} y={0} width={width} height={height} opacity={0.55} /> : null}

          {/* Troncales: del rack a la salida de cada ambiente, con lo que lleva. */}
          {placed.map((r) => {
            const n = totalTrunk(r);
            if (!n) return null;
            const e = r.map(r.exit.x, r.exit.z);
            const mid = { x: e.x, y: rack.y };
            const detail = Object.entries(r.trunk)
              .map(([s, k]) => `${s} ${k}`)
              .join(" · ");
            return (
              <g key={`t-${r.id}`} pointerEvents="none">
                <polyline points={`${rack.x},${rack.y} ${mid.x},${mid.y} ${e.x},${e.y}`} fill="none" stroke="#1e3553" strokeWidth={Math.min(8, 2 + n / 3)} strokeOpacity={0.35} strokeLinejoin="round" />
                <text x={(rack.x + mid.x) / 2} y={rack.y - 6} fontSize={11} fill="#1e3553" fontWeight={700}>
                  {r.name}: {n} cable(s) — {detail}
                </text>
              </g>
            );
          })}

          {placed.map((r) => (
            <g key={r.id}>
              <rect x={r.rect.x} y={r.rect.y} width={r.rect.w} height={r.rect.h} fill={planMode ? "#1e3553" : "#f8fafc"} fillOpacity={planMode ? 0.05 : 1} stroke="#1e3553" strokeWidth={2} />
              <text x={r.rect.x + 8} y={r.rect.y + 18} fontSize={14} fontWeight={700} fill="#1e3553">
                {r.name}
              </text>
              {r.wires.map((w, k) => (
                <polyline key={k} points={w.pts.map((p) => r.map(p.x, p.z)).map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={w.color} strokeWidth={1.4} strokeOpacity={0.85} />
              ))}
              {r.devices.map((d, k) => {
                const p = r.map(d.x, d.z);
                return (
                  <g key={k}>
                    <circle cx={p.x} cy={p.y} r={4.5} fill="#334155" stroke="#fff" strokeWidth={1} />
                    <text x={p.x + 6} y={p.y - 5} fontSize={8.5} fill="#334155">
                      {d.short.length > 22 ? `${d.short.slice(0, 21)}…` : d.short}
                    </text>
                  </g>
                );
              })}
              {(() => {
                const e = r.map(r.exit.x, r.exit.z);
                return <rect x={e.x - 5} y={e.y - 5} width={10} height={10} fill="#f59e0b" stroke="#92400e" />;
              })()}
            </g>
          ))}

          {/* Rack (arrastrable). */}
          <g
            className="cursor-move"
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              setDrag({ kind: "rack" });
            }}
          >
            <rect x={rack.x - 26} y={rack.y - 34} width={52} height={68} rx={4} fill="#1e3553" />
            {[0, 1, 2, 3, 4].map((k) => (
              <rect key={k} x={rack.x - 20} y={rack.y - 28 + k * 12} width={40} height={8} rx={1} fill="#64748b" />
            ))}
            <text x={rack.x} y={rack.y + 50} fontSize={12} fontWeight={700} fill="#1e3553" textAnchor="middle">
              Rack central
            </text>
          </g>
        </svg>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {floor.rooms.map((r) => (
          <label key={r.id} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1">
            <span className="font-semibold text-slate-700">{r.name}</span>
            <select value={r.level} onChange={(e) => onSaveLevel(r.id, e.target.value)} className="rounded border border-slate-200 px-1 py-0.5 text-[11px]">
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <Server className="h-3.5 w-3.5" /> El cuadrado naranja es la salida de cada ambiente hacia el rack; el grosor de la troncal indica cuántos cables lleva.
      </p>
    </div>
  );
}
