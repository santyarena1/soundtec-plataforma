/**
 * Muebles y objetos de la sala como datos.
 *
 * Cada tipología genera su amoblamiento según las medidas (ids estables:
 * "whiteboard", "desk-r0c1"…). Lo que el usuario cambia se guarda aparte
 * (`scene.furniture`: quitados y movidos), así sobrevive a cambios de
 * medidas. Una pantalla puesta sobre el pizarrón lo oculta sola.
 */

import type { RoomScene } from "./scene";
import { hotelGuestAnchors } from "./slot-layout";
import { pointInPolygon } from "./plan-polygon";
import { layoutSceneDevices, sceneDims } from "./units";
import { fitFurnitureToRoom } from "./furniture-fit";
import { anchorToWalls } from "./wall-anchor";
import { decorateRoom, seatSideOf, type DecorWall } from "./decor";

export type FurnitureKind =
  | "conference-table"
  | "desk"
  | "chair"
  | "side-chair"
  | "credenza"
  | "whiteboard"
  | "lectern"
  | "sofa"
  | "lounge-chair"
  | "coffee-table"
  | "media-console"
  | "planter"
  | "bed"
  | "nightstand"
  | "wardrobe"
  | "round-table"
  | "bar-counter"
  | "bar-stool"
  | "reception-desk"
  | "stage"
  | "backdrop"
  | "rack"
  | "control-console"
  | "bench"
  | "umbrella"
  | "av-panel"
  | "video-wall"
  | "signage-totem"
  | "signage-panel"
  | "acoustic-panel"
  | "pendant-lamp"
  | "shelving"
  | "riser"
  | "kitchen-counter"
  | "toilet"
  | "vanity"
  | "shower"
  | "bathtub"
  | "rug"
  | "planter-box"
  | "indoor-tree"
  | "bench-seat"
  | "side-table"
  | "ottoman"
  | "wall-art"
  | "floor-lamp";

export type FurnitureItem = {
  id: string;
  kind: FurnitureKind;
  /** Nombre del grupo en la lista ("Pupitres", "Sillas"…). */
  group: string;
  x: number;
  z: number;
  /** Altura del centro (objetos de pared). */
  y?: number;
  /** Radianes. */
  rotY: number;
  mount: "floor" | "wall";
  w?: number;
  d?: number;
  h?: number;
  color?: string;
  scale?: number;
  tall?: boolean;
  /** Mueble reconocido en el plano: el modelo se escala para llenar su contorno dibujado (w × d). */
  fit?: boolean;
  /** Forma real dibujada (m, relativa al centro del mueble, sin girar): sillones en L, barras en trapecio. */
  shape?: Array<{ x: number; y: number }>;
  /** Lados del contorno donde va el respaldo (sillones). */
  backEdges?: number[];
  /** Variante de estilo estable (maceta, tela, especie de planta). */
  variant?: number;
  /** Escritorios y mesas: lado (z local, +1/−1) donde se sienta la persona (orienta notebook y monitor). */
  seat?: 1 | -1;
};

export type FurnitureOverrides = {
  removed?: string[];
  moved?: Record<string, { x: number; z: number; rotY: number; y?: number }>;
};

export type RoomDims = { widthM: number; depthM: number; heightM: number };

/** Lo que muestra la lista: item resuelto + por qué no se ve. */
/** hiddenBy: lo sacó el usuario, lo tapa una pantalla, o no entra en la sala. */
export type ResolvedFurniture = FurnitureItem & { hiddenBy: "user" | "display" | "space" | null };

const PI = Math.PI;
const COLOR = {
  woodLight: "#efdcc0",
  woodDark: "#86624a",
  student: "#4a5b6b",
  warm: "#c9b49b",
  pool: "#7f9a8c",
  sofa: "#e6ddd0",
  slate: "#a7aca8",
  console: "#2a2c30",
} as const;

function chairsAroundTable(tableW: number, tableD: number, count: number) {
  const items: Array<{ x: number; z: number; rotY: number }> = [];
  const sideN = Math.floor(Math.max(2, Math.floor(count / 2)) / 2);
  for (let i = 0; i < sideN; i++) {
    const t = sideN === 1 ? 0 : (i / (sideN - 1) - 0.5) * (tableW - 0.6);
    items.push({ x: t, z: tableD / 2 + 0.45, rotY: PI });
    items.push({ x: t, z: -(tableD / 2 + 0.45), rotY: 0 });
  }
  items.push({ x: -(tableW / 2 + 0.45), z: 0, rotY: PI / 2 });
  items.push({ x: tableW / 2 + 0.45, z: 0, rotY: -PI / 2 });
  return items.slice(0, count);
}

/** Silla (0,45 desde el borde) + respaldo + paso, de la mesa a la pared (m). */
const TABLE_CLEARANCE_M = 1.1;
/** Fondo que ocupa un aparador contra la pared (m). */
const CREDENZA_BACK_M = 0.48;
/** Silla y paso detrás de ella, desde el borde de la mesa (m). */
const CHAIR_BEHIND_TABLE_M = 1.05;

function videoconference({ widthM, depthM }: RoomDims, size: "S" | "M" | "L"): FurnitureItem[] {
  // La mesa se achica si la sala no da: siempre queda lugar para sillas y paso alrededor.
  const tableW = Math.min(size === "S" ? 1.6 : size === "M" ? 2.6 : 3.8, Math.max(1.2, widthM - TABLE_CLEARANCE_M * 2));
  const tableD = Math.min(size === "S" ? 0.9 : size === "M" ? 1.2 : 1.45, Math.max(0.8, depthM - TABLE_CLEARANCE_M * 2));
  const nChairs = size === "S" ? 4 : size === "M" ? 8 : 12;
  return [
    { id: "table", kind: "conference-table", group: "Mesa de reunión", x: 0, z: 0, rotY: 0, mount: "floor", w: tableW, d: tableD },
    ...chairsAroundTable(tableW, tableD, nChairs).map((c, i): FurnitureItem => ({ id: `chair-${i}`, kind: "chair", group: "Sillas", x: c.x, z: c.z, rotY: c.rotY, mount: "floor" })),
    // Aparadores al fondo solo si queda paso detrás de las sillas.
    ...(depthM / 2 - CREDENZA_BACK_M >= tableD / 2 + CHAIR_BEHIND_TABLE_M
      ? ([
          { id: "credenza-l", kind: "credenza", group: "Aparadores", x: -widthM * 0.28, z: -depthM / 2 + 0.25, rotY: 0, mount: "floor", w: Math.min(widthM * 0.45, 1.8) },
          { id: "credenza-r", kind: "credenza", group: "Aparadores", x: widthM * 0.3, z: -depthM / 2 + 0.25, rotY: 0, mount: "floor", w: Math.min(widthM * 0.35, 1.4) },
        ] satisfies FurnitureItem[])
      : []),
    { id: "av-panel", kind: "av-panel", group: "Panel de pared AV", x: 0, y: 1.35, z: depthM / 2 - 0.06, rotY: PI, mount: "wall", w: Math.min(widthM * 0.7, 3.2), h: 1.4 },
  ];
}

