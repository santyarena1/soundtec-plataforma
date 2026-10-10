"use client";

/**
 * Planta del proyecto: todos los ambientes de un piso con sus equipos, el
 * rack (se arrastra a donde va) y las troncales que salen del rack hacia
 * cada ambiente. Sin plano subido, los ambientes se arrastran para armar la
 * casa. El detalle (cables por tipo, metros, equipos) va en el panel lateral.
 */

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Cable, Eye, EyeOff, Maximize2, Server } from "lucide-react";
import type { FloorRoom, ProjectFloor } from "@/services/room-builder/project-technical";
import { categoryOf, DIAGRAM_CATEGORIES } from "@/services/room-builder/wiring/diagram-layout";

const LEVELS = ["Subsuelo", "Planta baja", "Primer piso", "Segundo piso", "Tercer piso", "Terraza / exterior"];
/** Planta esquemática: px por metro y separación entre ambientes. */
const S = 40;
const GAP = 48;
const ROW_W = 1400;
const MARGIN = 60;
const RACK_COL = 200;
const HEADER = 26;
const CAT_COLORS = ["#0ea5e9", "#8b5cf6", "#64748b", "#ec4899", "#f97316", "#ef4444", "#14b8a6", "#22c55e", "#94a3b8"];

type Rect = { x: number; y: number; w: number; h: number };
type Placed = FloorRoom & { map: (x: number, z: number) => { x: number; y: number }; rect: Rect };

function schematicRect(r: FloorRoom, pos: { x: number; y: number }): Placed {
  const rect = { x: pos.x, y: pos.y, w: Math.max(3, r.widthM) * S, h: Math.max(3, r.depthM) * S + HEADER };
  const ox = pos.x;
  const oy = pos.y + HEADER;
  return { ...r, rect, map: (px, pz) => ({ x: ox + (px + Math.max(3, r.widthM) / 2) * S, y: oy + (pz + Math.max(3, r.depthM) / 2) * S }) };
}

function placeRooms(rooms: FloorRoom[], image: ProjectFloor["image"], live: Record<string, { x: number; y: number }>) {
  const planMode = Boolean(image && rooms.length && rooms.every((r) => r.box));
  if (planMode && image) {
    const W = image.widthPx;
    const H = image.heightPx;
    const placed: Placed[] = rooms.map((r) => {
      const b = r.box!;
      const cx = ((b.x0 + b.x1) / 2) * W;
      const cy = ((b.y0 + b.y1) / 2) * H;
      const sx = ((b.x1 - b.x0) * W) / Math.max(0.5, r.widthM);
      const sz = ((b.y1 - b.y0) * H) / Math.max(0.5, r.depthM);
      return { ...r, map: (x: number, z: number) => ({ x: cx + x * sx, y: cy + z * sz }), rect: { x: b.x0 * W, y: b.y0 * H, w: (b.x1 - b.x0) * W, h: (b.y1 - b.y0) * H } };
    });
    return { placed, width: W, height: H, planMode };
  }
  // Sin plano: posición guardada o, si no hay, en filas (deja la columna izquierda para el rack).
  let x = MARGIN + RACK_COL;
  let y = MARGIN;
  let rowH = 0;
  const placed = rooms.map((r) => {
    const w = Math.max(3, r.widthM) * S;
    const h = Math.max(3, r.depthM) * S + HEADER;
    if (x + w > ROW_W && x > MARGIN + RACK_COL) {
      x = MARGIN + RACK_COL;
      y += rowH + GAP;
      rowH = 0;
    }
    const auto = { x, y };
    x += w + GAP;
    rowH = Math.max(rowH, h);
    return schematicRect(r, live[r.id] ?? r.pos ?? auto);
  });
  const width = Math.max(...placed.map((p) => p.rect.x + p.rect.w), 700) + MARGIN;
  const height = Math.max(...placed.map((p) => p.rect.y + p.rect.h), 450) + MARGIN;
  return { placed, width, height, planMode };
}

const trunkTotal = (r: FloorRoom) => Object.values(r.trunk).reduce((a, n) => a + n, 0);

/** Recorrido ortogonal de la troncal: sale por debajo del ambiente, va por el pasillo y entra al rack. */
function trunkPath(r: Placed, rack: { x: number; y: number }, k: number, planMode: boolean): string {
  const e = r.map(r.exit.x, r.exit.z);
  if (planMode) return `M${e.x},${e.y} L${e.x},${rack.y} L${rack.x},${rack.y}`;
  const below = r.rect.y + r.rect.h + 10 + (k % 6) * 4;
  const rx = rack.x + 30 + (k % 6) * 4;
  return `M${e.x},${e.y} L${e.x},${below} L${rx},${below} L${rx},${rack.y} L${rack.x + 26},${rack.y}`;
}

