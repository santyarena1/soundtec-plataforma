"use client";

/**
 * Lienzo del plano técnico (planta): paredes con aberturas y cotas, muebles en
 * contorno, equipos con su símbolo y cada cable dibujado de equipo a equipo
 * por su recorrido, con su color de señal y su etiqueta. Se mueven equipos y
 * quiebres a mano; rueda para acercar y arrastrar el fondo para desplazar.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PlanFurnitureDraw, PlanWallDraw } from "@/services/room-builder/wiring/plan-geometry";
import type { PlacedDevice, WiringModel } from "@/services/room-builder/wiring/model";
import { WIRE_SIGNAL_STYLE, type WirePoint } from "@/services/room-builder/wiring/types";

/** Unidades del dibujo por metro. */
const S = 100;
/** Margen alrededor de la sala (m). */
const PAD_M = 1.4;
const MIN_ZOOM_W = 150;
const MAX_ZOOM_W = 8000;
const DRAG_PX = 3;

export type TechSelection = { kind: "device"; deviceId: string; unit: number } | { kind: "wire"; id: string } | null;
export type TechTool = "select" | "cable";

type Props = {
  model: WiringModel;
  floor: Array<{ x: number; y: number }>;
  walls: PlanWallDraw[];
  furniture: PlanFurnitureDraw[];
  selection: TechSelection;
  tool: TechTool;
  /** Punta de origen elegida con la herramienta Cable. */
  pendingFrom: { deviceId: string; unit: number } | null;
  wiresWithIssues: Set<string>;
  onSelect: (s: TechSelection) => void;
  onDeviceClick: (d: PlacedDevice, clientX: number, clientY: number) => void;
  onMoveDevice: (d: PlacedDevice, x: number, z: number) => void;
  onWirePoints: (wireId: string, points: WirePoint[]) => void;
};

const ROLE_STYLE: Record<string, { fill: string; w: number; d: number; shape: "rect" | "circle" }> = {
  display: { fill: "#334155", w: 1.2, d: 0.1, shape: "rect" },
  speaker: { fill: "#6b7280", w: 0.26, d: 0.26, shape: "circle" },
  camera: { fill: "#7c2d12", w: 0.24, d: 0.14, shape: "rect" },
  mic: { fill: "#ea580c", w: 0.16, d: 0.16, shape: "circle" },
  touch: { fill: "#0f766e", w: 0.26, d: 0.18, shape: "rect" },
  codec: { fill: "#1e3a8a", w: 0.5, d: 0.3, shape: "rect" },
  processor: { fill: "#c2410c", w: 0.5, d: 0.32, shape: "rect" },
  other: { fill: "#475569", w: 0.32, d: 0.22, shape: "rect" },
};
const styleOf = (role: string) => ROLE_STYLE[role] ?? ROLE_STYLE.other!;

type Drag =
  | { kind: "pan"; startX: number; startY: number; vb: ViewBox }
  | { kind: "device"; device: PlacedDevice; startX: number; startY: number; moved: boolean; x: number; z: number }
  | { kind: "point"; wireId: string; index: number; points: WirePoint[] };
type ViewBox = { x: number; y: number; w: number; h: number };