/** Aula: escritorio docente a esta distancia del pizarrón, pasillo hasta los alumnos y fondo libre (m). */
const TEACHER_FROM_FRONT_M = 1.0;
const FRONT_AISLE_M = 0.9;
const BACK_CLEAR_M = 0.9;
/** Pupitre (0,45) + silla + 25 cm para correrla. */
const STUDENT_ROW_MIN_M = 1.12;
const STUDENT_ROW_MAX_M = 1.25;

function classroom({ widthM, depthM }: RoomDims): FurnitureItem[] {
  const cols = Math.max(3, Math.floor(widthM / 1.1));
  const teacherZ = depthM / 2 - TEACHER_FROM_FRONT_M;
  // Filas de alumnos detrás del pasillo del frente; las que entren (hasta 4).
  const firstZ = -depthM / 2 + BACK_CLEAR_M;
  const lastZ = teacherZ - 0.35 - FRONT_AISLE_M - 0.225;
  const rows = Math.max(1, Math.min(4, Math.floor((lastZ - firstZ) / STUDENT_ROW_MIN_M) + 1));
  const rowGap = rows > 1 ? Math.min(STUDENT_ROW_MAX_M, (lastZ - firstZ) / (rows - 1)) : 0;
  const startZ = lastZ - rowGap * (rows - 1);
  const items: FurnitureItem[] = [
    { id: "whiteboard", kind: "whiteboard", group: "Pizarrón", x: 0, y: 1.5, z: depthM / 2 - 0.08, rotY: PI, mount: "wall", w: Math.min(widthM * 0.55, 3.2), h: 1.2 },
    { id: "lectern", kind: "lectern", group: "Atril", x: -widthM * 0.28, z: teacherZ, rotY: PI, mount: "floor" },
    { id: "teacher-desk", kind: "desk", group: "Escritorio docente", x: widthM * 0.15, z: teacherZ, rotY: 0, mount: "floor", w: 1.4, d: 0.7, color: COLOR.woodDark },
  ];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = (col - (cols - 1) / 2) * 0.95;
      const z = startZ + row * rowGap;
      items.push({ id: `desk-r${row}c${col}`, kind: "desk", group: "Pupitres", x, z, rotY: 0, mount: "floor", w: 0.7, d: 0.45, color: COLOR.woodLight });
      items.push({ id: `seat-r${row}c${col}`, kind: "side-chair", group: "Sillas de alumnos", x, z: z - 0.4, rotY: 0, mount: "floor" });
    }
  }
  return items;
}

/** Capacitación en U: paso de cada puesto, silla + paso detrás, y zona del instructor al frente (m). */
const U_PITCH_M = 0.9;
const U_BEHIND_M = 1.15;
const TRAINER_ZONE_M = 2.4;

function training({ widthM, depthM }: RoomDims): FurnitureItem[] {
  // U abierta hacia el pizarrón: base contra el fondo, brazos a los costados; cada uno sentado afuera mirando al centro.
  const seats: Array<{ x: number; z: number; rotY: number }> = [];
  const armX = widthM / 2 - U_BEHIND_M;
  const baseZ = -depthM / 2 + U_BEHIND_M;
  const armEnd = depthM / 2 - TRAINER_ZONE_M;
  for (let z = baseZ + U_PITCH_M; z <= armEnd; z += U_PITCH_M) {
    seats.push({ x: -armX, z, rotY: PI / 2 });
    seats.push({ x: armX, z, rotY: -PI / 2 });
  }
  const across = Math.max(1, Math.floor((armX * 2 - U_PITCH_M) / U_PITCH_M));
  for (let i = 0; i < across; i++) seats.push({ x: (i - (across - 1) / 2) * U_PITCH_M, z: baseZ, rotY: 0 });
  const trainerZ = depthM / 2 - 1.1;
  return [
    { id: "whiteboard", kind: "whiteboard", group: "Pizarrón", x: 0, y: 1.55, z: depthM / 2 - 0.08, rotY: PI, mount: "wall", w: Math.min(widthM * 0.5, 2.8), h: 1.1 },
    { id: "lectern", kind: "lectern", group: "Atril", x: -Math.min(widthM * 0.25, armX - 0.6), z: trainerZ, rotY: PI, mount: "floor" },
    { id: "trainer-desk", kind: "desk", group: "Escritorio del instructor", x: Math.min(0.6, armX * 0.3), z: trainerZ, rotY: 0, mount: "floor", w: Math.min(1.6, armX), d: 0.7 },
    // Cada participante del lado de afuera de la U, mirando al centro; el puesto girado hacia su silla.
    ...seats.flatMap((s, i): FurnitureItem[] => [
      { id: `desk-${i}`, kind: "desk", group: "Puestos", x: s.x, z: s.z, rotY: s.rotY, mount: "floor", w: 0.65, d: 0.4, color: COLOR.woodLight },
      { id: `seat-${i}`, kind: "chair", group: "Sillas", x: s.x - Math.sin(s.rotY) * 0.4, z: s.z - Math.cos(s.rotY) * 0.4, rotY: s.rotY, mount: "floor", color: COLOR.student },
    ]),
  ];
}

function hotelGuest(dims: RoomDims): FurnitureItem[] {
  const { widthM, depthM } = dims;
  const g = hotelGuestAnchors(dims);
  return [
    { id: "bed", kind: "bed", group: "Cama", x: 0, z: g.bedZ, rotY: 0, mount: "floor", w: g.bedW, d: g.bedD },
    { id: "nightstand-l", kind: "nightstand", group: "Mesas de luz", x: -g.nightstandX, z: g.nightstandZ, rotY: 0, mount: "floor" },
    { id: "nightstand-r", kind: "nightstand", group: "Mesas de luz", x: g.nightstandX, z: g.nightstandZ, rotY: 0, mount: "floor" },
    { id: "media-console", kind: "media-console", group: "Mueble de TV", x: 0, z: g.frontZ - 0.27, rotY: PI, mount: "floor", w: Math.min(widthM * 0.55, 1.6) },
    { id: "desk", kind: "desk", group: "Escritorio", x: g.deskX, z: g.deskZ, rotY: 0, mount: "floor", w: g.deskW, d: 0.5, color: COLOR.woodDark },
    { id: "desk-chair", kind: "side-chair", group: "Silla", x: g.deskX, z: g.deskZ + 0.5, rotY: PI, mount: "floor", color: COLOR.warm },
    { id: "wardrobe", kind: "wardrobe", group: "Placard", x: g.wardrobeX, z: g.wardrobeZ, rotY: 0, mount: "floor" },
    { id: "planter", kind: "planter", group: "Plantas", x: widthM / 2 - 0.4, z: depthM / 2 - 0.9, rotY: 0, mount: "floor", scale: 0.85 },
  ];
}

