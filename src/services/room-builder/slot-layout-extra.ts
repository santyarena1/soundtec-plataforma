/**
 * Equipos de los ambientes residenciales y comerciales sumados en el
 * rediseño (dormitorio, cine, galería, comedor, restaurante, local).
 * Misma convención que slot-layout.ts: pared AV al frente (+z).
 */

import type { Pose, RoomSlot } from "./types";

type Dims = { widthM: number; depthM: number; heightM: number };

const WALL = 0.08;
const r = (n: number) => Math.round(n * 100) / 100;
const pose = (x: number, y: number, z: number, rotY = 0): Pose => ({ x: r(x), y: r(y), z: r(z), rotY });

export const EXTRA_TEMPLATE_KEYS = [
  "residential-bedroom-m",
  "residential-cinema-m",
  "residential-outdoor-m",
  "residential-dining-m",
  "restaurant-m",
  "retail-store-m",
] as const;

export function layoutExtraSlots(templateKey: string, d: Dims): RoomSlot[] | null {
  const frontZ = d.depthM / 2 - WALL;
  const backZ = -d.depthM / 2 + WALL;
  const leftX = -d.widthM / 2 + WALL;
  const rightX = d.widthM / 2 - WALL;
  const ceilY = d.heightM - 0.05;
  const rack = pose(leftX + 0.4, 0.45, backZ + 0.4, 0);

  switch (templateKey) {
    case "residential-bedroom-m":
      return [
        { key: "tv", role: "display", label: "TV", required: true, mount: "wall", pose: pose(0, 1.3, frontZ, 180), defaultQty: 1 },
        { key: "speakers", role: "speaker", label: "Parlantes de techo", required: true, mount: "ceiling", pose: pose(0, ceilY, 0), defaultQty: 2 },
        { key: "keypad", role: "touch", label: "Teclado junto a la cama", required: false, mount: "wall", pose: pose(rightX, 1.1, -d.depthM * 0.2, -90), defaultQty: 1 },
      ];
    case "residential-cinema-m":
      return [
        { key: "screen", role: "display", label: "Pantalla / proyección", required: true, mount: "wall", pose: pose(0, 1.45, frontZ, 180), defaultQty: 1 },
        { key: "speakers_front", role: "speaker", label: "Parlantes frontales (L-C-R)", required: true, mount: "wall", pose: pose(0, 1.1, frontZ, 180), defaultQty: 3 },
        { key: "speakers_surround", role: "speaker", label: "Parlantes envolventes", required: true, mount: "wall", pose: pose(leftX, 1.6, -d.depthM * 0.1, 90), defaultQty: 4 },
        { key: "subwoofer", role: "speaker", label: "Subwoofer", required: true, mount: "floor", pose: pose(d.widthM * 0.35, 0, frontZ - 0.3, 180), defaultQty: 1 },
        { key: "processor", role: "processor", label: "Procesador de cine / receiver", required: true, mount: "rack", pose: rack, defaultQty: 1 },
      ];
    case "residential-outdoor-m":
      return [
        { key: "speakers_outdoor", role: "speaker", label: "Parlantes de exterior", required: true, mount: "wall", pose: pose(leftX, 2.3, 0, 90), defaultQty: 4 },
        { key: "tv", role: "display", label: "TV de exterior", required: false, mount: "wall", pose: pose(0, 1.5, frontZ, 180), defaultQty: 1 },
      ];
    case "residential-dining-m":
      return [
        { key: "speakers", role: "speaker", label: "Parlantes de techo", required: true, mount: "ceiling", pose: pose(0, ceilY, 0), defaultQty: 4 },
        { key: "tv", role: "display", label: "TV", required: false, mount: "wall", pose: pose(0, 1.5, frontZ, 180), defaultQty: 1 },
      ];
    case "restaurant-m":
      return [
        { key: "speakers", role: "speaker", label: "Parlantes de techo", required: true, mount: "ceiling", pose: pose(0, ceilY, 0), defaultQty: 8 },
        { key: "displays", role: "display", label: "Pantallas", required: false, mount: "wall", pose: pose(leftX, 1.9, 0, 90), defaultQty: 2 },
        { key: "signage", role: "display", label: "Menú digital", required: false, mount: "wall", pose: pose(d.widthM * 0.25, 1.8, frontZ, 180), defaultQty: 1 },
        { key: "processor", role: "processor", label: "DSP / control de zonas", required: true, mount: "rack", pose: rack, defaultQty: 1 },
      ];
    case "retail-store-m":
      return [
        { key: "speakers", role: "speaker", label: "Parlantes de techo", required: true, mount: "ceiling", pose: pose(0, ceilY, 0), defaultQty: 6 },
        { key: "signage", role: "display", label: "Cartelería de vidriera", required: true, mount: "wall", pose: pose(0, 1.7, frontZ, 180), defaultQty: 2 },
        { key: "processor", role: "processor", label: "Reproductor / DSP", required: true, mount: "rack", pose: rack, defaultQty: 1 },
      ];
    default:
      return null;
  }
}