export function ProjectFloorPlan({
  floor,
  onSaveRack,
  onSaveLevel,
  onSaveRoomPos,
}: {
  floor: ProjectFloor;
  onSaveRack: (pos: { u: number; v: number }) => void;
  onSaveLevel: (roomId: string, level: string) => void;
  onSaveRoomPos: (roomId: string, pos: { x: number; y: number }) => void;
}) {
  const levels = useMemo(() => [...new Set(floor.rooms.map((r) => r.level))].sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b)), [floor.rooms]);
  const [level, setLevel] = useState(levels[0] ?? "Planta baja");
  const current = levels.includes(level) ? level : (levels[0] ?? "Planta baja");
  const rooms = useMemo(() => floor.rooms.filter((r) => r.level === current), [floor.rooms, current]);
  const [livePos, setLivePos] = useState<Record<string, { x: number; y: number }>>({});
  const { placed, width, height, planMode } = useMemo(() => placeRooms(rooms, floor.image, livePos), [rooms, floor.image, livePos]);
  const [showWires, setShowWires] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  const saved = floor.rack ? (planMode ? { x: floor.rack.u * width, y: floor.rack.v * height } : { x: floor.rack.u, y: floor.rack.v }) : null;
  const [rackLive, setRackLive] = useState<{ x: number; y: number } | null>(null);
  const rack = rackLive ?? saved ?? { x: planMode ? width * 0.05 : MARGIN + 60, y: planMode ? height * 0.5 : MARGIN + 90 };

  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<Rect | null>(null);
  const view = vb ?? { x: 0, y: 0, w: width, h: height };
  type Drag = { kind: "pan"; sx: number; sy: number; v: Rect } | { kind: "rack" } | { kind: "room"; id: string; dx: number; dy: number; moved: boolean };
  const [drag, setDrag] = useState<Drag | null>(null);
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
    if (drag.kind === "room") {
      const p = toSvg(e.clientX, e.clientY);
      setDrag({ ...drag, moved: true });
      return setLivePos((m) => ({ ...m, [drag.id]: { x: Math.round((p.x - drag.dx) / 10) * 10, y: Math.round((p.y - drag.dy) / 10) * 10 } }));
    }
    const svg = svgRef.current;
    if (!svg) return;
    const k = drag.v.w / svg.clientWidth;
    setVb({ ...drag.v, x: drag.v.x - (e.clientX - drag.sx) * k, y: drag.v.y - (e.clientY - drag.sy) * k });
  }
  function onUp() {
    if (drag?.kind === "rack" && rackLive) onSaveRack(planMode ? { u: rackLive.x / width, v: rackLive.y / height } : { u: rackLive.x, v: rackLive.y });
    if (drag?.kind === "room") {
      if (drag.moved && livePos[drag.id]) onSaveRoomPos(drag.id, livePos[drag.id]!);
      else setSelected((s) => (s === drag.id ? null : drag.id));
    }
    setDrag(null);
  }

  const sel = placed.find((r) => r.id === selected) ?? null;
  const totals = { cables: placed.reduce((a, r) => a + trunkTotal(r), 0), meters: placed.reduce((a, r) => a + r.trunkMeters, 0) };

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
        <p className="text-[11px] text-slate-500">{planMode ? "Sobre el plano del proyecto. Arrastrá el rack a donde va." : "Arrastrá los ambientes para armar la planta y el rack a donde va. Tocá un ambiente para ver su detalle."}</p>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setShowWires((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
            {showWires ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} Cableado interno
          </button>
          <button type="button" onClick={() => setVb(null)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
            <Maximize2 className="h-3.5 w-3.5" /> Ver todo
          </button>
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-[1fr_280px]">
        <div className="relative h-[64vh] overflow-hidden rounded-xl border border-slate-200 bg-[#f4f6f9]">
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
                setSelected(null);
              }
            }}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            <defs>
              <pattern id="fp-grid" width={S} height={S} patternUnits="userSpaceOnUse">
                <path d={`M${S} 0 L0 0 0 ${S}`} fill="none" stroke="#e2e8f0" strokeWidth={1} />
              </pattern>
              <filter id="fp-shadow" x="-5%" y="-5%" width="110%" height="115%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.12" />
              </filter>
            </defs>
            {planMode && floor.image ? <image href={floor.image.url} x={0} y={0} width={width} height={height} opacity={0.55} /> : <rect x={-4000} y={-4000} width={10000} height={10000} fill="url(#fp-grid)" pointerEvents="none" />}

            {/* Troncales (debajo de los ambientes). */}
            {placed.map((r, k) => {
              const n = trunkTotal(r);
              if (!n) return null;
              const on = !selected || selected === r.id;
              return <path key={`t-${r.id}`} d={trunkPath(r, rack, k, planMode)} fill="none" stroke="#1e3553" strokeWidth={Math.min(7, 2 + n / 4)} strokeOpacity={on ? 0.55 : 0.12} strokeLinejoin="round" pointerEvents="none" />;
            })}

            {placed.map((r) => {
              const isSel = selected === r.id;
              const n = trunkTotal(r);
              const e = r.map(r.exit.x, r.exit.z);
              return (
                <g key={r.id} opacity={selected && !isSel ? 0.55 : 1}>
                  <g
                    className={planMode ? "cursor-pointer" : "cursor-move"}
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
                      const p = toSvg(ev.clientX, ev.clientY);
                      if (planMode) return setSelected((s) => (s === r.id ? null : r.id));
                      setDrag({ kind: "room", id: r.id, dx: p.x - r.rect.x, dy: p.y - r.rect.y, moved: false });
                    }}
                  >
                    <rect x={r.rect.x} y={r.rect.y} width={r.rect.w} height={r.rect.h} rx={6} fill={planMode ? "#1e3553" : "#fff"} fillOpacity={planMode ? 0.06 : 1} stroke={isSel ? "#f59e0b" : "#1e3553"} strokeWidth={isSel ? 3 : 1.5} filter={planMode ? undefined : "url(#fp-shadow)"} />
                    {!planMode ? <rect x={r.rect.x} y={r.rect.y} width={r.rect.w} height={HEADER} rx={6} fill="#1e3553" /> : null}
                    <text x={r.rect.x + 10} y={r.rect.y + 17} fontSize={13} fontWeight={700} fill={planMode ? "#1e3553" : "#fff"}>
                      {r.name}
                    </text>
                    <text x={r.rect.x + r.rect.w - 10} y={r.rect.y + 17} fontSize={10} fill={planMode ? "#475569" : "#cbd5e1"} textAnchor="end">
                      {r.widthM.toFixed(1)} × {r.depthM.toFixed(1)} m · {r.devices.length} eq.
                    </text>
                  </g>
                  {showWires
                    ? r.wires.map((w, k) => <polyline key={k} points={w.pts.map((p) => r.map(p.x, p.z)).map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={w.color} strokeWidth={1.2} strokeOpacity={0.7} pointerEvents="none" />)
                    : null}
                  {r.devices.map((d, k) => {
                    const p = r.map(d.x, d.z);
                    const cat = categoryOf({ cls: d.cls ?? undefined, role: d.role, label: d.label });
                    return (
                      <circle
                        key={k}
                        cx={p.x}
                        cy={p.y}
                        r={cat === 7 ? 4 : 5.5}
                        fill={cat === 7 ? "#fff" : CAT_COLORS[cat]}
                        stroke={CAT_COLORS[cat]}
                        strokeWidth={cat === 7 ? 2 : 1}
                        onPointerEnter={() => setHover({ x: p.x, y: p.y, text: d.label })}
                        onPointerLeave={() => setHover(null)}
                      />
                    );
                  })}
                  {n ? (
                    <g pointerEvents="none">
                      <circle cx={e.x} cy={e.y} r={11} fill="#f59e0b" stroke="#fff" strokeWidth={2} />
                      <text x={e.x} y={e.y + 4} fontSize={10} fontWeight={800} fill="#1e293b" textAnchor="middle">
                        {n}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}

            {/* Rack (arrastrable). */}
            <g
              className="cursor-move"
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.currentTarget as Element).setPointerCapture(e.pointerId);
                setDrag({ kind: "rack" });
              }}
            >
              <rect x={rack.x - 26} y={rack.y - 36} width={52} height={72} rx={5} fill="#1e3553" filter="url(#fp-shadow)" />
              {[0, 1, 2, 3, 4].map((k) => (
                <rect key={k} x={rack.x - 19} y={rack.y - 29 + k * 12} width={38} height={8} rx={1} fill="#64748b" />
              ))}
              <rect x={rack.x - 46} y={rack.y + 42} width={92} height={30} rx={5} fill="#fff" stroke="#1e3553" />
              <text x={rack.x} y={rack.y + 55} fontSize={11} fontWeight={700} fill="#1e3553" textAnchor="middle">
                Rack central
              </text>
              <text x={rack.x} y={rack.y + 67} fontSize={9.5} fill="#475569" textAnchor="middle">
                {totals.cables} cables · {totals.meters} m
              </text>
            </g>

            {hover ? (
              <g pointerEvents="none">
                <rect x={hover.x + 8} y={hover.y - 22} width={Math.min(320, hover.text.length * 6.2 + 12)} height={18} rx={4} fill="#0f172a" opacity={0.9} />
                <text x={hover.x + 14} y={hover.y - 9} fontSize={10.5} fill="#fff">
                  {hover.text}
                </text>
              </g>
            ) : null}
          </svg>
          <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-white/90 px-2 py-1 text-[10px] text-slate-600 shadow-sm">
            {DIAGRAM_CATEGORIES.map((c, i) => (
              <span key={c} className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={i === 7 ? { border: `2px solid ${CAT_COLORS[i]}` } : { background: CAT_COLORS[i] }} />
                {c}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> Salida al rack (cables)
            </span>
          </div>
        </div>

        <aside className="max-h-[64vh] overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs">
          {sel ? <RoomDetail room={sel} onLevel={(l) => onSaveLevel(sel.id, l)} /> : <Summary rooms={placed} onPick={setSelected} />}
        </aside>
      </div>
      {levels.length < 2 ? (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Server className="h-3.5 w-3.5" /> ¿La casa tiene más de un piso? Tocá un ambiente y elegí su piso en el panel.
        </p>
      ) : null}
    </div>
  );
}

function Summary({ rooms, onPick }: { rooms: Placed[]; onPick: (id: string) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="font-semibold text-slate-700">Ambientes de este piso</p>
      {rooms.map((r) => (
        <button key={r.id} type="button" onClick={() => onPick(r.id)} className="flex w-full items-center justify-between rounded-md border border-slate-100 px-2 py-1.5 text-left hover:border-slate-300 hover:bg-slate-50">
          <span className="font-medium text-slate-700">{r.name}</span>
          <span className="text-slate-500">
            {trunkTotal(r)} cables · {r.trunkMeters} m
          </span>
        </button>
      ))}
    </div>
  );
}

function RoomDetail({ room, onLevel }: { room: Placed; onLevel: (level: string) => void }) {
  const groups = new Map<number, string[]>();
  for (const d of room.devices) {
    const c = categoryOf({ cls: d.cls ?? undefined, role: d.role, label: d.label });
    groups.set(c, [...(groups.get(c) ?? []), d.short]);
  }
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-bold text-[#1e3553]">{room.name}</p>
        <label className="mt-1 flex items-center gap-1.5 text-slate-500">
          Piso
          <select value={room.level} onChange={(e) => onLevel(e.target.value)} className="rounded border border-slate-200 px-1 py-0.5 text-[11px] text-slate-700">
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <p className="mb-1 flex items-center gap-1 font-semibold text-slate-700">
          <Cable className="h-3.5 w-3.5" /> Troncal al rack: {trunkTotal(room)} cables · {room.trunkMeters} m
        </p>
        {Object.entries(room.trunk).map(([s, k]) => (
          <div key={s} className="flex justify-between border-b border-slate-100 py-0.5">
            <span>{s}</span>
            <span className="font-mono">{k}</span>
          </div>
        ))}
        {!trunkTotal(room) ? <p className="text-slate-500">No lleva cables al rack.</p> : null}
      </div>
      <div>
        <p className="mb-1 font-semibold text-slate-700">Equipos ({room.devices.length})</p>
        {[...groups].sort((a, b) => a[0] - b[0]).map(([c, names]) => {
          const count = new Map<string, number>();
          for (const n of names) count.set(n, (count.get(n) ?? 0) + 1);
          return (
            <div key={c} className="mb-1.5">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase text-slate-500">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: CAT_COLORS[c] }} /> {DIAGRAM_CATEGORIES[c]}
              </p>
              {[...count].map(([n, q]) => (
                <p key={n} className="pl-3 text-slate-700">
                  {q > 1 ? `${q} × ` : ""}
                  {n}
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
