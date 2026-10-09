"use client";

/**
 * Plano con los ambientes encima, editable como en un CAD liviano:
 * - Seleccionar: mover el ambiente, arrastrar esquinas (vértices) y paredes,
 *   doble clic en una pared agrega un punto, doble clic en un punto lo quita,
 *   doble clic adentro del ambiente lo renombra.
 * - Lápiz: se marcan los vértices con clics (líneas rectas, se enderezan y se
 *   pegan a las esquinas vecinas) y se cierra tocando el primer punto.
 * - Rectángulo: se arrastra un recuadro.
 * - Calibrar: dos puntos de una medida conocida.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DetectedRoom, PlanBox } from "@/services/room-builder/plan-analysis";
import {
  MIN_POLYGON_POINTS,
  boxToPolygon,
  cleanPolygon,
  insertVertex,
  isAxisRect,
  moveVertex,
  polygonBox,
  polygonLabelPoint,
  removeVertex,
  snapOrtho,
  snapToVertices,
  translatePolygon,
  type PlanPoint,
} from "@/services/room-builder/plan-polygon";

export type CanvasMode = "select" | "pen" | "rect" | "calibrate";
export type { PlanPoint };
export type RoomShape = { box: PlanBox; polygon?: PlanPoint[] };

/** Colores de los ambientes (se repiten si hay muchos). */
export const ROOM_COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#dc2626", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5"];

const MIN_SIZE = 0.015;
const HANDLE_PX = 7;
/** Distancias en píxeles de pantalla. */
const SNAP_SCREEN_PX = 10;
const CLOSE_SCREEN_PX = 14;
const ALIGN_SCREEN_PX = 8;

type Drag =
  | { type: "move"; id: string; start: PlanPoint; poly: PlanPoint[] }
  | { type: "vertex"; id: string; index: number; poly: PlanPoint[]; isBox: boolean }
  | { type: "edge"; id: string; index: number; start: PlanPoint; poly: PlanPoint[] }
  | { type: "rect"; start: PlanPoint; current: PlanPoint };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export const roomPolygon = (room: { box: PlanBox; polygon?: PlanPoint[] }): PlanPoint[] => room.polygon ?? boxToPolygon(room.box);

/** Forma final: si quedó un recuadro se guarda como recuadro; si no, como polígono. */
export function shapeFromPolygon(poly: PlanPoint[]): RoomShape {
  const clean = cleanPolygon(poly);
  return isAxisRect(clean) ? { box: polygonBox(clean), polygon: undefined } : { box: polygonBox(clean), polygon: clean };
}

