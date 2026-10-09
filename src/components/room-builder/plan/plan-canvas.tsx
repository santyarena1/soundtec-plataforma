"use client";

/**
 * Plano con los ambientes detectados encima. Se elige un recuadro y se
 * mueve o se estira desde las esquinas; en modo "dibujar" se marca uno
 * nuevo; en modo "calibrar" se tocan dos puntos de una medida conocida.
 */

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DetectedRoom, PlanBox } from "@/services/room-builder/plan-analysis";

export type CanvasMode = "select" | "draw" | "calibrate";
export type PlanPoint = { x: number; y: number };

/** Colores de los ambientes (se repiten si hay muchos). */
export const ROOM_COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#dc2626", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5"];

const MIN_SIZE = 0.015;
const HANDLE_PX = 9;

type Drag =
  | { type: "move"; id: string; start: PlanPoint; box: PlanBox }
  | { type: "resize"; id: string; corner: "nw" | "ne" | "sw" | "se"; box: PlanBox }
  | { type: "draw"; start: PlanPoint; current: PlanPoint };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function boxFrom(a: PlanPoint, b: PlanPoint): PlanBox {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

export function PlanCanvas({
  imageUrl,
  widthPx,
  heightPx,
  rooms,
  selectedId,
  mode,
  calibration,
  onSelect,
  onBoxChange,
  onDraw,
  onCalibrationPoint,
}: {
  imageUrl: string;
  widthPx: number;
  heightPx: number;
  rooms: DetectedRoom[];
  selectedId: string | null;
  mode: CanvasMode;
  calibration: PlanPoint[];
  onSelect: (id: string | null) => void;
  onBoxChange: (id: string, box: PlanBox) => void;
  onDraw: (box: PlanBox) => void;
  onCalibrationPoint: (p: PlanPoint) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<{ id: string; box: PlanBox } | null>(null);

  const toPoint = (e: { clientX: number; clientY: number }): PlanPoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clamp01((e.clientX - rect.left) / rect.width), y: clamp01((e.clientY - rect.top) / rect.height) };
  };

  function onBackgroundDown(e: ReactPointerEvent<SVGSVGElement>) {
    const p = toPoint(e);
    if (mode === "calibrate") {
      onCalibrationPoint(p);
      return;
    }
    if (mode === "draw") {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDrag({ type: "draw", start: p, current: p });
      return;
    }
    onSelect(null);
  }

  function onMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const p = toPoint(e);
    if (drag.type === "draw") {
      setDrag({ ...drag, current: p });
      return;
    }
    if (drag.type === "move") {
      const w = drag.box.x1 - drag.box.x0;
      const h = drag.box.y1 - drag.box.y0;
      const x0 = Math.min(1 - w, Math.max(0, drag.box.x0 + p.x - drag.start.x));
      const y0 = Math.min(1 - h, Math.max(0, drag.box.y0 + p.y - drag.start.y));
      setPreview({ id: drag.id, box: { x0, y0, x1: x0 + w, y1: y0 + h } });
      return;
    }
    const b = { ...drag.box };
    if (drag.corner.includes("w")) b.x0 = Math.min(p.x, b.x1 - MIN_SIZE);
    if (drag.corner.includes("e")) b.x1 = Math.max(p.x, b.x0 + MIN_SIZE);
    if (drag.corner.includes("n")) b.y0 = Math.min(p.y, b.y1 - MIN_SIZE);
    if (drag.corner.includes("s")) b.y1 = Math.max(p.y, b.y0 + MIN_SIZE);
    setPreview({ id: drag.id, box: b });
  }

  function onUp() {
    if (drag?.type === "draw") {
      const box = boxFrom(drag.start, drag.current);
      if (box.x1 - box.x0 > MIN_SIZE && box.y1 - box.y0 > MIN_SIZE) onDraw(box);
    } else if (preview) {
      onBoxChange(preview.id, preview.box);
    }
    setDrag(null);
    setPreview(null);
  }

  const handleR = (HANDLE_PX / 800) * Math.max(widthPx, heightPx);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="Plano" className="block w-full select-none" draggable={false} />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${widthPx} ${heightPx}`}
        preserveAspectRatio="none"
        className={`absolute inset-0 h-full w-full touch-none ${mode === "select" ? "cursor-default" : "cursor-crosshair"}`}
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        {rooms.map((room, i) => {
          const b = preview?.id === room.id ? preview.box : room.box;
          const color = ROOM_COLORS[i % ROOM_COLORS.length];
          const selected = room.id === selectedId;
          const x = b.x0 * widthPx;
          const y = b.y0 * heightPx;
          const w = (b.x1 - b.x0) * widthPx;
          const h = (b.y1 - b.y0) * heightPx;
          return (
            <g key={room.id} opacity={room.include ? 1 : 0.55}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={color}
                fillOpacity={selected ? 0.28 : 0.14}
                stroke={color}
                strokeWidth={selected ? 4 : 2.5}
                strokeDasharray={room.include ? undefined : "10 8"}
                vectorEffect="non-scaling-stroke"
                className={mode === "select" ? "cursor-move" : undefined}
                onPointerDown={(e) => {
                  if (mode !== "select") return;
                  e.stopPropagation();
                  onSelect(room.id);
                  setDrag({ type: "move", id: room.id, start: toPoint(e), box: b });
                }}
              />
              <text
                x={x + 8}
                y={y + Math.min(h - 6, 28)}
                fill={color}
                fontSize={Math.max(14, Math.min(26, w / 9))}
                fontWeight={700}
                className="pointer-events-none select-none"
                style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 4 }}
              >
                {room.name}
              </text>
              {selected && mode === "select"
                ? (
                    [
                      ["nw", x, y],
                      ["ne", x + w, y],
                      ["sw", x, y + h],
                      ["se", x + w, y + h],
                    ] as const
                  ).map(([corner, cx, cy]) => (
                    <circle
                      key={corner}
                      cx={cx}
                      cy={cy}
                      r={handleR}
                      fill="white"
                      stroke={color}
                      strokeWidth={3}
                      vectorEffect="non-scaling-stroke"
                      className="cursor-nwse-resize"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDrag({ type: "resize", id: room.id, corner, box: b });
                      }}
                    />
                  ))
                : null}
            </g>
          );
        })}
        {drag?.type === "draw" ? (
          <rect
            x={Math.min(drag.start.x, drag.current.x) * widthPx}
            y={Math.min(drag.start.y, drag.current.y) * heightPx}
            width={Math.abs(drag.current.x - drag.start.x) * widthPx}
            height={Math.abs(drag.current.y - drag.start.y) * heightPx}
            fill="#1e3553"
            fillOpacity={0.15}
            stroke="#1e3553"
            strokeWidth={2.5}
            strokeDasharray="8 6"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {calibration.length === 2 ? (
          <line
            x1={calibration[0].x * widthPx}
            y1={calibration[0].y * heightPx}
            x2={calibration[1].x * widthPx}
            y2={calibration[1].y * heightPx}
            stroke="#0f766e"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {calibration.map((p, i) => (
          <circle key={i} cx={p.x * widthPx} cy={p.y * heightPx} r={handleR} fill="#0f766e" stroke="white" strokeWidth={3} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    </div>
  );
}