function hotelSuite({ widthM, depthM }: RoomDims): FurnitureItem[] {
  return [
    { id: "sofa", kind: "sofa", group: "Sillón", x: -widthM * 0.15, z: depthM * 0.05, rotY: 0, mount: "floor", w: Math.min(widthM * 0.45, 2.2) },
    { id: "coffee-table", kind: "coffee-table", group: "Mesa ratona", x: -widthM * 0.15, z: depthM * 0.05 + 1.03, rotY: 0, mount: "floor" },
    { id: "lounge", kind: "lounge-chair", group: "Butaca", x: widthM * 0.25, z: depthM * 0.2, rotY: -0.8, mount: "floor" },
    { id: "media-console", kind: "media-console", group: "Mueble de TV", x: 0, z: depthM / 2 - 0.35, rotY: PI, mount: "floor", w: Math.min(widthM * 0.5, 1.8) },
    { id: "bed", kind: "bed", group: "Cama", x: widthM * 0.15, z: -depthM * 0.28, rotY: 0, mount: "floor", w: Math.min(widthM * 0.45, 1.7), d: Math.min(depthM * 0.28, 1.9) },
    { id: "nightstand", kind: "nightstand", group: "Mesa de luz", x: widthM * 0.15 - 1.05, z: -depthM * 0.22, rotY: 0, mount: "floor" },
    { id: "desk", kind: "desk", group: "Escritorio", x: -widthM / 2 + 0.7, z: -depthM / 2 + 0.6, rotY: 0, mount: "floor", w: 1, d: 0.45 },
    { id: "planter", kind: "planter", group: "Plantas", x: widthM / 2 - 0.45, z: 0, rotY: 0, mount: "floor" },
  ];
}

function poolBar({ widthM, depthM }: RoomDims): FurnitureItem[] {
  const stools = Math.max(4, Math.floor(widthM / 0.7));
  const tables: Array<[number, number]> = [
    [-widthM * 0.28, -depthM * 0.28],
    [widthM * 0.28, -depthM * 0.28],
  ];
  return [
    { id: "bar", kind: "bar-counter", group: "Barra", x: 0, z: depthM * 0.15, rotY: 0, mount: "floor", w: Math.min(widthM * 0.7, 4) },
    ...Array.from({ length: stools }, (_, i): FurnitureItem => ({ id: `stool-${i}`, kind: "bar-stool", group: "Banquetas", x: (i - (stools - 1) / 2) * 0.65, z: depthM * 0.15 - 0.75, rotY: 0, mount: "floor" })),
    ...tables.map(([x, z], i): FurnitureItem => ({ id: `table-${i}`, kind: "round-table", group: "Mesas", x, z, rotY: 0, mount: "floor", w: 1.1, color: COLOR.woodLight })),
    ...tables.flatMap(([tx, tz], ti) =>
      [0, 1, 2].map((j): FurnitureItem => {
        const a = (j / 3) * PI * 2;
        // De frente a la mesa: su frente (+z local) apunta al centro.
        return { id: `chair-${ti}-${j}`, kind: "side-chair", group: "Sillas", x: tx + Math.cos(a) * 0.85, z: tz + Math.sin(a) * 0.85, rotY: Math.atan2(-Math.cos(a), -Math.sin(a)), mount: "floor", color: COLOR.pool };
      }),
    ),
    { id: "planter-l", kind: "planter", group: "Plantas", x: -widthM / 2 + 0.5, z: depthM / 2 - 0.5, rotY: 0, mount: "floor", scale: 1.2 },
    { id: "planter-r", kind: "planter", group: "Plantas", x: widthM / 2 - 0.5, z: depthM / 2 - 0.5, rotY: 0, mount: "floor", scale: 1.2 },
    { id: "umbrella", kind: "umbrella", group: "Sombrilla", x: widthM * 0.28, z: -depthM * 0.28, rotY: 0, mount: "floor" },
  ];
}

function hotelCommon({ widthM, depthM }: RoomDims): FurnitureItem[] {
  return [
    { id: "sofa-a", kind: "sofa", group: "Sillones", x: -widthM * 0.2, z: 0, rotY: 0.2, mount: "floor", w: 2 },
    { id: "sofa-b", kind: "sofa", group: "Sillones", x: widthM * 0.22, z: depthM * 0.15, rotY: -1.2, mount: "floor", w: 1.6, color: "#5c6b7a" },
    { id: "coffee-table", kind: "coffee-table", group: "Mesa ratona", x: 0, z: depthM * 0.05, rotY: 0, mount: "floor", w: 1.3, d: 0.7 },
    { id: "lounge-a", kind: "lounge-chair", group: "Butacas", x: -widthM * 0.3, z: depthM * 0.25, rotY: 0.9, mount: "floor" },
    { id: "lounge-b", kind: "lounge-chair", group: "Butacas", x: widthM * 0.32, z: -depthM * 0.1, rotY: -2.2, mount: "floor" },
    { id: "planter-a", kind: "planter", group: "Plantas", x: -widthM / 2 + 0.55, z: -depthM / 2 + 0.55, rotY: 0, mount: "floor", scale: 1.3 },
    { id: "planter-b", kind: "planter", group: "Plantas", x: widthM / 2 - 0.55, z: depthM / 2 - 0.55, rotY: 0, mount: "floor", scale: 1.1 },
    { id: "round-table", kind: "round-table", group: "Mesa", x: widthM * 0.05, z: -depthM * 0.28, rotY: 0, mount: "floor", w: 0.9 },
  ];
}

