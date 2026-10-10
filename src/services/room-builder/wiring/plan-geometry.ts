/**
 * Geometría del plano técnico: paredes con sus aberturas (las mismas que
 * dibuja el 3D), cotas de cada muro y contorno de los muebles.
 */

import { footprint, occupiesFloor } from "../furniture-fit";
import { resolveSceneFurniture } from "../furnishing";
import type { RoomScene } from "../scene";

type Pt = { x: number; y: number };

export type PlanOpeningDraw = { kind: "door" | "window"; from: number; to: number };
export type PlanWallDraw = { a: Pt; b: Pt; lengthM: number; openings: PlanOpeningDraw[] };
export type PlanFurnitureDraw = { id: string; kind: string; outline: Pt[]; layer: boolean };

/** Ancho de la puerta de la sala rectangular (igual que el 3D). */
const RECT_DOOR_W = 1.02;

/** Contorno del piso: el del plano o el rectángulo de la sala. */
export function floorOf(scene: RoomScene): Pt[] {
  if (scene.plan?.enabled && scene.plan.floorPolygon.length >= 3) return scene.plan.floorPolygon;
  const w = scene.widthM / 2;
  const d = scene.depthM / 2;
  return [
    { x: -w, y: -d },
    { x: w, y: -d },
    { x: w, y: d },
    { x: -w, y: d },
  ];
}

/** Paredes con puertas y ventanas: las del plano o, en sala rectangular, puerta al fondo y ventanas laterales. */
export function planWalls(scene: RoomScene, category: string): PlanWallDraw[] {
  const len = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
  if (scene.plan?.enabled && scene.plan.walls.length) {
    const openings = scene.plan.openings ?? [];
    return scene.plan.walls.map((w) => ({ a: w.a, b: w.b, lengthM: len(w.a, w.b), openings: openings.filter((o) => o.wall === w.id).map((o) => ({ kind: o.kind, from: o.from, to: o.to })) }));
  }
  const floor = floorOf(scene);
  const { widthM: w, depthM: d } = scene;
  const walls = floor.map((a, i) => ({ a, b: floor[(i + 1) % floor.length]!, lengthM: len(a, floor[(i + 1) % floor.length]!), openings: [] as PlanOpeningDraw[] }));
  const doorAt = -w * 0.28 + w / 2;
  walls[0]!.openings.push({ kind: "door", from: doorAt - RECT_DOOR_W / 2, to: doorAt + RECT_DOOR_W / 2 });
  if (category !== "control-room" && category !== "event") {
    const winW = Math.min(d * 0.45, 2.2);
    const right = -d * 0.12 + d / 2;
    const left = d / 2 + d * 0.12;
    walls[1]!.openings.push({ kind: "window", from: right - winW / 2, to: right + winW / 2 });
    walls[3]!.openings.push({ kind: "window", from: left - winW / 2, to: left + winW / 2 });
  }
  return walls;
}

/** Muebles visibles como contorno en planta. */
export function planFurniture(scene: RoomScene, category: string): PlanFurnitureDraw[] {
  return resolveSceneFurniture(scene, category)
    .filter((f) => !f.hiddenBy && f.mount === "floor")
    .map((f) => ({ id: f.id, kind: f.kind, outline: footprint(f), layer: !occupiesFloor(f) }));
}