export function TechnicalCanvas(p: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const bounds = useMemo(() => {
    const xs = [...p.floor.map((q) => q.x), ...p.model.devices.map((d) => d.x)];
    const zs = [...p.floor.map((q) => q.y), ...p.model.devices.map((d) => d.z)];
    const minX = Math.min(...xs) - PAD_M;
    const minZ = Math.min(...zs) - PAD_M;
    return { x: minX * S, y: minZ * S, w: (Math.max(...xs) + PAD_M - minX) * S, h: (Math.max(...zs) + PAD_M - minZ) * S };
  }, [p.floor, p.model.devices]);
  const [vb, setVb] = useState<ViewBox>(bounds);
  useEffect(() => setVb(bounds), [bounds.x, bounds.y, bounds.w, bounds.h]); // eslint-disable-line react-hooks/exhaustive-deps
  const [drag, setDrag] = useState<Drag | null>(null);

  /** Punto de la pantalla → metros de la sala. */
  const toRoom = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, z: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x / S, z: local.y / S };
  }, []);

  const deviceAt = (d: PlacedDevice) => (drag?.kind === "device" && drag.device.deviceId === d.deviceId && drag.device.unit === d.unit && drag.moved ? { x: drag.x, z: drag.z } : { x: d.x, z: d.z });
  const placed = (id: string, unit: number) => p.model.devices.find((d) => d.deviceId === id && d.unit === unit) ?? null;

  function onWheel(e: React.WheelEvent) {
    const { x, z } = toRoom(e.clientX, e.clientY);
    const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    setVb((v) => {
      const w = Math.min(MAX_ZOOM_W, Math.max(MIN_ZOOM_W, v.w * k));
      const ratio = w / v.w;
      const h = v.h * ratio;
      return { x: x * S - (x * S - v.x) * ratio, y: z * S - (z * S - v.y) * ratio, w, h };
    });
  }

  function onBackgroundDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    setDrag({ kind: "pan", startX: e.clientX, startY: e.clientY, vb });
  }

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      if (drag.kind === "pan") {
        const svg = svgRef.current;
        if (!svg) return;
        const scale = drag.vb.w / svg.clientWidth;
        setVb({ ...drag.vb, x: drag.vb.x - (e.clientX - drag.startX) * scale, y: drag.vb.y - (e.clientY - drag.startY) * scale });
      } else if (drag.kind === "device") {
        const moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_PX;
        const { x, z } = toRoom(e.clientX, e.clientY);
        setDrag({ ...drag, moved, x, z });
      } else {
        const { x, z } = toRoom(e.clientX, e.clientY);
        const points = drag.points.map((q, i) => (i === drag.index ? { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 } : q));
        setDrag({ ...drag, points });
      }
    };
    const up = (e: PointerEvent) => {
      if (drag.kind === "device") {
        if (drag.moved && !drag.device.remote) p.onMoveDevice(drag.device, Math.round(drag.x * 100) / 100, Math.round(drag.z * 100) / 100);
        else p.onDeviceClick(drag.device, e.clientX, e.clientY);
      } else if (drag.kind === "point") p.onWirePoints(drag.wireId, drag.points);
      else if (drag.kind === "pan" && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) <= DRAG_PX) p.onSelect(null);
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, p, toRoom]);

  const selectedWire = p.selection?.kind === "wire" ? p.selection.id : null;

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#f8fafc]">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className={`h-full w-full ${drag?.kind === "pan" ? "cursor-grabbing" : p.tool === "cable" ? "cursor-crosshair" : "cursor-default"}`}
        onWheel={onWheel}
        onPointerDown={onBackgroundDown}
      >
        <defs>
          <pattern id="tech-grid" width={S} height={S} patternUnits="userSpaceOnUse">
            <path d={`M ${S} 0 L 0 0 0 ${S}`} fill="none" stroke="#e2e8f0" strokeWidth={1} />
          </pattern>
        </defs>
        <rect x={vb.x - vb.w} y={vb.y - vb.h} width={vb.w * 3} height={vb.h * 3} fill="url(#tech-grid)" />

        {/* Piso y muebles */}
        <polygon points={p.floor.map((q) => `${q.x * S},${q.y * S}`).join(" ")} fill="#ffffff" />
        {p.furniture.map((f) => (
          <polygon key={f.id} points={f.outline.map((q) => `${q.x * S},${q.y * S}`).join(" ")} fill={f.layer ? "none" : "#f1f5f9"} stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray={f.layer ? "6 5" : undefined} />
        ))}

        {/* Paredes con aberturas y cotas */}
        {p.walls.map((w, i) => (
          <WallDraw key={i} wall={w} />
        ))}

        {/* Cables */}
        {p.model.wires.map((w) => {
          const a = placed(w.from.deviceId, w.from.unit);
          const b = placed(w.to.deviceId, w.to.unit);
          if (!a || !b) return null;
          const pts = drag?.kind === "point" && drag.wireId === w.id ? drag.points : w.points;
          const pa = deviceAt(a);
          const pb = deviceAt(b);
          const path = [pa, ...pts, pb];
          const color = WIRE_SIGNAL_STYLE[w.signal].color;
          const selected = selectedWire === w.id;
          const warn = p.wiresWithIssues.has(w.id);
          const longest = path.slice(1).reduce((best, q, i) => {
            const l = Math.hypot(q.x - path[i]!.x, q.z - path[i]!.z);
            return l > best.l ? { l, i } : best;
          }, { l: -1, i: 0 });
          const m0 = path[longest.i]!;
          const m1 = path[longest.i + 1]!;
          return (
            <g key={w.id}>
              <polyline
                points={path.map((q) => `${q.x * S},${q.z * S}`).join(" ")}
                fill="none"
                stroke={selected ? "#0f172a" : "transparent"}
                strokeWidth={selected ? 11 : 14}
                strokeLinejoin="round"
                opacity={selected ? 0.25 : 1}
                className="cursor-pointer"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  p.onSelect({ kind: "wire", id: w.id });
                }}
              />
              <polyline points={path.map((q) => `${q.x * S},${q.z * S}`).join(" ")} fill="none" stroke={color} strokeWidth={selected ? 4.5 : 3} strokeLinejoin="round" strokeDasharray={w.origin === "auto" ? undefined : undefined} pointerEvents="none" />
              <text x={((m0.x + m1.x) / 2) * S} y={((m0.z + m1.z) / 2) * S - 6} fontSize={11} textAnchor="middle" fill={warn ? "#b91c1c" : "#334155"} pointerEvents="none" fontFamily="ui-monospace,monospace">
                {warn ? "⚠ " : ""}
                {w.label ?? ""} · {w.lengthM.toFixed(1)} m
              </text>
              {selected ? (
                <>
                  {path.slice(1).map((q, i) => (
                    <circle
                      key={`mid-${i}`}
                      cx={((q.x + path[i]!.x) / 2) * S}
                      cy={((q.z + path[i]!.z) / 2) * S}
                      r={6}
                      fill="#ffffff"
                      stroke={color}
                      strokeWidth={2}
                      className="cursor-copy"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const mid = { x: Math.round(((q.x + path[i]!.x) / 2) * 100) / 100, z: Math.round(((q.z + path[i]!.z) / 2) * 100) / 100 };
                        const next = [...w.points.slice(0, i), mid, ...w.points.slice(i)];
                        p.onWirePoints(w.id, next);
                      }}
                    />
                  ))}
                  {pts.map((q, i) => (
                    <circle
                      key={`pt-${i}`}
                      cx={q.x * S}
                      cy={q.z * S}
                      r={8}
                      fill={color}
                      stroke="#ffffff"
                      strokeWidth={2.5}
                      className="cursor-move"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDrag({ kind: "point", wireId: w.id, index: i, points: w.points });
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        p.onWirePoints(w.id, w.points.filter((_, k) => k !== i));
                      }}
                    />
                  ))}
                </>
              ) : null}
            </g>
          );
        })}

        {/* Equipos */}
        {p.model.devices.map((d) => {
          const at = deviceAt(d);
          const st = styleOf(d.role);
          const selected = p.selection?.kind === "device" && p.selection.deviceId === d.deviceId && p.selection.unit === d.unit;
          const pending = p.pendingFrom?.deviceId === d.deviceId && p.pendingFrom.unit === d.unit;
          return (
            <g
              key={`${d.deviceId}#${d.unit}`}
              transform={`translate(${at.x * S} ${at.z * S}) rotate(${-d.rotY})`}
              className={d.remote ? "cursor-pointer" : "cursor-move"}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (e.button !== 0) return;
                setDrag({ kind: "device", device: d, startX: e.clientX, startY: e.clientY, moved: false, x: d.x, z: d.z });
              }}
            >
              {st.shape === "circle" ? (
                <circle r={(st.w / 2) * S} fill={st.fill} stroke={selected || pending ? "#2563eb" : "#ffffff"} strokeWidth={selected || pending ? 4 : 2} strokeDasharray={d.remote ? "5 4" : undefined} />
              ) : (
                <rect x={(-st.w / 2) * S} y={(-st.d / 2) * S} width={st.w * S} height={st.d * S} rx={3} fill={st.fill} stroke={selected || pending ? "#2563eb" : "#ffffff"} strokeWidth={selected || pending ? 4 : 2} strokeDasharray={d.remote ? "5 4" : undefined} />
              )}
              <text y={(st.d / 2) * S + 14} fontSize={11} fontWeight={600} textAnchor="middle" fill="#0f172a" transform={`rotate(${d.rotY})`} fontFamily="ui-sans-serif,system-ui">
                {d.short.length > 22 ? `${d.short.slice(0, 21)}…` : d.short}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[10.5px] text-slate-500 shadow-sm">Rueda: acercar · arrastrar el fondo: mover · tocá un cable para editarlo</div>
    </div>
  );
}