function lobby({ widthM, depthM }: RoomDims): FurnitureItem[] {
  return [
    { id: "reception", kind: "reception-desk", group: "Recepción", x: 0, z: depthM * 0.2, rotY: 0, mount: "floor", w: Math.min(widthM * 0.55, 3), d: 0.85 },
    { id: "lounge-a", kind: "lounge-chair", group: "Butacas", x: -widthM * 0.3, z: -depthM * 0.2, rotY: 0.4, mount: "floor" },
    { id: "lounge-b", kind: "lounge-chair", group: "Butacas", x: -widthM * 0.12, z: -depthM * 0.28, rotY: -0.2, mount: "floor" },
    { id: "coffee-table", kind: "coffee-table", group: "Mesa ratona", x: -widthM * 0.2, z: -depthM * 0.05, rotY: 0, mount: "floor", w: 0.9, d: 0.5 },
    { id: "sofa", kind: "sofa", group: "Sillón", x: widthM * 0.25, z: -depthM * 0.15, rotY: -0.5, mount: "floor", w: 1.8, color: COLOR.slate },
    { id: "planter-r", kind: "planter", group: "Plantas", x: widthM / 2 - 0.5, z: depthM / 2 - 0.6, rotY: 0, mount: "floor", scale: 1.4 },
    { id: "planter-l", kind: "planter", group: "Plantas", x: -widthM / 2 + 0.5, z: depthM / 2 - 0.6, rotY: 0, mount: "floor", scale: 1.4 },
    { id: "totem", kind: "signage-totem", group: "Tótem de cartelería", x: widthM / 2 - 0.25, z: depthM * 0.17, rotY: -PI / 2, mount: "floor" },
  ];
}

function event({ widthM, depthM }: RoomDims): FurnitureItem[] {
  const stageD = Math.min(depthM * 0.22, 2.2);
  const cols = Math.max(6, Math.floor(widthM / 0.7));
  const items: FurnitureItem[] = [
    { id: "stage", kind: "stage", group: "Escenario", x: 0, z: depthM / 2 - stageD / 2 - 0.1, rotY: 0, mount: "floor", w: Math.min(widthM * 0.85, 8), d: stageD, h: 0.55 },
    { id: "backdrop", kind: "backdrop", group: "Telón de fondo", x: 0, y: 1.8, z: depthM / 2 - 0.1, rotY: PI, mount: "wall", w: Math.min(widthM * 0.8, 7), h: 2.6 },
  ];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < cols; col++) {
      items.push({
        id: `seat-r${row}c${col}`,
        kind: "side-chair",
        group: "Sillas del público",
        x: (col - (cols - 1) / 2) * 0.65,
        z: -depthM * 0.35 + row * 0.75,
        rotY: 0,
        mount: "floor",
        color: row % 2 === 0 ? "#334155" : "#475569",
      });
    }
  }
  return items;
}

function residential({ widthM, depthM }: RoomDims): FurnitureItem[] {
  return [
    { id: "sofa-main", kind: "sofa", group: "Sillones", x: 0, z: -depthM * 0.15, rotY: 0, mount: "floor", w: Math.min(widthM * 0.55, 2.6), color: COLOR.sofa },
    { id: "sofa-side", kind: "sofa", group: "Sillones", x: -widthM * 0.28, z: depthM * 0.05, rotY: PI / 2, mount: "floor", w: 1.5, color: COLOR.sofa },
    { id: "coffee-table", kind: "coffee-table", group: "Mesa ratona", x: 0.1, z: depthM * 0.05, rotY: 0, mount: "floor", w: 1.2, d: 0.65 },
    { id: "media-console", kind: "media-console", group: "Mueble de TV", x: 0, z: depthM / 2 - 0.35, rotY: PI, mount: "floor", w: Math.min(widthM * 0.55, 2) },
    { id: "lounge", kind: "lounge-chair", group: "Butaca", x: widthM * 0.3, z: -depthM * 0.05, rotY: -0.9, mount: "floor" },
    { id: "planter", kind: "planter", group: "Plantas", x: -widthM / 2 + 0.45, z: depthM / 2 - 0.55, rotY: 0, mount: "floor" },
    { id: "credenza", kind: "credenza", group: "Aparador", x: widthM / 2 - 0.7, z: -depthM / 2 + 0.4, rotY: 0, mount: "floor", w: 1.2 },
  ];
}

function controlRoom({ widthM, depthM }: RoomDims): FurnitureItem[] {
  return [
    { id: "video-wall", kind: "video-wall", group: "Video wall", x: 0, y: 1.5, z: depthM / 2 - 0.1, rotY: PI, mount: "wall", w: Math.min(widthM * 0.85, 4.5), h: 1.8 },
    { id: "console", kind: "control-console", group: "Consola", x: 0, z: 0.1, rotY: 0, mount: "floor", w: Math.min(widthM * 0.7, 3.2) },
    { id: "chair-l", kind: "chair", group: "Sillas", x: -0.6, z: -0.55, rotY: 0, mount: "floor", color: COLOR.console },
    { id: "chair-r", kind: "chair", group: "Sillas", x: 0.6, z: -0.55, rotY: 0, mount: "floor", color: COLOR.console },
    { id: "rack-a", kind: "rack", group: "Racks", x: -widthM / 2 + 0.5, z: -depthM / 2 + 0.55, rotY: 0, mount: "floor", tall: true },
    { id: "rack-b", kind: "rack", group: "Racks", x: -widthM / 2 + 1.15, z: -depthM / 2 + 0.55, rotY: 0, mount: "floor", tall: false },
    { id: "rack-c", kind: "rack", group: "Racks", x: widthM / 2 - 0.5, z: -depthM / 2 + 0.55, rotY: 0, mount: "floor", tall: true },
  ];
}

function signageCorridor({ widthM, depthM }: RoomDims): FurnitureItem[] {
  const n = Math.max(2, Math.floor(depthM / 2.2));
  return [
    ...Array.from({ length: n }, (_, i): FurnitureItem => ({
      id: `panel-${i}`,
      kind: "signage-panel",
      group: "Paneles de cartelería",
      x: -widthM / 2 + 0.08,
      y: 1.5,
      z: -depthM / 2 + 1.2 + i * (depthM / n),
      rotY: PI / 2,
      mount: "wall",
      w: 0.7,
      h: 1.1,
    })),
    { id: "bench", kind: "bench", group: "Banco", x: widthM / 2 - 0.45, z: 0, rotY: 0, mount: "floor", d: Math.min(depthM * 0.5, 2.5) },
  ];
}

