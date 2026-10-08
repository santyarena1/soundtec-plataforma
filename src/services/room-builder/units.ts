/**
 * Unidades físicas de cada equipo.
 *
 * Un equipo con cantidad 4 son 4 objetos en la sala, cada uno con su lugar.
 * Las unidades que el usuario no movió se reparten solas según dónde se
 * montan (techo en grilla, pared enfrentadas, etc.); las que movió quedan
 * donde las dejó (solo se acomodan si la sala se achica).
 */

import type { Pose, RoomSlot } from "./types";
import type { RoomScene, SceneDevice } from "./scene";

export type DeviceUnit = {
  id: string;
  pose: Pose;
  /** true = el usuario la ubicó a mano. */
  placed?: boolean;
};

export type RoomDims = { widthM: number; depthM: number; heightM: number };
type Mount = RoomSlot["mount"];

export const WALL_INSET_M = 0.08;
const CEILING_DROP_M = 0.05;
/** Margen a las esquinas para no pegar equipos al rincón. */
const CORNER_MARGIN_M = 0.45;
const SIDE_BY_SIDE_M = 0.55;
export const MAX_UNITS = 48;

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type Wall = "front" | "back" | "left" | "right";

/** Hacia dónde mira un equipo colgado en cada pared (mira al centro de la sala). */
export const WALL_ROT_Y: Record<Wall, number> = { front: 180, back: 0, left: 90, right: -90 };

/** Pared en la que está una pose de pared (por cercanía). */
export function wallOf(pose: Pose, dims: RoomDims): Wall {
  const dx = dims.widthM / 2 - Math.abs(pose.x);
  const dz = dims.depthM / 2 - Math.abs(pose.z);
  if (dx < dz) return pose.x < 0 ? "left" : "right";
  return pose.z < 0 ? "back" : "front";
}

function opposite(w: Wall): Wall {
  return ({ front: "back", back: "front", left: "right", right: "left" } as const)[w];
}

/** n posiciones repartidas a lo largo de un tramo, centradas. */
function spread(n: number, length: number): number[] {
  const usable = Math.max(0, length - CORNER_MARGIN_M * 2);
  if (n <= 1) return [0];
  const step = usable / n;
  return Array.from({ length: n }, (_, i) => -usable / 2 + step * (i + 0.5));
}

function onWall(wall: Wall, along: number, y: number, dims: RoomDims): Pose {
  const fx = dims.widthM / 2 - WALL_INSET_M;
  const fz = dims.depthM / 2 - WALL_INSET_M;
  switch (wall) {
    case "front":
      return { x: r2(along), y: r2(y), z: r2(fz), rotY: WALL_ROT_Y.front };
    case "back":
      return { x: r2(along), y: r2(y), z: r2(-fz), rotY: WALL_ROT_Y.back };
    case "left":
      return { x: r2(-fx), y: r2(y), z: r2(along), rotY: WALL_ROT_Y.left };
    case "right":
      return { x: r2(fx), y: r2(y), z: r2(along), rotY: WALL_ROT_Y.right };
  }
}

const wallLength = (w: Wall, dims: RoomDims) => (w === "front" || w === "back" ? dims.widthM : dims.depthM);

/**
 * Lugares por defecto para `count` unidades a partir del lugar de la
 * plantilla (`anchor`).
 */
export function distributeUnits(anchor: Pose, mount: Mount, count: number, dims: RoomDims): Pose[] {
  const n = clamp(Math.round(count), 1, MAX_UNITS);
  if (mount === "ceiling") {
    const y = dims.heightM - CEILING_DROP_M;
    if (n === 1) return [{ ...anchor, y: r2(y) }];
    const cols = clamp(Math.round(Math.sqrt((n * dims.widthM) / dims.depthM)), 1, n);
    const rows = Math.ceil(n / cols);
    const poses: Pose[] = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols);
      const inRow = row === rows - 1 ? n - row * cols : cols;
      const col = i % cols;
      const x = -dims.widthM / 2 + (dims.widthM / inRow) * (col + 0.5);
      const z = -dims.depthM / 2 + (dims.depthM / rows) * (row + 0.5);
      poses.push({ x: r2(x), y: r2(y), z: r2(z), rotY: 0 });
    }
    return poses;
  }
  if (mount === "wall" || mount === "floor") {
    const wall = wallOf(anchor, dims);
    const y = mount === "floor" ? 0 : anchor.y;
    // Hasta 2 en la misma pared; más, se reparten en paredes enfrentadas (estéreo / envolvente).
    const walls: Wall[] = n <= 2 ? [wall] : [wall, opposite(wall)];
    const perWall = walls.map((_, i) => Math.floor(n / walls.length) + (i < n % walls.length ? 1 : 0));
    return walls.flatMap((w, i) => spread(perWall[i], wallLength(w, dims)).map((along) => onWall(w, along, y, dims)));
  }
  // mesa, rack: uno al lado del otro
  return Array.from({ length: n }, (_, i) => ({
    ...anchor,
    x: r2(anchor.x + (i - (n - 1) / 2) * SIDE_BY_SIDE_M),
  }));
}

/** Mantiene una pose dentro de la sala (por si se achicó). */
export function clampPoseToRoom(pose: Pose, dims: RoomDims): Pose {
  const fx = dims.widthM / 2 - WALL_INSET_M;
  const fz = dims.depthM / 2 - WALL_INSET_M;
  return {
    ...pose,
    x: r2(clamp(pose.x, -fx, fx)),
    z: r2(clamp(pose.z, -fz, fz)),
    y: r2(clamp(pose.y, 0, dims.heightM - CEILING_DROP_M)),
  };
}

