/**
 * Troncal de un ambiente al rack central del proyecto: el tramo que va desde
 * la salida de la sala (puerta) hasta el rack, en recorrido ortogonal (como se
 * tiende por pasillo / cielorraso). Antes los cables al rack se medían solo
 * hasta la puerta.
 *
 * - Con plano del edificio (ambientes dibujados sobre la imagen): se mide en
 *   el plano; si el rack no se ubicó todavía, se usa su lugar por defecto y el
 *   largo queda estimado.
 * - Sin plano (planta esquemática): la ubicación entre ambientes es
 *   indicativa, así que el largo queda estimado; si falta ubicar el ambiente o
 *   el rack, no se suma nada y se avisa (el cable no se omite).
 */

import type { RackTrunk } from "./model";

type Box = { x0: number; y0: number; x1: number; y1: number };
export type TrunkRoom = { id: string; widthM: number; depthM: number; box: Box | null; exit: { x: number; z: number } };
export type TrunkContext = {
  image: { widthPx: number; heightPx: number } | null;
  /** Rack: con plano, fracción 0..1 de la imagen; sin plano, px de la planta esquemática. */
  rack: { u: number; v: number } | null;
  rooms: TrunkRoom[];
  roomPos: Record<string, { x: number; y: number }>;
};

/** Planta esquemática de la vista técnica del proyecto (project-floor-plan.tsx): px por metro y encabezado. */
const SCHEMATIC_PX_PER_M = 40;
const SCHEMATIC_HEADER_PX = 26;
/** Lugar del rack por defecto sobre el plano (igual que la vista y las láminas). */
const DEFAULT_RACK = { u: 0.05, v: 0.5 };

const round1 = (n: number) => Math.round(n * 10) / 10;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 1;
};

/** ¿Los ambientes están ubicados sobre el plano del edificio? (misma regla que la vista técnica). */
export const isPlanMode = (ctx: TrunkContext) => Boolean(ctx.image && ctx.rooms.length && ctx.rooms.every((r) => r.box));

export function rackTrunk(ctx: TrunkContext, roomId: string): RackTrunk {
  const room = ctx.rooms.find((r) => r.id === roomId);
  if (!room) return { meters: null, measured: false, note: "El ambiente no está en la planta del proyecto: falta sumar el tramo hasta el rack." };
  if (isPlanMode(ctx) && ctx.image) {
    const W = ctx.image.widthPx;
    const H = ctx.image.heightPx;
    const ppm = median(ctx.rooms.flatMap((r) => [((r.box!.x1 - r.box!.x0) * W) / Math.max(0.5, r.widthM), ((r.box!.y1 - r.box!.y0) * H) / Math.max(0.5, r.depthM)]));
    const b = room.box!;
    const sx = ((b.x1 - b.x0) * W) / Math.max(0.5, room.widthM);
    const sz = ((b.y1 - b.y0) * H) / Math.max(0.5, room.depthM);
    const ex = ((b.x0 + b.x1) / 2) * W + room.exit.x * sx;
    const ey = ((b.y0 + b.y1) / 2) * H + room.exit.z * sz;
    const rack = ctx.rack ?? DEFAULT_RACK;
    const meters = round1((Math.abs(rack.u * W - ex) + Math.abs(rack.v * H - ey)) / Math.max(1e-6, ppm));
    return ctx.rack
      ? { meters, measured: true, note: `Incluye ${meters} m de troncal hasta el rack, medidos sobre el plano.` }
      : { meters, measured: false, note: `Incluye ${meters} m de troncal hasta el lugar por defecto del rack: ubicá el rack en la planta del proyecto para medirla.` };
  }
  const pos = ctx.roomPos[roomId];
  if (!pos || !ctx.rack) return { meters: null, measured: false, note: "Falta ubicar el ambiente y el rack en la planta del proyecto: el tramo hasta el rack no está sumado." };
  const ex = pos.x + (room.exit.x + Math.max(3, room.widthM) / 2) * SCHEMATIC_PX_PER_M;
  const ey = pos.y + SCHEMATIC_HEADER_PX + (room.exit.z + Math.max(3, room.depthM) / 2) * SCHEMATIC_PX_PER_M;
  const meters = round1((Math.abs(ctx.rack.u - ex) + Math.abs(ctx.rack.v - ey)) / SCHEMATIC_PX_PER_M);
  return { meters, measured: false, note: `Incluye ${meters} m de troncal estimados sobre la planta esquemática (sin plano del edificio).` };
}
