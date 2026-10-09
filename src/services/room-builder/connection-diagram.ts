/**
 * Diagrama de conexiones puerto a puerto (diagrama de bloques del sistema):
 * cada equipo es un bloque con sus entradas a la izquierda y sus salidas a la
 * derecha; las columnas siguen el flujo de la señal. Lógica pura: arma la
 * geometría y la usan la pantalla y el PDF.
 */

import { SIGNAL_INFO, portCount, type DeviceClass, type Signal } from "./device-ports";
import type { CableLink, CablingPlan } from "./cabling";

export type DiagramPort = { label: string; signal: Signal; used: boolean; y: number };
export type DiagramBlock = { id: string; label: string; cls: DeviceClass; x: number; y: number; w: number; h: number; inputs: DiagramPort[]; outputs: DiagramPort[]; virtual: boolean };
export type DiagramWire = { id: string; signal: Signal; points: Array<[number, number]>; label: string; dashed: boolean; color: string };
export type Diagram = { blocks: DiagramBlock[]; wires: DiagramWire[]; width: number; height: number; columns: string[] };

const COLUMN_TITLES = ["Fuentes y captura", "Procesamiento y red", "Amplificación", "Pantallas, parlantes y control"];
const STAGE: Record<DeviceClass, number> = { source: 0, camera: 0, mic: 0, codec: 1, dsp: 1, control: 1, switch: 1, streamer: 1, other: 1, amp: 2, display: 3, speaker: 3, subwoofer: 3, touch: 3 };

const BIDIR: Signal[] = ["lan", "dante", "wireless"];
const BLOCK_W = 230;
const COL_GAP = 140;
const HEADER = 30;
const ROW = 18;
const BLOCK_GAP = 22;
const MARGIN = 30;
const TOP = 56;