/** Ids estables (`slot#n`) para que la selección no salte entre renders. */
function freeIds(slotKey: string, count: number, taken: Set<string>, reuse: string[]): string[] {
  const ids: string[] = [];
  for (const id of reuse) {
    if (ids.length >= count) break;
    if (!taken.has(id)) {
      ids.push(id);
      taken.add(id);
    }
  }
  for (let n = 0; ids.length < count; n++) {
    const id = `${slotKey}#${n}`;
    if (!taken.has(id)) {
      ids.push(id);
      taken.add(id);
    }
  }
  return ids;
}

/**
 * Deja `device.units` coherente con su cantidad: agrega o quita unidades,
 * reparte las no ubicadas a mano y acomoda las ubicadas dentro de la sala.
 */
export function normalizeDeviceUnits(device: SceneDevice, slot: Pick<RoomSlot, "mount" | "pose"> | undefined, dims: RoomDims): SceneDevice {
  const quantity = clamp(Math.round(device.quantity || 1), 1, MAX_UNITS);
  const prev = Array.isArray(device.units) ? device.units : [];
  const placed = prev.filter((u) => u.placed).slice(0, quantity).map((u) => ({ ...u, pose: clampPoseToRoom(u.pose, dims) }));
  const freeCount = quantity - placed.length;
  const anchor = slot?.pose ?? device.pose;
  const mount = slot?.mount ?? "wall";
  const freePoses = freeCount > 0 ? distributeUnits(anchor, mount, freeCount, dims) : [];
  const ids = freeIds(device.slotKey, freePoses.length, new Set(placed.map((u) => u.id)), prev.filter((u) => !u.placed).map((u) => u.id));
  const free = freePoses.map((pose, i) => ({ id: ids[i], pose }));
  const units = [...placed, ...free];
  return { ...device, quantity, units, pose: units[0]?.pose ?? device.pose };
}

/** Aplica normalizeDeviceUnits a toda la escena. */
export function normalizeSceneUnits(scene: RoomScene): RoomScene {
  const dims = { widthM: scene.widthM, depthM: scene.depthM, heightM: scene.heightM };
  const slots = new Map(scene.slots.map((s) => [s.key, s]));
  return { ...scene, devices: scene.devices.map((d) => normalizeDeviceUnits(d, slots.get(d.slotKey), dims)) };
}

/* ── Arrastre: en qué superficie de la sala cae el puntero ── */

export type Ray = { origin: [number, number, number]; dir: [number, number, number] };
export type SurfaceHit = { pose: Pose; surface: Wall | "ceiling" | "floor" };

/**
 * Intersección del rayo del mouse con las superficies válidas para el
 * montaje (paredes, techo o piso). Devuelve la pose ya orientada.
 * `keepY`: para mesa/rack se arrastra a la altura que ya tiene.
 */
export function surfaceHit(ray: Ray, mount: Mount, dims: RoomDims, keepY = 0): SurfaceHit | null {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.dir;
  const fx = dims.widthM / 2 - WALL_INSET_M;
  const fz = dims.depthM / 2 - WALL_INSET_M;
  const top = dims.heightM - CEILING_DROP_M;
  const candidates: Array<{ t: number; hit: SurfaceHit }> = [];
  const at = (t: number) => [ox + dx * t, oy + dy * t, oz + dz * t] as const;
  const inside = (x: number, y: number, z: number) => Math.abs(x) <= fx + 1e-6 && Math.abs(z) <= fz + 1e-6 && y >= -1e-6 && y <= top + 1e-6;

  if (mount === "wall") {
    const planes: Array<[Wall, "x" | "z", number]> = [
      ["front", "z", fz],
      ["back", "z", -fz],
      ["left", "x", -fx],
      ["right", "x", fx],
    ];
    for (const [wall, axis, value] of planes) {
      const d = axis === "x" ? dx : dz;
      if (Math.abs(d) < 1e-9) continue;
      const t = (value - (axis === "x" ? ox : oz)) / d;
      if (t <= 0) continue;
      const [x, y, z] = at(t);
      if (!inside(x, y, z)) continue;
      const yy = clamp(y, 0.2, top - 0.15);
      candidates.push({ t, hit: { surface: wall, pose: { x: r2(x), y: r2(yy), z: r2(z), rotY: WALL_ROT_Y[wall] } } });
    }
  } else {
    const y = mount === "ceiling" ? top : mount === "floor" ? 0 : keepY;
    if (Math.abs(dy) > 1e-9) {
      const t = (y - oy) / dy;
      if (t > 0) {
        const [x, , z] = at(t);
        if (Math.abs(x) <= fx && Math.abs(z) <= fz) {
          candidates.push({ t, hit: { surface: mount === "ceiling" ? "ceiling" : "floor", pose: { x: r2(x), y: r2(y), z: r2(z), rotY: 0 } } });
        }
      }
    }
  }
  // Paredes: la más lejana es la que se ve (la cercana está oculta en vista de casa de muñecas,
  // y desde adentro de la sala solo hay una intersección hacia adelante).
  candidates.sort((a, b) => b.t - a.t);
  return candidates[0]?.hit ?? null;
}
