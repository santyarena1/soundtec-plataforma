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
/** Alto máximo de una columna antes de repartirla en sub-columnas. */
const WRAP_H = 1100;
const SUB_GAP = 40;
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

/** Columnas del esquema, en el orden del flujo de la señal. */
export const DIAGRAM_CATEGORIES = [
  "Fuentes y captura",
  "Control y automatización",
  "Red",
  "Distribución de video",
  "Proceso de audio",
  "Amplificación",
  "Pantallas",
  "Parlantes",
  "Otros equipos",
] as const;

/** Categoría de un equipo por su clase de cableado (y su rol si no la tiene). */
export function categoryOf(d: { cls?: string; role: string; label: string }): number {
  const c = d.cls ?? "";
  if (["source", "streamer", "camera", "mic"].includes(c) || ["camera", "mic"].includes(d.role)) return 0;
  if (["control", "touch"].includes(c) || d.role === "touch" || /cortina|shade|dimmer|teclado|keypad|sensor|termostato|rel[eé]/i.test(d.label)) return 1;
  if (c === "switch") return 2;
  if (c === "video-switch" || c === "codec" || d.role === "codec" || /extensor|hdbaset|matriz|matrix|switcher/i.test(d.label)) return 3;
  if (c === "dsp") return 4;
  if (c === "amp") return 5;
  if (c === "display" || d.role === "display") return 6;
  if (c === "speaker" || c === "subwoofer" || d.role === "speaker") return 7;
  return 8;
}

/** Lado del puerto: entradas a la izquierda; salidas y E/S a la derecha (salvo E/S que solo reciben). */
function sideOf(port: WirePort, asTarget: number, asSource: number): "left" | "right" {
  if (port.direction === "in") return "left";
  if (port.direction === "out") return "right";
  return asTarget > asSource ? "left" : "right";
}

export function layoutDiagram(model: WiringModel, positions: DiagramPositions = {}): DiagramLayout {
  const wires = model.wires;
  // Columna = categoría profesional del equipo (fuentes → control → red → video → audio → amplificación → salidas).
  const cols = new Map(model.devices.map((d) => [blockKey(d.deviceId, d.unit), categoryOf(d)]));
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

  // Posición: columnas de izquierda a derecha; las muy altas se reparten en sub-columnas.
  let x = MARGIN;
  for (const c of colIdx) {
    let y = MARGIN + 24;
    let sub = 0;
    for (const b of byCol.get(c)!) {
      if (y > MARGIN + 24 && y + b.h > WRAP_H) {
        sub++;
        y = MARGIN + 24;
      }
      b.x = x + sub * (BLOCK_W + SUB_GAP);
      b.y = y;
      y += b.h + ROW_GAP;
    }
    x += (sub + 1) * (BLOCK_W + SUB_GAP) - SUB_GAP + COL_GAP;
  }
  const pinned = blocks.filter((b) => {
    const saved = positions[b.key];
    if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return false;
    b.x = saved.x;
    b.y = saved.y;
    return true;
  });
  // Equipos nuevos en un diagrama ya acomodado a mano: van debajo de todo, sin pisar nada.
  if (pinned.length) {
    const pinnedKeys = new Set(pinned.map((b) => b.key));
    let y = Math.max(...pinned.map((b) => b.y + b.h)) + ROW_GAP * 2;
    let x = MARGIN;
    for (const b of blocks.filter((q) => !pinnedKeys.has(q.key))) {
      b.x = x;
      b.y = y;
      x += BLOCK_W + SUB_GAP;
      if (x > MARGIN + 4 * (BLOCK_W + SUB_GAP)) {
        x = MARGIN;
        y += b.h + ROW_GAP;
      }
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
  const columns = colIdx.map((c) => DIAGRAM_CATEGORIES[c] ?? "");
  return { blocks, wires: diagramWires, width, height, columns };
}