/** Muro con huecos de puertas y ventanas, y su cota por fuera. */
function WallDraw({ wall }: { wall: PlanWallDraw }) {
  const { a, b, lengthM } = wall;
  const ux = (b.x - a.x) / (lengthM || 1);
  const uz = (b.y - a.y) / (lengthM || 1);
  const at = (t: number) => ({ x: a.x + ux * t, z: a.y + uz * t });
  const cuts = [...wall.openings].sort((p, q) => p.from - q.from);
  const solids: Array<[number, number]> = [];
  let cursor = 0;
  for (const o of cuts) {
    if (o.from > cursor) solids.push([cursor, o.from]);
    cursor = Math.max(cursor, o.to);
  }
  if (cursor < lengthM) solids.push([cursor, lengthM]);
  // Cota: paralela al muro, del lado de afuera (normal izquierda del sentido a→b).
  const nx = uz;
  const nz = -ux;
  const off = 0.45;
  const c0 = { x: a.x + nx * off, z: a.y + nz * off };
  const c1 = { x: b.x + nx * off, z: b.y + nz * off };
  return (
    <g>
      {solids.map(([f, t], i) => {
        const p0 = at(f);
        const p1 = at(t);
        return <line key={i} x1={p0.x * S} y1={p0.z * S} x2={p1.x * S} y2={p1.z * S} stroke="#0f172a" strokeWidth={12} strokeLinecap="square" />;
      })}
      {cuts.map((o, i) => {
        const p0 = at(o.from);
        const p1 = at(o.to);
        if (o.kind === "window") {
          return (
            <g key={`o${i}`}>
              <line x1={p0.x * S} y1={p0.z * S} x2={p1.x * S} y2={p1.z * S} stroke="#60a5fa" strokeWidth={10} />
              <line x1={p0.x * S} y1={p0.z * S} x2={p1.x * S} y2={p1.z * S} stroke="#ffffff" strokeWidth={4} />
            </g>
          );
        }
        // Puerta: hoja y arco de apertura hacia adentro.
        const r = (o.to - o.from) * S;
        const leaf = { x: p0.x - nx * (o.to - o.from), z: p0.z - nz * (o.to - o.from) };
        return (
          <g key={`o${i}`}>
            <line x1={p0.x * S} y1={p0.z * S} x2={leaf.x * S} y2={leaf.z * S} stroke="#334155" strokeWidth={3} />
            <path d={`M ${leaf.x * S} ${leaf.z * S} A ${r} ${r} 0 0 ${nx * uz - nz * ux > 0 ? 0 : 1} ${p1.x * S} ${p1.z * S}`} fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" />
          </g>
        );
      })}
      <line x1={c0.x * S} y1={c0.z * S} x2={c1.x * S} y2={c1.z * S} stroke="#64748b" strokeWidth={1} />
      <line x1={c0.x * S - nx * 8} y1={c0.z * S - nz * 8} x2={c0.x * S + nx * 8} y2={c0.z * S + nz * 8} stroke="#64748b" strokeWidth={1} />
      <line x1={c1.x * S - nx * 8} y1={c1.z * S - nz * 8} x2={c1.x * S + nx * 8} y2={c1.z * S + nz * 8} stroke="#64748b" strokeWidth={1} />
      <text x={((c0.x + c1.x) / 2) * S + nx * 14} y={((c0.z + c1.z) / 2) * S + nz * 14 + 4} fontSize={12} textAnchor="middle" fill="#475569" fontFamily="ui-monospace,monospace">
        {lengthM.toFixed(2).replace(".", ",")} m
      </text>
    </g>
  );
}