function bedroom({ widthM, depthM }: RoomDims): FurnitureItem[] {
  const bedW = Math.min(widthM * 0.5, 1.9);
  const bedD = Math.min(depthM * 0.45, 2.1);
  const bedZ = -depthM / 2 + bedD / 2 + 0.1;
  return [
    { id: "bed", kind: "bed", group: "Cama", x: 0, z: bedZ, rotY: 0, mount: "floor", w: bedW, d: bedD },
    { id: "nightstand-l", kind: "nightstand", group: "Mesas de luz", x: -bedW / 2 - 0.35, z: -depthM / 2 + 0.35, rotY: 0, mount: "floor" },
    { id: "nightstand-r", kind: "nightstand", group: "Mesas de luz", x: bedW / 2 + 0.35, z: -depthM / 2 + 0.35, rotY: 0, mount: "floor" },
    { id: "media-console", kind: "media-console", group: "Mueble de TV", x: 0, z: depthM / 2 - 0.3, rotY: PI, mount: "floor", w: Math.min(widthM * 0.5, 1.6) },
    { id: "wardrobe", kind: "wardrobe", group: "Placard", x: -widthM / 2 + 0.35, z: depthM * 0.15, rotY: PI / 2, mount: "floor" },
    { id: "lounge", kind: "lounge-chair", group: "Butaca", x: widthM / 2 - 0.6, z: depthM * 0.2, rotY: -2.2, mount: "floor" },
    { id: "planter", kind: "planter", group: "Plantas", x: widthM / 2 - 0.4, z: -depthM / 2 + 0.4, rotY: 0, mount: "floor", scale: 0.8 },
  ];
}

function cinema({ widthM, depthM, heightM }: RoomDims): FurnitureItem[] {
  const rowZ = [-depthM * 0.05, -depthM * 0.32];
  const seats = Math.max(3, Math.min(4, Math.floor(widthM / 0.95)));
  const items: FurnitureItem[] = [
    { id: "riser", kind: "riser", group: "Tarima", x: 0, z: rowZ[1], rotY: 0, mount: "floor", w: widthM - 0.4, d: 1.3, h: 0.3 },
    { id: "media-console", kind: "media-console", group: "Mueble técnico", x: 0, z: depthM / 2 - 0.3, rotY: PI, mount: "floor", w: Math.min(widthM * 0.5, 2) },
  ];
  rowZ.forEach((z, row) => {
    for (let i = 0; i < seats; i++) {
      items.push({ id: `seat-r${row}-${i}`, kind: "lounge-chair", group: "Butacas", x: (i - (seats - 1) / 2) * 0.95, y: row === 1 ? 0.3 : 0, z, rotY: 0, mount: "floor" });
    }
  });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      items.push({
        id: `panel-${side < 0 ? "l" : "r"}${i}`,
        kind: "acoustic-panel",
        group: "Paneles acústicos",
        x: side * (widthM / 2 - 0.06),
        y: Math.min(1.5, heightM / 2),
        z: depthM * 0.3 - i * (depthM * 0.28),
        rotY: side < 0 ? PI / 2 : -PI / 2,
        mount: "wall",
        w: 0.9,
        h: 1.4,
      });
    }
  }
  return items;
}

function outdoor({ widthM, depthM }: RoomDims): FurnitureItem[] {
  return [
    { id: "sofa", kind: "sofa", group: "Sillón de exterior", x: 0, z: depthM * 0.05, rotY: 0, mount: "floor", w: Math.min(widthM * 0.4, 2.4), color: "#9aa39a" },
    { id: "lounge-a", kind: "lounge-chair", group: "Reposeras", x: -widthM * 0.22, z: depthM * 0.25, rotY: 0.6, mount: "floor" },
    { id: "lounge-b", kind: "lounge-chair", group: "Reposeras", x: widthM * 0.22, z: depthM * 0.25, rotY: -0.6, mount: "floor" },
    { id: "coffee-table", kind: "coffee-table", group: "Mesa baja", x: 0, z: depthM * 0.25, rotY: 0, mount: "floor", w: 1.1, d: 0.6 },
    { id: "dining", kind: "round-table", group: "Mesa", x: -widthM * 0.28, z: -depthM * 0.25, rotY: 0, mount: "floor", w: 1.2, color: COLOR.woodLight },
    ...[0, 1, 2, 3].map((j): FurnitureItem => {
      const a = (j / 4) * PI * 2;
      return { id: `chair-${j}`, kind: "side-chair", group: "Sillas", x: -widthM * 0.28 + Math.cos(a) * 0.9, z: -depthM * 0.25 + Math.sin(a) * 0.9, rotY: Math.atan2(-Math.cos(a), -Math.sin(a)), mount: "floor", color: "#7c8b7a" };
    }),
    { id: "umbrella", kind: "umbrella", group: "Sombrilla", x: -widthM * 0.28, z: -depthM * 0.25, rotY: 0, mount: "floor" },
    { id: "planter-a", kind: "planter", group: "Plantas", x: widthM / 2 - 0.5, z: -depthM / 2 + 0.5, rotY: 0, mount: "floor", scale: 1.3 },
    { id: "planter-b", kind: "planter", group: "Plantas", x: -widthM / 2 + 0.5, z: depthM / 2 - 0.5, rotY: 0, mount: "floor", scale: 1.1 },
  ];
}

function dining({ widthM, depthM, heightM }: RoomDims): FurnitureItem[] {
  const tableW = Math.min(widthM * 0.4, 2.2);
  const tableX = -widthM * 0.12;
  const tableZ = -depthM * 0.07;
  const islandX = widthM * 0.12;
  const islandZ = depthM / 2 - 0.75;
  return [
    { id: "table", kind: "conference-table", group: "Mesa de comedor", x: tableX, z: tableZ, rotY: 0, mount: "floor", w: tableW, d: 0.95, color: "#8a6a4f" },
    ...chairsAroundTable(tableW, 0.95, 6).map((c, i): FurnitureItem => ({ id: `chair-${i}`, kind: "side-chair", group: "Sillas", x: tableX + c.x, z: tableZ + c.z, rotY: c.rotY, mount: "floor", color: COLOR.warm })),
    { id: "island", kind: "bar-counter", group: "Isla", x: islandX, z: islandZ, rotY: 0, mount: "floor", w: Math.min(widthM * 0.45, 2.6) },
    ...[0, 1, 2].map((i): FurnitureItem => ({ id: `stool-${i}`, kind: "bar-stool", group: "Banquetas", x: islandX + (i - 1) * 0.65, z: islandZ - 0.75, rotY: 0, mount: "floor" })),
    ...[-1, 1].map((s): FurnitureItem => ({ id: `pendant-${s < 0 ? "l" : "r"}`, kind: "pendant-lamp", group: "Lámparas colgantes", x: tableX + s * tableW * 0.25, y: heightM - 1.15, z: tableZ, rotY: 0, mount: "floor" })),
    { id: "credenza", kind: "credenza", group: "Aparador", x: -widthM * 0.2, z: -depthM / 2 + 0.3, rotY: 0, mount: "floor", w: 1.6 },
    { id: "planter", kind: "planter", group: "Plantas", x: -widthM / 2 + 0.45, z: depthM / 2 - 0.5, rotY: 0, mount: "floor" },
  ];
}

