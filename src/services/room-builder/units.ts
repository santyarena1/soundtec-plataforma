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
import { pointInPolygon } from "./plan-polygon";

export type DeviceUnit = {
  id: string;
  pose: Pose;
  /** true = el usuario la ubicó a mano. */
  placed?: boolean;
};

/** floor: forma real del piso en metros (x, y = z de la escena), si no es un rectángulo. */
export type RoomDims = { widthM: number; depthM: number; heightM: number; floor?: Array<{ x: number; y: number }> | null };
type Mount = RoomSlot["mount"];

export const WALL_INSET_M = 0.08;
const CEILING_DROP_M = 0.05;
/** Margen a las esquinas para no pegar equipos al rincón. */
const CORNER_MARGIN_M = 0.45;
/** Margen mínimo a la esquina cuando la pared está llena. */
const MIN_CORNER_M = 0.15;
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
  // Con muchas unidades se resigna margen de esquina antes que separación entre ellas.
  const margin = clamp((length - n * UNIT_GAP_M) / 2, MIN_CORNER_M, CORNER_MARGIN_M);
  const usable = Math.max(0, length - margin * 2);
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
  // mesa, rack: uno al lado del otro, en filas que no se salen de la sala.
  const fx = dims.widthM / 2 - WALL_INSET_M;
  const fz = dims.depthM / 2 - WALL_INSET_M;
  const perRow = Math.max(1, Math.floor((fx * 2) / SIDE_BY_SIDE_M) + 1);
  const rowDir = anchor.z > 0 ? -1 : 1; // las filas siguientes, hacia el centro
  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, n - row * perRow);
    const half = ((inRow - 1) / 2) * SIDE_BY_SIDE_M;
    const cx = clamp(anchor.x, -fx + half, fx - half);
    return {
      ...anchor,
      x: r2(clamp(cx + ((i % perRow) - (inRow - 1) / 2) * SIDE_BY_SIDE_M, -fx, fx)),
      z: r2(clamp(anchor.z + rowDir * row * SIDE_BY_SIDE_M, -fz, fz)),
    };
  });
}

/** Separación mínima entre unidades de equipos distintos en la misma superficie (m). */
export const UNIT_GAP_M = 0.3;
const NUDGE_STEP_M = 0.1;
const NUDGE_MAX_STEPS = 20;

/** Corre una pose de techo/pared/piso al lugar libre más cercano sobre su superficie, dentro de la sala. */
function nudgeAway(pose: Pose, mount: Mount, others: Pose[], dims: RoomDims): Pose {
  const clear = (p: Pose) => others.every((o) => Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z) >= UNIT_GAP_M);
  if (!others.length || clear(pose)) return pose;
  const inside = (p: Pose) => !dims.floor || dims.floor.length < 3 || pointInPolygon({ x: p.x, y: p.z }, dims.floor);
  // Direcciones sobre la superficie: en la pared, a lo largo de ella; en techo y piso, en el plano.
  const r = (pose.rotY * Math.PI) / 180;
  const along = { x: Math.cos(r), z: -Math.sin(r) };
  const dirs =
    mount === "wall"
      ? [along, { x: -along.x, z: -along.z }]
      : [
          { x: 1, z: 0 },
          { x: -1, z: 0 },
          { x: 0, z: 1 },
          { x: 0, z: -1 },
          { x: Math.SQRT1_2, z: Math.SQRT1_2 },
          { x: -Math.SQRT1_2, z: Math.SQRT1_2 },
          { x: Math.SQRT1_2, z: -Math.SQRT1_2 },
          { x: -Math.SQRT1_2, z: -Math.SQRT1_2 },
        ];
  for (let k = 1; k <= NUDGE_MAX_STEPS; k++) {
    for (const d of dirs) {
      const p = clampPoseToRoom({ ...pose, x: pose.x + d.x * k * NUDGE_STEP_M, z: pose.z + d.z * k * NUDGE_STEP_M }, dims);
      if (clear(p) && inside(p)) return p;
    }
  }
  return pose;
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
export function normalizeDeviceUnits(
  device: SceneDevice,
  slot: Pick<RoomSlot, "mount" | "pose"> | undefined,
  dims: RoomDims,
  /** Unidades de otros equipos en la misma superficie: las libres se separan de ellas. */
  others: Pose[] = [],
): SceneDevice {
  const quantity = clamp(Math.round(device.quantity || 1), 1, MAX_UNITS);
  const prev = Array.isArray(device.units) ? device.units : [];
  const placed = prev.filter((u) => u.placed).slice(0, quantity).map((u) => ({ ...u, pose: clampPoseToRoom(u.pose, dims) }));
  const freeCount = quantity - placed.length;
  const anchor = slot?.pose ?? device.pose;
  const mount = slot?.mount ?? "wall";
  // El reparto propio ya es parejo: las libres solo se separan de los demás equipos y de las ubicadas a mano.
  const avoid = [...others, ...placed.map((u) => u.pose)];
  const freePoses = (freeCount > 0 ? distributeUnits(anchor, mount, freeCount, dims) : []).map((p) => {
    const fitted = fitPoseToFloor(p, mount, dims.floor);
    return SHARED_SURFACE.has(mount) ? nudgeAway(fitted, mount, avoid, dims) : fitted;
  });
  const ids = freeIds(device.slotKey, freePoses.length, new Set(placed.map((u) => u.id)), prev.filter((u) => !u.placed).map((u) => u.id));
  const free = freePoses.map((pose, i) => ({ id: ids[i], pose }));
  const units = [...placed, ...free];
  return { ...device, quantity, units, pose: units[0]?.pose ?? device.pose };
}

