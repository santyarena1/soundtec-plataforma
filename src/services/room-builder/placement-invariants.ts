/**
 * Reglas de ubicación 3D que una sala nunca puede romper: cada equipo en su
 * superficie (pared, cielorraso, mesa, rack, piso), dentro de la sala,
 * mirando hacia adentro, sin encimarse con otro equipo ni con los muebles.
 */

import { resolveSceneFurniture } from "./furnishing";
import { overlaps } from "./furniture-fit";
import { pointInPolygon } from "./plan-polygon";
import type { RoomScene } from "./scene";
import { layoutSceneDevices, sceneDims } from "./units";

export type PlacementViolation = { rule: string; detail: string };

/** Distancia máxima de un equipo de pared a la pared (m). */
const WALL_TOL = 0.16;
/** Separación mínima entre unidades montadas en la misma superficie (m). */
const MIN_GAP = 0.25;
const TABLE_KINDS = new Set(["conference-table", "round-table", "desk", "reception-desk", "kitchen-counter", "bar-counter", "coffee-table"]);
const SOLID_KINDS_SKIP = new Set(["rug", "side-chair", "chair", "bar-stool"]);

type Unit = { label: string; mount: string; x: number; y: number; z: number; rotY: number };

function floorOf(scene: RoomScene) {
  return scene.plan?.enabled && scene.plan.floorPolygon.length >= 3
    ? scene.plan.floorPolygon
    : [
        { x: -scene.widthM / 2, y: -scene.depthM / 2 },
        { x: scene.widthM / 2, y: -scene.depthM / 2 },
        { x: scene.widthM / 2, y: scene.depthM / 2 },
        { x: -scene.widthM / 2, y: scene.depthM / 2 },
      ];
}

/** Distancia de un punto al borde del polígono (y la normal hacia adentro del lado más cercano). */
function edgeDistance(p: { x: number; y: number }, poly: Array<{ x: number; y: number }>) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
}

export function auditPlacement(scene: RoomScene, category: string): PlacementViolation[] {
  const v: PlacementViolation[] = [];
  const dims = sceneDims(scene);
  const floor = floorOf(scene);
  const slots = new Map(scene.slots.map((s) => [s.key, s]));
  const H = scene.heightM;
  const units: Unit[] = [];
  for (const { device: d } of layoutSceneDevices(scene.devices, slots, dims)) {
    const slot = slots.get(d.slotKey);
    const mount = slot?.mount ?? "rack";
    for (const u of d.units ?? []) units.push({ label: `${d.label} (${d.slotKey})`, mount, x: u.pose.x, y: u.pose.y, z: u.pose.z, rotY: u.pose.rotY });
  }

  const inside = (x: number, z: number, tol = 0.02) => pointInPolygon({ x, y: z }, floor) || edgeDistance({ x, y: z }, floor) <= tol;
  for (const u of units) {
    if (!inside(u.x, u.z)) v.push({ rule: "equipo-fuera-de-la-sala", detail: `${u.label} (${u.x}, ${u.z})` });
    if (u.y < -0.01 || u.y > H + 0.01) v.push({ rule: "equipo-fuera-de-altura", detail: `${u.label} y=${u.y} (alto ${H})` });
    if (u.mount === "ceiling" && u.y < H - 0.2) v.push({ rule: "techo-bajo", detail: `${u.label} y=${u.y}` });
    if (u.mount === "wall") {
      const d = edgeDistance({ x: u.x, y: u.z }, floor);
      if (d > WALL_TOL) v.push({ rule: "pared-despegado", detail: `${u.label} a ${d.toFixed(2)} m de la pared` });
      if (u.y < 0.2 || u.y > H - 0.05) v.push({ rule: "pared-altura", detail: `${u.label} y=${u.y}` });
      // Mira hacia adentro: un paso hacia su frente queda dentro de la sala.
      const r = (u.rotY * Math.PI) / 180;
      const fx = u.x + Math.sin(r) * 0.5;
      const fz = u.z + Math.cos(r) * 0.5;
      if (!pointInPolygon({ x: fx, y: fz }, floor)) v.push({ rule: "pared-mirando-afuera", detail: `${u.label} rotY=${u.rotY}` });
    }
    if (u.mount === "table" && (u.y < 0.4 || u.y > 1.2)) v.push({ rule: "mesa-altura", detail: `${u.label} y=${u.y}` });
    if (u.mount === "floor" && u.y > 0.6) v.push({ rule: "piso-altura", detail: `${u.label} y=${u.y}` });
  }
  // Sin encimarse en la misma superficie.
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i]!;
      const b = units[j]!;
      if (a.mount !== b.mount || a.mount === "rack" || a.mount === "table") continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (d < MIN_GAP) v.push({ rule: "equipos-encimados", detail: `${a.label} y ${b.label} a ${d.toFixed(2)} m` });
    }
  }

  // Muebles: dentro de la sala y sin pisarse.
  const furniture = resolveSceneFurniture(scene, category).filter((f) => !f.hiddenBy && f.mount === "floor");
  const corners = (f: (typeof furniture)[number]) => {
    const w = f.w ?? 0.6;
    const d = f.d ?? 0.6;
    const c = Math.cos(f.rotY);
    const s = Math.sin(f.rotY);
    return [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ].map(([lx, lz]) => ({ x: f.x + lx! * c + lz! * s, z: f.z - lx! * s + lz! * c }));
  };
  for (const f of furniture) {
    const out = corners(f).filter((p) => !inside(p.x, p.z, 0.08));
    if (out.length) v.push({ rule: "mueble-fuera-de-la-sala", detail: `${f.kind} ${f.id}` });
  }
  const solids = furniture.filter((f) => !SOLID_KINDS_SKIP.has(f.kind));
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i]!;
      const b = solids[j]!;
      // Rectángulos girados exactos (separación de ejes), con 3 cm de contacto.
      const pa = corners(a).map((p) => ({ x: p.x, y: p.z }));
      const pb = corners(b).map((p) => ({ x: p.x, y: p.z }));
      if (overlaps(pa, pb) && !(TABLE_KINDS.has(a.kind) && TABLE_KINDS.has(b.kind))) v.push({ rule: "muebles-encimados", detail: `${a.kind} ${a.id} y ${b.kind} ${b.id}` });
    }
  }
  return v;
}