function boxFrom(a: PlanPoint, b: PlanPoint): PlanBox {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

/** Empuja la pared `index` (vértices i, i+1) en la dirección perpendicular. */
function pushEdge(poly: PlanPoint[], index: number, delta: PlanPoint): PlanPoint[] {
  const a = poly[index]!;
  const b = poly[(index + 1) % poly.length]!;
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len = Math.hypot(ex, ey) || 1;
  const nx = -ey / len;
  const ny = ex / len;
  const d = delta.x * nx + delta.y * ny;
  let out = moveVertex(poly, index, { x: a.x + nx * d, y: a.y + ny * d });
  out = moveVertex(out, (index + 1) % poly.length, { x: b.x + nx * d, y: b.y + ny * d });
  return out;
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
  onShapeChange,
  onDrawShape,
  onRename,
  onCalibrationPoint,
  renameRequest,
}: {
  imageUrl: string;
  widthPx: number;
  heightPx: number;
  rooms: DetectedRoom[];
  selectedId: string | null;
  mode: CanvasMode;
  calibration: PlanPoint[];
  onSelect: (id: string | null) => void;
  onShapeChange: (id: string, shape: RoomShape) => void;
  onDrawShape: (shape: RoomShape) => void;
  onRename: (id: string, name: string) => void;
  onCalibrationPoint: (p: PlanPoint) => void;
  /** Ambiente a renombrar sobre el plano (por ejemplo, recién dibujado). */
  renameRequest?: { id: string; seq: number } | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<{ id: string; poly: PlanPoint[] } | null>(null);
  const [pen, setPen] = useState<PlanPoint[]>([]);
  const [cursor, setCursor] = useState<PlanPoint | null>(null);
  /** El cursor del lápiz quedó pegado a una esquina existente (se marca con un aro). */
  const [cursorSnapped, setCursorSnapped] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  /** Píxeles de imagen por píxel de pantalla. */
  const imgPerScreen = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect?.width ? widthPx / rect.width : 1;
  };
  const toPoint = (e: { clientX: number; clientY: number }): PlanPoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clamp01((e.clientX - rect.left) / rect.width), y: clamp01((e.clientY - rect.top) / rect.height) };
  };
  const otherVertices = (excludeId: string | null) => rooms.filter((r) => r.id !== excludeId).flatMap(roomPolygon);

  useEffect(() => {
    if (renameRequest) setRenaming(renameRequest.id);
  }, [renameRequest]);

  // Al cambiar de herramienta se descarta el trazo a medias.
  useEffect(() => {
    setPen([]);
    setCursor(null);
  }, [mode]);

  const closePen = (points: PlanPoint[]) => {
    const clean = cleanPolygon(points);
    setPen([]);
    setCursor(null);
    if (clean.length < MIN_POLYGON_POINTS) return;
    const box = polygonBox(clean);
    if (box.x1 - box.x0 < MIN_SIZE || box.y1 - box.y0 < MIN_SIZE) return;
    onDrawShape(shapeFromPolygon(clean));
  };

  useEffect(() => {
    if (mode !== "pen") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      if (e.key === "Escape") {
        setPen([]);
      } else if (e.key === "Enter") {
        closePen(pen);
      } else if (e.key === "Backspace" || (e.key === "z" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        setPen((p) => p.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // closePen usa el trazo actual: se vuelve a enganchar en cada punto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pen]);

  /** ¿El punto coincide con una esquina existente? */
  const isMagnet = (p: PlanPoint) => [...otherVertices(null), ...pen].some((v) => v.x === p.x && v.y === p.y);

  /** Siguiente punto del lápiz: imán a esquinas existentes, si no, línea enderezada. */
  function penPoint(raw: PlanPoint, free: boolean): PlanPoint {
    const scale = imgPerScreen();
    const magnet = snapToVertices(raw, [...otherVertices(null), ...pen], widthPx, heightPx, SNAP_SCREEN_PX * scale);
    if (magnet !== raw || free || !pen.length) return magnet;
    return snapOrtho(pen[pen.length - 1]!, raw, widthPx, heightPx);
  }

  function onBackgroundDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const p = toPoint(e);
    if (mode === "calibrate") {
      onCalibrationPoint(p);
      return;
    }
    if (mode === "rect") {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDrag({ type: "rect", start: p, current: p });
      return;
    }
    if (mode === "pen") {
      const next = penPoint(p, e.altKey);
      const first = pen[0];
      if (first && pen.length >= MIN_POLYGON_POINTS && Math.hypot((next.x - first.x) * widthPx, (next.y - first.y) * heightPx) <= CLOSE_SCREEN_PX * imgPerScreen()) {
        closePen(pen);
        return;
      }
      setPen((pts) => [...pts, next]);
      return;
    }
    onSelect(null);
  }

  function onMove(e: ReactPointerEvent<SVGSVGElement>) {
    const p = toPoint(e);
    if (mode === "pen") {
      const next = penPoint(p, e.altKey);
      setCursor(next);
      setCursorSnapped(!e.altKey && isMagnet(next));
      return;
    }
    if (!drag) return;
    if (drag.type === "rect") {
      setDrag({ ...drag, current: p });
      return;
    }
    if (drag.type === "move") {
      setPreview({ id: drag.id, poly: translatePolygon(drag.poly, p.x - drag.start.x, p.y - drag.start.y) });
      return;
    }
    if (drag.type === "edge") {
      setPreview({ id: drag.id, poly: pushEdge(drag.poly, drag.index, { x: p.x - drag.start.x, y: p.y - drag.start.y }) });
      return;
    }
    if (drag.isBox) {
      // Recuadro: la esquina opuesta queda fija.
      const opposite = drag.poly[(drag.index + 2) % 4]!;
      setPreview({ id: drag.id, poly: boxToPolygon(boxFrom(p, opposite)) });
      return;
    }
    // Vértice libre: imán a esquinas de otros ambientes y alineado con sus vecinos.
    const scale = imgPerScreen();
    let q = snapToVertices(p, otherVertices(drag.id), widthPx, heightPx, SNAP_SCREEN_PX * scale);
    if (q === p && !e.altKey) {
      const n = drag.poly.length;
      const neighbors = [drag.poly[(drag.index - 1 + n) % n]!, drag.poly[(drag.index + 1) % n]!];
      const tol = (ALIGN_SCREEN_PX * scale) / widthPx;
      const tolY = (ALIGN_SCREEN_PX * scale) / heightPx;
      q = { ...p };
      for (const nb of neighbors) {
        if (Math.abs(nb.x - p.x) <= tol) q.x = nb.x;
        if (Math.abs(nb.y - p.y) <= tolY) q.y = nb.y;
      }
    }
    setPreview({ id: drag.id, poly: moveVertex(drag.poly, drag.index, q) });
  }

  function onUp() {
    if (drag?.type === "rect") {
      const box = boxFrom(drag.start, drag.current);
      if (box.x1 - box.x0 > MIN_SIZE && box.y1 - box.y0 > MIN_SIZE) onDrawShape({ box });
    } else if (preview) {
      const shape = shapeFromPolygon(preview.poly);
      if (shape.box.x1 - shape.box.x0 > MIN_SIZE && shape.box.y1 - shape.box.y0 > MIN_SIZE) onShapeChange(preview.id, shape);
    }
    setDrag(null);
    setPreview(null);
  }

  const handleR = (HANDLE_PX / 800) * Math.max(widthPx, heightPx);
  const px = (p: PlanPoint) => `${p.x * widthPx},${p.y * heightPx}`;
  const renamingRoom = rooms.find((r) => r.id === renaming) ?? null;
  const cursorClass = mode === "select" ? "cursor-default" : "cursor-crosshair";
  // El seleccionado se dibuja último para que sus esquinas y paredes queden arriba de los vecinos.
  const ordered = rooms.map((room, i) => [room, i] as const).sort(([a], [b]) => Number(a.id === selectedId) - Number(b.id === selectedId));

  return (
    <div
      className="relative w-full select-none overflow-hidden rounded-xl border border-slate-200 bg-white"
      // El navegador no debe seleccionar ni arrastrar la imagen del plano: cada clic es un punto.
      onPointerDownCapture={(e) => {
        if ((e.target as HTMLElement).closest("input")) return;
        if (e.pointerType === "mouse") e.preventDefault();
        window.getSelection()?.removeAllRanges();
      }}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={(e) => {
        // Clic derecho con el lápiz = deshacer el último punto.
        if (mode === "pen") {
          e.preventDefault();
          setPen((p) => p.slice(0, -1));
        }
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="Plano" className="pointer-events-none block w-full select-none" draggable={false} />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${widthPx} ${heightPx}`}
        preserveAspectRatio="none"
        className={`absolute inset-0 h-full w-full touch-none ${cursorClass}`}
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => {
          onUp();
          setCursor(null);
        }}
        onDoubleClick={(e) => {
          if (mode === "pen" && pen.length >= MIN_POLYGON_POINTS) {
            e.preventDefault();
            // El doble clic ya sumó un punto repetido con el primer clic: se limpia al cerrar.
            closePen(pen);
          }
        }}
      >
        {ordered.map(([room, i]) => {
          const poly = preview?.id === room.id ? preview.poly : roomPolygon(room);
          const isBox = !room.polygon;
          const color = ROOM_COLORS[i % ROOM_COLORS.length];
          const selected = room.id === selectedId;
          const editable = selected && mode === "select";
          const label = polygonLabelPoint(poly);
          const box = polygonBox(poly);
          const w = (box.x1 - box.x0) * widthPx;
          return (
            <g key={room.id} opacity={room.include ? 1 : 0.55}>
              <polygon
                points={poly.map(px).join(" ")}
                fill={color}
                fillOpacity={selected ? 0.28 : 0.14}
                stroke={color}
                strokeWidth={selected ? 4 : 2.5}
                strokeLinejoin="round"
                strokeDasharray={room.include ? undefined : "10 8"}
                vectorEffect="non-scaling-stroke"
                className={mode === "select" ? "cursor-move" : undefined}
                style={{ pointerEvents: mode === "select" ? "auto" : "none" }}
                onPointerDown={(e) => {
                  if (mode !== "select" || e.button !== 0) return;
                  e.stopPropagation();
                  onSelect(room.id);
                  setDrag({ type: "move", id: room.id, start: toPoint(e), poly });
                }}
                onDoubleClick={(e) => {
                  if (mode !== "select") return;
                  e.stopPropagation();
                  setRenaming(room.id);
                }}
              />
              {renaming === room.id ? null : (
                <text
                  x={label.x * widthPx}
                  y={label.y * heightPx}
                  fill={color}
                  fontSize={Math.max(14, Math.min(26, w / 9))}
                  fontWeight={700}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none select-none"
                  style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 4 }}
                >
                  {room.name}
                </text>
              )}
              {editable
                ? poly.map((a, ei) => {
                    const b = poly[(ei + 1) % poly.length]!;
                    return (
                      <line
                        key={`e${ei}`}
                        x1={a.x * widthPx}
                        y1={a.y * heightPx}
                        x2={b.x * widthPx}
                        y2={b.y * heightPx}
                        stroke="transparent"
                        strokeWidth={14}
                        vectorEffect="non-scaling-stroke"
                        className={Math.abs(b.x - a.x) * widthPx > Math.abs(b.y - a.y) * heightPx ? "cursor-ns-resize" : "cursor-ew-resize"}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          setDrag({ type: "edge", id: room.id, index: ei, start: toPoint(e), poly });
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          onShapeChange(room.id, shapeFromPolygon(insertVertex(poly, ei, toPoint(e))));
                        }}
                      >
                        <title>Arrastrá para mover la pared · doble clic para agregar un punto</title>
                      </line>
                    );
                  })
                : null}
              {editable
                ? poly.map((p, vi) => (
                    <circle
                      key={`v${vi}`}
                      cx={p.x * widthPx}
                      cy={p.y * heightPx}
                      r={handleR}
                      fill="white"
                      stroke={color}
                      strokeWidth={3}
                      vectorEffect="non-scaling-stroke"
                      className="cursor-move"
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        setDrag({ type: "vertex", id: room.id, index: vi, poly, isBox });
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (poly.length > MIN_POLYGON_POINTS) onShapeChange(room.id, shapeFromPolygon(removeVertex(poly, vi)));
                      }}
                    >
                      <title>Arrastrá la esquina · doble clic para quitarla</title>
                    </circle>
                  ))
                : null}
            </g>
          );
        })}

        {drag?.type === "rect" ? (
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

        {mode === "pen" && pen.length ? (
          <g className="pointer-events-none">
            {pen.length >= 2 ? <polygon points={[...pen, ...(cursor ? [cursor] : [])].map(px).join(" ")} fill="#1e3553" fillOpacity={0.1} stroke="none" /> : null}
            <polyline points={[...pen, ...(cursor ? [cursor] : [])].map(px).join(" ")} fill="none" stroke="#1e3553" strokeWidth={3} vectorEffect="non-scaling-stroke" />
            {pen.map((p, i) => (
              <circle
                key={i}
                cx={p.x * widthPx}
                cy={p.y * heightPx}
                r={i === 0 && pen.length >= MIN_POLYGON_POINTS ? handleR * 1.6 : handleR}
                fill={i === 0 ? "#1e3553" : "white"}
                stroke="#1e3553"
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        ) : null}
        {mode === "pen" && cursor ? (
          <g className="pointer-events-none">
            <circle cx={cursor.x * widthPx} cy={cursor.y * heightPx} r={handleR * 0.7} fill="#1e3553" />
            {cursorSnapped ? <circle cx={cursor.x * widthPx} cy={cursor.y * heightPx} r={handleR * 1.8} fill="none" stroke="#f59e0b" strokeWidth={3} vectorEffect="non-scaling-stroke" /> : null}
          </g>
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

      {renamingRoom ? (
        <RenameInput
          key={renamingRoom.id}
          initial={renamingRoom.name}
          at={polygonLabelPoint(roomPolygon(renamingRoom))}
          onDone={(value) => {
            const name = value?.trim();
            if (name && name !== renamingRoom.name) onRename(renamingRoom.id, name.slice(0, 60));
            setRenaming(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Cuadro para renombrar el ambiente directamente sobre el plano. */
function RenameInput({ initial, at, onDone }: { initial: string; at: PlanPoint; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      value={value}
      maxLength={60}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => onDone(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(value);
        if (e.key === "Escape") onDone(null);
      }}
      aria-label="Nombre del ambiente"
      className="absolute z-10 w-48 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-[#1e3553] bg-white px-2 py-1 text-center text-sm font-semibold text-slate-900 shadow-lg focus:outline-none"
      style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
    />
  );
}

