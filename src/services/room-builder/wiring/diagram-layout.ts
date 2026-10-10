/**
 * Diagrama de señal (esquemático): cada equipo es un bloque con sus puertos
 * reales (entradas a la izquierda, salidas y E/S a la derecha) y cada cable va
 * de puerto a puerto en tramos rectos. Las columnas siguen el flujo de la
 * señal (fuentes → proceso → salidas) y el orden dentro de cada columna
 * reduce los cruces. Las posiciones que el usuario mueve a mano se respetan.
 */

import type { PlacedDevice, WiringModel } from "./model";
import { WIRE_SIGNAL_STYLE, type Wire, type WirePort } from "./types";

export const BLOCK_W = 240;
export const HEADER_H = 34;
export const ROW_H = 18;
const BLOCK_PAD = 8;
const COL_GAP = 170;
const ROW_GAP = 34;
const MARGIN = 40;
/** Separación entre carriles verticales de cables dentro de un hueco entre columnas. */
const LANE_STEP = 7;
/** Iteraciones de ordenamiento por baricentro. */
const SWEEPS = 4;

export type DiagramPort = WirePort & { side: "left" | "right"; y: number; used: number };
export type DiagramBlock = {
  key: string;
  deviceId: string;
  unit: number;
  label: string;
  short: string;
  role: string;
  remote: boolean;
  column: number;
  x: number;
  y: number;
  w: number;
  h: number;
  ports: DiagramPort[];
  /** Puertos sin ficha: el bloque se dibuja, pero no se puede cablear hasta cargarlos. */
  noPorts: boolean;
};
export type DiagramWire = { id: string; label: string | null; signal: Wire["signal"]; color: string; points: Array<[number, number]>; fromKey: string; toKey: string };
export type DiagramLayout = { blocks: DiagramBlock[]; wires: DiagramWire[]; width: number; height: number; columns: string[] };
/** Posiciones movidas a mano, por bloque ("deviceId#unit"). */
export type DiagramPositions = Record<string, { x: number; y: number }>;

export const blockKey = (deviceId: string, unit: number) => `${deviceId}#${unit}`;

/** Columna base por rol cuando el equipo no tiene cables que definan su lugar. */
const ROLE_RANK: Record<string, number> = { camera: 0, mic: 0, source: 0, codec: 1, processor: 1, other: 1, touch: 1, display: 2, speaker: 2 };
const COLUMN_TITLES = ["Fuentes", "Proceso y distribución", "Salidas", "Salidas", "Salidas"];

/** Lado del puerto: entradas a la izquierda; salidas y E/S a la derecha (salvo E/S que solo reciben). */
function sideOf(port: WirePort, asTarget: number, asSource: number): "left" | "right" {
  if (port.direction === "in") return "left";
  if (port.direction === "out") return "right";
  return asTarget > asSource ? "left" : "right";
}

/** Columna de cada bloque: camino más largo desde una fuente siguiendo el sentido de los cables. */
function columnsOf(devices: PlacedDevice[], wires: Wire[]): Map<string, number> {
  const keys = devices.map((d) => blockKey(d.deviceId, d.unit));
  const out = new Map<string, string[]>(keys.map((k) => [k, []]));
  const indeg = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const w of wires) {
    const a = blockKey(w.from.deviceId, w.from.unit);
    const b = blockKey(w.to.deviceId, w.to.unit);
    if (a === b || !out.has(a) || !out.has(b)) continue;
    out.get(a)!.push(b);
    indeg.set(b, (indeg.get(b) ?? 0) + 1);
  }
  const col = new Map<string, number>();
  const connected = new Set(wires.flatMap((w) => [blockKey(w.from.deviceId, w.from.unit), blockKey(w.to.deviceId, w.to.unit)]));
  // Kahn con relajación del camino más largo (los ciclos se cortan por tope de iteraciones).
  const queue = keys.filter((k) => (indeg.get(k) ?? 0) === 0);
  for (const k of keys) col.set(k, 0);
  const seen = new Map<string, number>();
  while (queue.length) {
    const k = queue.shift()!;
    for (const n of out.get(k) ?? []) {
      col.set(n, Math.max(col.get(n) ?? 0, (col.get(k) ?? 0) + 1));
      const left = (indeg.get(n) ?? 1) - 1;
      indeg.set(n, left);
      const times = (seen.get(n) ?? 0) + 1;
      seen.set(n, times);
      if (left === 0 && times <= keys.length) queue.push(n);
    }
  }
  for (const d of devices) {
    const k = blockKey(d.deviceId, d.unit);
    if (!connected.has(k)) col.set(k, ROLE_RANK[d.role] ?? 1);
    // Los equipos del rack central van al medio aunque solo reciban.
    if (d.remote) col.set(k, Math.max(1, col.get(k) ?? 1));
  }
  return col;
}