/** Arma el diagrama del cableado. */
export function buildDiagram(plan: CablingPlan): Diagram {
  const used = new Map<string, { inputs: Map<string, Signal>; outputs: Map<string, Signal> }>();
  const slot = (id: string) => {
    let u = used.get(id);
    if (!u) used.set(id, (u = { inputs: new Map(), outputs: new Map() }));
    return u;
  };
  // Columna: por clase; el switch o el rack central van al medio.
  const colOf = new Map(plan.nodes.map((n) => [n.id, n.id === "table" ? 0 : n.id === "central" ? 1 : STAGE[n.cls]]));
  // Red e inalámbrico van en los dos sentidos: el puerto se dibuja del lado del otro equipo.
  const sideOf = new Map<string, { from: "inputs" | "outputs"; to: "inputs" | "outputs" }>();
  for (const l of plan.links) {
    let from: "inputs" | "outputs" = "outputs";
    let to: "inputs" | "outputs" = "inputs";
    if (BIDIR.includes(l.signal)) {
      const a = colOf.get(l.from) ?? 0;
      const b = colOf.get(l.to) ?? 0;
      from = b < a ? "inputs" : "outputs";
      to = a > b ? "outputs" : "inputs";
    }
    sideOf.set(l.id, { from, to });
    slot(l.from)[from].set(l.fromPort, l.signal);
    slot(l.to)[to].set(l.toPort, l.signal);
  }

  const nodes = plan.nodes.filter((n) => used.has(n.id) || !n.virtual);
  const columns: typeof nodes[] = [[], [], [], []];
  for (const n of nodes) columns[colOf.get(n.id) ?? 1]!.push(n);
  const blocks: DiagramBlock[] = [];
  let height = 0;
  columns.forEach((col, c) => {
    let y = TOP;
    const x = MARGIN + c * (BLOCK_W + COL_GAP);
    for (const n of col.sort((a, b) => a.label.localeCompare(b.label))) {
      const u = used.get(n.id) ?? { inputs: new Map(), outputs: new Map() };
      const inputs: DiagramPort[] = [...u.inputs.entries()].map(([label, signal]) => ({ label, signal, used: true, y: 0 }));
      const outputs: DiagramPort[] = [...u.outputs.entries()].map(([label, signal]) => ({ label, signal, used: true, y: 0 }));
      // Puertos libres de la ficha (para ver la capacidad que queda).
      if (n.ports && !n.virtual) {
        for (const g of n.ports.inputs) {
          const free = portCount(n.ports, "inputs", g.signal) - [...u.inputs.values()].filter((s) => s === g.signal).length;
          if (free > 0 && !inputs.some((p) => !p.used && p.signal === g.signal)) inputs.push({ label: `${SIGNAL_INFO[g.signal].label} · ${free} libre(s)`, signal: g.signal, used: false, y: 0 });
        }
        for (const g of n.ports.outputs) {
          const free = portCount(n.ports, "outputs", g.signal) - [...u.outputs.values()].filter((s) => s === g.signal).length;
          if (free > 0 && !outputs.some((p) => !p.used && p.signal === g.signal)) outputs.push({ label: `${SIGNAL_INFO[g.signal].label} · ${free} libre(s)`, signal: g.signal, used: false, y: 0 });
        }
      }
      const rows = Math.max(1, inputs.length, outputs.length);
      const h = HEADER + rows * ROW + 8;
      inputs.forEach((p, i) => (p.y = y + HEADER + i * ROW + ROW / 2));
      outputs.forEach((p, i) => (p.y = y + HEADER + i * ROW + ROW / 2));
      blocks.push({ id: n.id, label: n.label, cls: n.cls, x, y, w: BLOCK_W, h, inputs, outputs, virtual: Boolean(n.virtual) });
      y += h + BLOCK_GAP;
    }
    height = Math.max(height, y);
  });

  const byId = new Map(blocks.map((b) => [b.id, b]));
  const wires: DiagramWire[] = [];
  plan.links.forEach((l: CableLink, k) => {
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    if (!a || !b) return;
    const side = sideOf.get(l.id) ?? { from: "outputs", to: "inputs" };
    const pa = a[side.from].find((p) => p.label === l.fromPort);
    const pb = b[side.to].find((p) => p.label === l.toPort);
    if (!pa || !pb) return;
    // Con el sentido invertido se dibuja de derecha a izquierda (mismo trazado, espejado).
    const flip = side.from === "inputs";
    const x1 = flip ? b.x + b.w : a.x + a.w;
    const x2 = flip ? a.x : b.x;
    const y1 = flip ? pb.y : pa.y;
    const y2 = flip ? pa.y : pb.y;
    // Carril propio para cada cable entre columnas, para que no se encimen.
    const lane = ((k % 12) - 6) * 6;
    let points: Array<[number, number]>;
    if (x2 > x1 + 20) {
      const mx = (x1 + x2) / 2 + lane;
      points = [
        [x1, y1],
        [mx, y1],
        [mx, y2],
        [x2, y2],
      ];
    } else {
      // Hacia atrás o en la misma columna: rodea por afuera.
      const out = x1 + 24 + Math.abs(lane);
      const back = x2 - 24 - Math.abs(lane);
      const midY = Math.max(a.y + a.h, b.y + b.h) + 10 + Math.abs(lane);
      points = [
        [x1, y1],
        [out, y1],
        [out, midY],
        [back, midY],
        [back, y2],
        [x2, y2],
      ];
      height = Math.max(height, midY + 20);
    }
    wires.push({
      id: l.id,
      signal: l.signal,
      points,
      label: l.signal === "wireless" ? (l.fromPort ?? "") : `${l.cableM} m`,
      dashed: l.signal === "wireless",
      color: SIGNAL_INFO[l.signal].color,
    });
  });
  return { blocks, wires, width: MARGIN * 2 + 4 * BLOCK_W + 3 * COL_GAP, height: height + MARGIN, columns: COLUMN_TITLES };
}