function restaurant({ widthM, depthM }: RoomDims): FurnitureItem[] {
  const barW = Math.min(widthM * 0.45, 5);
  const items: FurnitureItem[] = [
    { id: "bar", kind: "bar-counter", group: "Barra", x: widthM * 0.15, z: depthM / 2 - 0.9, rotY: PI, mount: "floor", w: barW },
  ];
  const stools = Math.max(4, Math.floor(barW / 0.65));
  for (let i = 0; i < stools; i++) {
    items.push({ id: `stool-${i}`, kind: "bar-stool", group: "Banquetas", x: widthM * 0.15 + (i - (stools - 1) / 2) * 0.65, z: depthM / 2 - 1.65, rotY: 0, mount: "floor" });
  }
  const cols = Math.max(2, Math.floor((widthM - 1.5) / 2.2));
  const rows = Math.max(2, Math.floor((depthM - 3) / 2.2));
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = (col - (cols - 1) / 2) * 2.2;
      const z = -depthM / 2 + 1.4 + row * 2.2;
      items.push({ id: `table-r${row}c${col}`, kind: "round-table", group: "Mesas", x, z, rotY: 0, mount: "floor", w: 0.9, color: COLOR.woodLight });
      [0, 1, 2, 3].forEach((j) => {
        const a = (j / 4) * PI * 2 + PI / 4;
        items.push({ id: `chair-r${row}c${col}-${j}`, kind: "side-chair", group: "Sillas", x: x + Math.cos(a) * 0.7, z: z + Math.sin(a) * 0.7, rotY: -a - PI / 2, mount: "floor", color: "#6b4f3a" });
      });
    }
  }
  items.push({ id: "planter-a", kind: "planter", group: "Plantas", x: -widthM / 2 + 0.5, z: depthM / 2 - 0.5, rotY: 0, mount: "floor", scale: 1.3 });
  items.push({ id: "planter-b", kind: "planter", group: "Plantas", x: widthM / 2 - 0.5, z: -depthM / 2 + 0.5, rotY: 0, mount: "floor", scale: 1.3 });
  return items;
}

function retail({ widthM, depthM }: RoomDims): FurnitureItem[] {
  const shelves = Math.max(2, Math.floor((depthM - 2) / 1.6));
  const items: FurnitureItem[] = [
    { id: "cashier", kind: "reception-desk", group: "Caja", x: widthM / 2 - 1.2, z: -depthM / 2 + 0.75, rotY: 0, mount: "floor", w: 1.8, d: 0.6 },
    { id: "display-a", kind: "desk", group: "Mesas de exhibición", x: -widthM * 0.12, z: depthM * 0.1, rotY: 0, mount: "floor", w: 1.6, d: 0.9, color: COLOR.woodLight },
    { id: "display-b", kind: "desk", group: "Mesas de exhibición", x: widthM * 0.15, z: -depthM * 0.1, rotY: 0, mount: "floor", w: 1.6, d: 0.9, color: COLOR.woodLight },
    { id: "planter", kind: "planter", group: "Plantas", x: -widthM / 2 + 0.5, z: depthM / 2 - 0.5, rotY: 0, mount: "floor", scale: 1.2 },
  ];
  for (let i = 0; i < shelves; i++) {
    const z = -depthM / 2 + 1 + i * 1.6;
    items.push({ id: `shelf-l${i}`, kind: "shelving", group: "Estanterías", x: -widthM / 2 + 0.22, z, rotY: PI / 2, mount: "floor", w: 1.4, d: 0.4 });
    items.push({ id: `shelf-r${i}`, kind: "shelving", group: "Estanterías", x: widthM / 2 - 0.22, z: z + 1.25, rotY: -PI / 2, mount: "floor", w: 1.4, d: 0.4 });
  }
  return items;
}

/** Aparador (0,46) + paso + silla (0,55) + medio escritorio (0,4), desde la pared del fondo (m). */
const OFFICE_DESK_FROM_BACK_M = 1.82;

function privateOffice({ widthM, depthM }: RoomDims): FurnitureItem[] {
  const deskZ = Math.max(-depthM * 0.15, -depthM / 2 + OFFICE_DESK_FROM_BACK_M);
  const deskX = -Math.min(0.25, widthM * 0.05);
  return [
    { id: "desk", kind: "desk", group: "Escritorio", x: deskX, z: deskZ, rotY: 0, mount: "floor", w: Math.min(widthM * 0.38, 1.6), d: 0.8, color: COLOR.woodDark },
    { id: "desk-chair", kind: "chair", group: "Silla", x: deskX, z: deskZ - 0.65, rotY: 0, mount: "floor", color: COLOR.console },
    { id: "guest-l", kind: "side-chair", group: "Sillas de visita", x: deskX - 0.4, z: deskZ + 0.85, rotY: PI, mount: "floor" },
    { id: "guest-r", kind: "side-chair", group: "Sillas de visita", x: deskX + 0.4, z: deskZ + 0.85, rotY: PI, mount: "floor" },
    { id: "credenza", kind: "credenza", group: "Aparador", x: 0, z: -depthM / 2 + 0.3, rotY: 0, mount: "floor", w: Math.min(widthM * 0.5, 1.6) },
    { id: "sofa", kind: "sofa", group: "Sillón", x: widthM / 2 - 0.55, z: depthM * 0.2, rotY: -PI / 2, mount: "floor", w: Math.min(depthM * 0.45, 1.8), color: COLOR.slate },
    { id: "planter", kind: "planter", group: "Plantas", x: -widthM / 2 + 0.4, z: depthM / 2 - 0.45, rotY: 0, mount: "floor" },
  ];
}