export function layoutDiagram(model: WiringModel, positions: DiagramPositions = {}): DiagramLayout {
  const wires = model.wires;
  const cols = columnsOf(model.devices, wires);
  const usage = new Map<string, { target: number; source: number; used: number }>();
  const bump = (deviceId: string, unit: number, portId: string, as: "target" | "source") => {
    const k = `${blockKey(deviceId, unit)}|${portId}`;
    const u = usage.get(k) ?? { target: 0, source: 0, used: 0 };
    u[as]++;
    u.used++;
    usage.set(k, u);
  };
  for (const w of wires) {
    bump(w.from.deviceId, w.from.unit, w.from.portId, "source");
    bump(w.to.deviceId, w.to.unit, w.to.portId, "target");
  }

  // Bloques con sus puertos acomodados por lado.
  const blocks: DiagramBlock[] = model.devices.map((d) => {
    const key = blockKey(d.deviceId, d.unit);
    const raw = model.ports[d.deviceId] ?? [];
    const withSide = raw.map((p) => {
      const u = usage.get(`${key}|${p.id}`) ?? { target: 0, source: 0, used: 0 };
      return { ...p, side: sideOf(p, u.target, u.source), y: 0, used: u.used };
    });
    const left = withSide.filter((p) => p.side === "left");
    const right = withSide.filter((p) => p.side === "right");
    const rows = Math.max(left.length, right.length, 1);
    left.forEach((p, i) => (p.y = HEADER_H + BLOCK_PAD + i * ROW_H + ROW_H / 2));
    right.forEach((p, i) => (p.y = HEADER_H + BLOCK_PAD + i * ROW_H + ROW_H / 2));
    return {
      key,
      deviceId: d.deviceId,
      unit: d.unit,
      label: d.label,
      short: d.short,
      role: d.role,
      remote: d.remote,
      column: cols.get(key) ?? 1,
      x: 0,
      y: 0,
      w: BLOCK_W,
      h: HEADER_H + BLOCK_PAD * 2 + rows * ROW_H,
      ports: [...left, ...right],
      noPorts: raw.length === 0,
    };
  });

  // Orden dentro de cada columna por baricentro de los vecinos (menos cruces).
  const byCol = new Map<number, DiagramBlock[]>();
  for (const b of blocks) byCol.set(b.column, [...(byCol.get(b.column) ?? []), b]);
  const colIdx = [...byCol.keys()].sort((a, b) => a - b);
  for (const c of colIdx) byCol.get(c)!.sort((a, b) => a.label.localeCompare(b.label));
  const order = new Map<string, number>();
  const refresh = () => colIdx.forEach((c) => byCol.get(c)!.forEach((b, i) => order.set(b.key, i)));
  refresh();
  const neighbors = new Map<string, string[]>();
  for (const w of wires) {
    const a = blockKey(w.from.deviceId, w.from.unit);
    const b = blockKey(w.to.deviceId, w.to.unit);
    neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
    neighbors.set(b, [...(neighbors.get(b) ?? []), a]);
  }
  for (let s = 0; s < SWEEPS; s++) {
    for (const c of s % 2 ? [...colIdx].reverse() : colIdx) {
      const list = byCol.get(c)!;
      const score = (b: DiagramBlock) => {
        const ns = (neighbors.get(b.key) ?? []).map((k) => order.get(k)).filter((v): v is number => v != null);
        return ns.length ? ns.reduce((a, v) => a + v, 0) / ns.length : (order.get(b.key) ?? 0);
      };
      list.sort((a, b) => score(a) - score(b));
      refresh();
    }
  }

  // Posición: columnas compactadas de izquierda a derecha; dentro, apilado.
  colIdx.forEach((c, ci) => {
    let y = MARGIN + 24;
    for (const b of byCol.get(c)!) {
      b.x = MARGIN + ci * (BLOCK_W + COL_GAP);
      b.y = y;
      y += b.h + ROW_GAP;
    }
  });
  for (const b of blocks) {
    const saved = positions[b.key];
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      b.x = saved.x;
      b.y = saved.y;
    }
  }

  // Cables en tramos rectos: sale del puerto, baja/sube por un carril propio y entra al destino.
  const byKey = new Map(blocks.map((b) => [b.key, b]));
  const lanes = new Map<number, number>();
  const diagramWires: DiagramWire[] = [];
  for (const w of wires) {
    const a = byKey.get(blockKey(w.from.deviceId, w.from.unit));
    const b = byKey.get(blockKey(w.to.deviceId, w.to.unit));
    if (!a || !b) continue;
    const pa = a.ports.find((p) => p.id === w.from.portId);
    const pb = b.ports.find((p) => p.id === w.to.portId);
    if (!pa || !pb) continue;
    const ax = pa.side === "right" ? a.x + a.w : a.x;
    const bx = pb.side === "right" ? b.x + b.w : b.x;
    const ay = a.y + pa.y;
    const by = b.y + pb.y;
    const stubA = pa.side === "right" ? ax + 14 : ax - 14;
    const stubB = pb.side === "right" ? bx + 14 : bx - 14;
    // Carril vertical en el hueco más cercano al origen, desplazado para no pisar otros cables.
    const gapX = Math.round((stubA + stubB) / 2 / 10) * 10;
    const lane = lanes.get(gapX) ?? 0;
    lanes.set(gapX, lane + 1);
    const midX = gapX + ((lane % 2 ? 1 : -1) * Math.ceil(lane / 2)) * LANE_STEP;
    const points: Array<[number, number]> = [
      [ax, ay],
      [stubA, ay],
      [midX, ay],
      [midX, by],
      [stubB, by],
      [bx, by],
    ];
    diagramWires.push({ id: w.id, label: w.label, signal: w.signal, color: WIRE_SIGNAL_STYLE[w.signal].color, points, fromKey: a.key, toKey: b.key });
  }

  const width = Math.max(...blocks.map((b) => b.x + b.w), 600) + MARGIN;
  const height = Math.max(...blocks.map((b) => b.y + b.h), 400) + MARGIN;
  const columns = colIdx.map((c) => COLUMN_TITLES[Math.min(c, COLUMN_TITLES.length - 1)] ?? "");
  return { blocks, wires: diagramWires, width, height, columns };
}
