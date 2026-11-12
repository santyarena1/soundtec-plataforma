/**
 * Dónde va el rack / mueble técnico de la sala: dentro de la sala, en un
 * rincón contra la pared del fondo, fuera del barrido de la puerta y sin
 * tapar aberturas. Sin plano, la puerta es la que dibuja el 3D (pared del
 * fondo, a 0,28 del ancho hacia la izquierda); con plano, las puertas reales.
 */

import type { Pose } from "./types";

type Dims = { widthM: number; depthM: number };
export type DoorPoint = { x: number; z: number };

const WALL_INSET_M = 0.08;
/** Medio fondo/ancho del mueble técnico (m). */
const RACK_HALF_M = 0.35;
/** Altura de referencia de los equipos dentro del rack (m). */
export const RACK_Y_M = 0.45;
/** Hoja de puerta típica (0,9–1 m) + medio rack + paso: distancia mínima al centro de una puerta (m). */
const DOOR_CLEAR_M = 1.5;
/** Puerta por defecto de una sala rectangular (la del 3D y las láminas): pared del fondo, 0,28 del ancho a la izquierda. */
const DEFAULT_DOOR_X_RATIO = -0.28;

/** Puertas de una sala rectangular sin plano. */
export function defaultDoors(dims: Dims): DoorPoint[] {
  return [{ x: dims.widthM * DEFAULT_DOOR_X_RATIO, z: -dims.depthM / 2 }];
}

/** Centros de las puertas del plano (si hay plano con puertas), en metros de la sala. */
export function doorCentersOf(scene: {
  plan?: { enabled?: boolean; walls?: Array<{ id: string; a: { x: number; y: number }; b: { x: number; y: number } }>; openings?: Array<{ kind: string; wall: string; from: number; to: number }> } | null;
}): DoorPoint[] | null {
  const plan = scene.plan;
  if (!plan?.enabled || !plan.walls?.length) return null;
  const out: DoorPoint[] = [];
  for (const o of plan.openings ?? []) {
    if (o.kind !== "door") continue;
    const w = plan.walls.find((x) => x.id === o.wall);
    if (!w) continue;
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const t = (o.from + o.to) / 2 / len;
    out.push({ x: w.a.x + (w.b.x - w.a.x) * t, z: w.a.y + (w.b.y - w.a.y) * t });
  }
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Rincón para el rack: primero los del fondo (lejos de la pared AV), el que
 * quede fuera del barrido de toda puerta; si ninguno, el más alejado.
 */
export function rackAnchor(dims: Dims, doors: DoorPoint[] | null = null): Pose {
  const list = doors ?? defaultDoors(dims);
  const x = dims.widthM / 2 - WALL_INSET_M - RACK_HALF_M;
  const z = dims.depthM / 2 - WALL_INSET_M - RACK_HALF_M;
  const corners = [
    { x, z: -z },
    { x: -x, z: -z },
    { x, z },
    { x: -x, z },
  ];
  const clearance = (c: { x: number; z: number }) => (list.length ? Math.min(...list.map((d) => Math.hypot(d.x - c.x, d.z - c.z))) : Number.POSITIVE_INFINITY);
  const free = corners.find((c) => clearance(c) >= DOOR_CLEAR_M);
  const best = free ?? [...corners].sort((a, b) => clearance(b) - clearance(a))[0]!;
  return { x: r2(best.x), y: RACK_Y_M, z: r2(best.z), rotY: best.z < 0 ? 0 : 180 };
}

/** ¿Un punto del piso cae dentro del barrido de alguna puerta? */
export function inDoorSwing(p: { x: number; z: number }, doors: DoorPoint[], radiusM = DOOR_CLEAR_M - RACK_HALF_M): boolean {
  return doors.some((d) => Math.hypot(d.x - p.x, d.z - p.z) < radiusM);
}