/** Medidas de la escena, con la forma real del piso si viene de un plano. */
export function sceneDims(scene: Pick<RoomScene, "widthM" | "depthM" | "heightM" | "plan">): RoomDims {
  const floor = scene.plan?.enabled && scene.plan.floorPolygon.length >= 3 ? scene.plan.floorPolygon : null;
  return { widthM: scene.widthM, depthM: scene.depthM, heightM: scene.heightM, floor };
}

/** Distancia mínima de un equipo a la pared real cuando se lo mete adentro. */
const FLOOR_INSET_M = 0.3;

/**
 * Lleva una pose a la forma real del ambiente (L, ochava): lo de pared se pega
 * a la pared real más cercana mirando hacia adentro; lo demás, si quedó
 * afuera, se mete adentro. Sin forma (rectángulo) no cambia nada.
 */
export function fitPoseToFloor(pose: Pose, mount: Mount, floor: RoomDims["floor"]): Pose {
  if (!floor || floor.length < 3) return pose;
  const p = { x: pose.x, y: pose.z };
  const inside = pointInPolygon(p, floor);
  // Punto más cercano sobre el contorno y la normal hacia adentro.
  let best = { d: Infinity, x: 0, y: 0, nx: 0, ny: 0 };
  for (let i = 0; i < floor.length; i++) {
    const a = floor[i]!;
    const b = floor[(i + 1) % floor.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len2 = ex * ex + ey * ey || 1;
    const t = clamp(((p.x - a.x) * ex + (p.y - a.y) * ey) / len2, 0, 1);
    const qx = a.x + t * ex;
    const qy = a.y + t * ey;
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (d >= best.d) continue;
    const len = Math.sqrt(len2);
    let nx = -ey / len;
    let ny = ex / len;
    // Normal hacia adentro: probar un paso y ver si cae dentro.
    if (!pointInPolygon({ x: qx + nx * 0.05, y: qy + ny * 0.05 }, floor)) {
      nx = -nx;
      ny = -ny;
    }
    best = { d, x: qx, y: qy, nx, ny };
  }
  if (mount === "wall") {
    if (inside && best.d <= WALL_INSET_M + 0.15) return pose;
    const rotY = Math.round((Math.atan2(best.nx, best.ny) * 180) / Math.PI);
    return { ...pose, x: r2(best.x + best.nx * WALL_INSET_M), z: r2(best.y + best.ny * WALL_INSET_M), rotY };
  }
  if (inside) return pose;
  return { ...pose, x: r2(best.x + best.nx * FLOOR_INSET_M), z: r2(best.y + best.ny * FLOOR_INSET_M) };
}

/** Superficies compartidas por varios equipos (mesa y rack se apilan/alinean aparte). */
const SHARED_SURFACE = new Set<Mount>(["wall", "ceiling", "floor"]);

/**
 * Reparte las unidades de toda la escena en orden: cada equipo conoce lo que
 * ya ocupan los anteriores en su superficie, así nunca se enciman.
 * Devuelve, por id de equipo, las unidades ajenas que tiene que evitar y el equipo normalizado.
 */
export function layoutSceneDevices(
  devices: SceneDevice[],
  slots: Map<string, Pick<RoomSlot, "mount" | "pose">>,
  dims: RoomDims,
): Array<{ device: SceneDevice; others: Pose[] }> {
  const byMount = new Map<Mount, Pose[]>();
  return devices.map((d) => {
    const slot = slots.get(d.slotKey);
    const mount = slot?.mount ?? "wall";
    const others = [...(byMount.get(mount) ?? [])];
    const device = normalizeDeviceUnits(d, slot, dims, others);
    byMount.set(mount, [...others, ...(device.units ?? []).map((u) => u.pose)]);
    return { device, others };
  });
}

/** Aplica normalizeDeviceUnits a toda la escena. */
export function normalizeSceneUnits(scene: RoomScene): RoomScene {
  const dims = sceneDims(scene);
  const slots = new Map(scene.slots.map((s) => [s.key, s]));
  return { ...scene, devices: layoutSceneDevices(scene.devices, slots, dims).map((l) => l.device) };
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