function openSpace({ widthM, depthM }: RoomDims): FurnitureItem[] {
  const items: FurnitureItem[] = [];
  const cols = Math.max(2, Math.floor((widthM - 1.5) / 1.4));
  const rows = Math.max(1, Math.floor((depthM - 2) / 3));
  for (let row = 0; row < rows; row++) {
    const z = -depthM / 2 + 1.6 + row * 3;
    for (let col = 0; col < cols; col++) {
      const x = (col - (cols - 1) / 2) * 1.4;
      items.push({ id: `desk-a-r${row}c${col}`, kind: "desk", group: "Puestos de trabajo", x, z: z - 0.4, rotY: 0, mount: "floor", w: 1.3, d: 0.7, color: COLOR.woodLight });
      items.push({ id: `desk-b-r${row}c${col}`, kind: "desk", group: "Puestos de trabajo", x, z: z + 0.4, rotY: 0, mount: "floor", w: 1.3, d: 0.7, color: COLOR.woodLight });
      items.push({ id: `chair-a-r${row}c${col}`, kind: "chair", group: "Sillas", x, z: z - 1.05, rotY: 0, mount: "floor", color: COLOR.console });
      items.push({ id: `chair-b-r${row}c${col}`, kind: "chair", group: "Sillas", x, z: z + 1.05, rotY: PI, mount: "floor", color: COLOR.console });
    }
  }
  items.push({ id: "planter-a", kind: "planter", group: "Plantas", x: -widthM / 2 + 0.5, z: -depthM / 2 + 0.5, rotY: 0, mount: "floor", scale: 1.2 });
  items.push({ id: "planter-b", kind: "planter", group: "Plantas", x: widthM / 2 - 0.5, z: depthM / 2 - 0.5, rotY: 0, mount: "floor", scale: 1.2 });
  return items;
}

/** Mesa de 1,2 + dos sillas (0,45 + 0,28) + paso entre mesas vecinas (m). */
const BREAKROOM_PITCH_M = 3.1;

function breakroom({ widthM, depthM }: RoomDims): FurnitureItem[] {
  const tables = Math.max(1, Math.min(3, Math.floor(widthM / BREAKROOM_PITCH_M)));
  const items: FurnitureItem[] = [
    { id: "counter", kind: "bar-counter", group: "Mesada", x: 0, z: -depthM / 2 + 0.45, rotY: PI, mount: "floor", w: Math.min(widthM * 0.7, 3.6) },
  ];
  for (let t = 0; t < tables; t++) {
    const x = (t - (tables - 1) / 2) * BREAKROOM_PITCH_M;
    items.push({ id: `table-${t}`, kind: "conference-table", group: "Mesas", x, z: depthM * 0.1, rotY: 0, mount: "floor", w: 1.2, d: 1.2, color: COLOR.woodLight });
    for (const [j, c] of chairsAroundTable(1.2, 1.2, 4).entries()) {
      items.push({ id: `chair-${t}-${j}`, kind: "side-chair", group: "Sillas", x: x + c.x, z: depthM * 0.1 + c.z, rotY: c.rotY, mount: "floor" });
    }
  }
  items.push({ id: "planter", kind: "planter", group: "Plantas", x: widthM / 2 - 0.45, z: depthM / 2 - 0.45, rotY: 0, mount: "floor" });
  return items;
}

function circulation({ widthM, depthM }: RoomDims): FurnitureItem[] {
  return [{ id: "planter", kind: "planter", group: "Plantas", x: widthM / 2 - 0.35, z: depthM / 2 - 0.4, rotY: 0, mount: "floor", scale: 0.9 }];
}

/** Amoblamiento de la tipología para estas medidas. */
export function layoutFurniture(templateKey: string, category: string, dims: RoomDims): FurnitureItem[] {
  if (templateKey.includes("huddle")) return videoconference(dims, "S");
  if (templateKey === "residential-bedroom-m") return bedroom(dims);
  if (templateKey === "residential-cinema-m") return cinema(dims);
  if (templateKey === "residential-outdoor-m") return outdoor(dims);
  if (templateKey === "residential-dining-m") return dining(dims);
  if (templateKey === "restaurant-m") return restaurant(dims);
  if (templateKey === "office-private-m") return privateOffice(dims);
  if (templateKey === "office-open-l") return openSpace(dims);
  if (templateKey === "breakroom-m") return breakroom(dims);
  if (templateKey === "circulation-m") return circulation(dims);
  if (templateKey === "restroom-s" || templateKey === "generic-room") return [];
  if (templateKey === "retail-store-m" || category === "commercial") return retail(dims);
  if (category === "videoconference") return videoconference(dims, templateKey.endsWith("-l") ? "L" : "M");
  if (templateKey === "classroom-m" || category === "classroom") return classroom(dims);
  if (templateKey === "training-l" || category === "training") return training(dims);
  if (templateKey === "hotel-suite-m") return hotelSuite(dims);
  if (templateKey === "hotel-pool-bar-m") return poolBar(dims);
  if (templateKey === "hotel-common-m") return hotelCommon(dims);
  if (category === "hotel") return hotelGuest(dims);
  if (templateKey === "lobby-m" || category === "lobby") return lobby(dims);
  if (templateKey === "event-banquet-l" || category === "event") return event(dims);
  if (templateKey === "residential-living-m" || category === "residential") return residential(dims);
  if (templateKey === "control-room-m" || category === "control-room") return controlRoom(dims);
  if (templateKey === "signage-corridor-s" || category === "signage") return signageCorridor(dims);
  return videoconference(dims, "M");
}

/** Objetos de pared que una pantalla puede reemplazar al ponerse encima. */
const REPLACEABLE_BY_DISPLAY = new Set<FurnitureKind>(["whiteboard", "av-panel", "signage-panel"]);
const DISPLAY_HALF_WIDTH_M = 0.6;
const SAME_WALL_M = 0.35;

export type DisplayPose = { x: number; y: number; z: number; rotY: number };

/** ¿La pantalla queda encima del objeto de pared (misma pared y se superponen)? */
export function displayCovers(item: FurnitureItem, display: DisplayPose): boolean {
  if (item.mount !== "wall" || !REPLACEABLE_BY_DISPLAY.has(item.kind)) return false;
  const facingX = Math.abs(Math.sin(item.rotY)) > 0.7;
  const across = facingX ? Math.abs(display.x - item.x) : Math.abs(display.z - item.z);
  if (across > SAME_WALL_M) return false;
  const along = facingX ? Math.abs(display.z - item.z) : Math.abs(display.x - item.x);
  const vertical = Math.abs(display.y - (item.y ?? 1.5));
  return along < (item.w ?? 1) / 2 + DISPLAY_HALF_WIDTH_M * 0.5 && vertical < (item.h ?? 1) / 2 + 0.4;
}

/** Amoblamiento final: plantilla + cambios del usuario + lo que tapan las pantallas. */
export function resolveFurniture(
  templateKey: string,
  category: string,
  dims: RoomDims,
  overrides: FurnitureOverrides | null | undefined,
  displays: DisplayPose[],
  /** Muebles reconocidos en el plano: reemplazan a los de la tipología. */
  base?: FurnitureItem[] | null,
): ResolvedFurniture[] {
  return (base?.length ? base : layoutFurniture(templateKey, category, dims)).map((item) => {
    const placed = applyOverride(item, overrides, dims);
    return placed.hiddenBy ? placed : { ...placed, hiddenBy: displays.some((d) => displayCovers(placed, d)) ? "display" : null };
  });
}

/** Cambios del usuario sobre un mueble: movido (dentro de la sala) o quitado. */
function applyOverride(item: FurnitureItem, overrides: FurnitureOverrides | null | undefined, dims: RoomDims): ResolvedFurniture {
  const m = overrides?.moved?.[item.id];
  const halfW = dims.widthM / 2;
  const halfD = dims.depthM / 2;
  const placed: FurnitureItem = m
    ? { ...item, x: Math.max(-halfW, Math.min(halfW, m.x)), z: Math.max(-halfD, Math.min(halfD, m.z)), rotY: m.rotY, y: m.y ?? item.y }
    : item;
  return { ...placed, hiddenBy: overrides?.removed?.includes(item.id) ? "user" : null };
}

/** Grupos para la lista "Muebles y objetos". */
export function furnitureGroups(items: ResolvedFurniture[]): Array<{ group: string; ids: string[]; visible: number; hiddenByDisplay: number }> {
  const map = new Map<string, { group: string; ids: string[]; visible: number; hiddenByDisplay: number }>();
  for (const it of items) {
    const g = map.get(it.group) ?? { group: it.group, ids: [], visible: 0, hiddenByDisplay: 0 };
    g.ids.push(it.id);
    if (!it.hiddenBy) g.visible += 1;
    if (it.hiddenBy === "display") g.hiddenByDisplay += 1;
    map.set(it.group, g);
  }
  return [...map.values()];
}

/** Muebles resueltos de una escena (usa las pantallas ya ubicadas). */
export function resolveSceneFurniture(scene: RoomScene, category: string): ResolvedFurniture[] {
  const dims = sceneDims(scene);
  const slots = new Map(scene.slots.map((s) => [s.key, s]));
  const laid = layoutSceneDevices(scene.devices, slots, dims);
  const displays = laid
    .filter((l) => l.device.designRole === "display")
    .flatMap((l) => l.device.units ?? [])
    .map((u) => u.pose);
  const items = resolveFurniture(scene.templateKey, category, dims, scene.furniture, displays, scene.planFurniture);
  const floor = dims.floor ?? rectFloor(dims);
  // Los muebles del plano son lo dibujado: se respetan tal cual. Los de la tipología se ajustan a la sala real.
  // Lo que va contra la pared se apoya en ella antes de ajustar el resto.
  const base = scene.planFurniture?.length
    ? items.filter((it) => pointInPolygon({ x: it.x, y: it.z }, floor))
    : fitFurnitureToRoom(anchorToWalls(items, floor) as ResolvedFurniture[], floor);
  const visible = base.filter((f) => !f.hiddenBy);
  const seated = base.map((f) => (SEATED_KINDS.has(f.kind) ? { ...f, seat: seatSideOf(f, visible, floor) } : f));
  const { walls, doors } = decorWalls(scene, category, dims, floor);
  const wallDevices = laid
    .filter((l) => (slots.get(l.device.slotKey)?.mount ?? "") === "wall")
    .flatMap((l) => l.device.units ?? [])
    .map((u) => ({ x: u.pose.x, y: u.pose.z }));
  const decor = scene.planFurniture?.length
    ? []
    : decorateRoom({ category, templateKey: scene.templateKey, floor, walls, items: seated, wallDevices }, doors).map((d) => applyOverride(d, scene.furniture, dims));
  return [...seated, ...decor];
}

const SEATED_KINDS = new Set<FurnitureKind>(["desk", "conference-table", "reception-desk"]);

function rectFloor(dims: RoomDims) {
  return [
    { x: -dims.widthM / 2, y: -dims.depthM / 2 },
    { x: dims.widthM / 2, y: -dims.depthM / 2 },
    { x: dims.widthM / 2, y: dims.depthM / 2 },
    { x: -dims.widthM / 2, y: dims.depthM / 2 },
  ];
}

/** Ancho de la puerta de la sala rectangular (igual que la dibuja el 3D). */
const RECT_DOOR_W = 1.02;

/**
 * Paredes con sus aberturas, igual que las dibuja el 3D: las del plano, o en
 * una sala rectangular la puerta del fondo y las ventanas laterales.
 */
function decorWalls(scene: RoomScene, category: string, dims: RoomDims, floor: Array<{ x: number; y: number }>): { walls: DecorWall[]; doors: Array<{ wall: number; from: number; to: number }> } {
  if (scene.plan?.enabled && scene.plan.walls.length) {
    const openings = scene.plan.openings ?? [];
    const walls = scene.plan.walls.map((w) => ({ a: w.a, b: w.b, blocked: openings.filter((o) => o.wall === w.id).map((o): [number, number] => [o.from, o.to]) }));
    const doors = scene.plan.walls.flatMap((w, i) => openings.filter((o) => o.wall === w.id && o.kind === "door").map((o) => ({ wall: i, from: o.from, to: o.to })));
    return { walls, doors };
  }
  const { widthM: w, depthM: d } = dims;
  const winW = Math.min(d * 0.45, 2.2);
  const hasWindows = category !== "control-room" && category !== "event";
  // Pared del fondo (z = −d/2), derecha, frente e izquierda; "along" desde el primer vértice.
  const doorAt = -w * 0.28 + w / 2;
  const winAtRight = -d * 0.12 + d / 2;
  const winAtLeft = d / 2 + d * 0.12;
  const walls: DecorWall[] = floor.map((a, i) => ({ a, b: floor[(i + 1) % floor.length]!, blocked: [] }));
  walls[0]!.blocked.push([doorAt - RECT_DOOR_W / 2, doorAt + RECT_DOOR_W / 2]);
  if (hasWindows) {
    walls[1]!.blocked.push([winAtRight - winW / 2, winAtRight + winW / 2]);
    walls[3]!.blocked.push([winAtLeft - winW / 2, winAtLeft + winW / 2]);
  }
  return { walls, doors: [{ wall: 0, from: doorAt - RECT_DOOR_W / 2, to: doorAt + RECT_DOOR_W / 2 }] };
}
