/**
 * Muebles de cada ambiente a partir de lo dibujado en el plano: busca los
 * objetos, los recorta, los clasifica con IA (o por medidas si no hay IA) y
 * los deja como muebles 3D en su lugar.
 */

import sharp from "sharp";
import { classifyPlanObjects } from "./plan-ai";
import type { FurnitureItem } from "@/services/room-builder/furnishing";
import {
  extractRoomObjects,
  facingAwayFromWall,
  guessKind,
  objectsToFurniture,
  type ClassifiedObject,
  type PlanObject,
  type RoomMapping,
} from "@/services/room-builder/plan-objects";
import type { PlanPoint } from "@/services/room-builder/plan-polygon";
import { planInkGrid } from "@/services/room-builder/plan-segment";

/** Margen alrededor de cada objeto al recortarlo (fracción de su tamaño). */
const CROP_PAD = 0.25;
const CROP_MAX_SIDE = 640;
/** Lado máximo de la imagen del ambiente entero que va de contexto. */
const ROOM_MAX_SIDE = 1024;
/** Sin IA: un renglón de texto es largo, angosto y ralo. */
const TEXT_ASPECT = 4;
const TEXT_DENSITY = 0.15;

export type PlanImageInput = { data: Buffer; widthPx: number; heightPx: number };

/** Trazo del plano en la grilla (se calcula una vez por proyecto). */
export async function planInk(image: PlanImageInput) {
  const g = await sharp(image.data).greyscale().raw().toBuffer({ resolveWithObject: true });
  return planInkGrid({ data: new Uint8Array(g.data), width: g.info.width, height: g.info.height });
}

type Crop = { dataUrl: string; rect: { x0: number; y0: number; x1: number; y1: number } };

async function cropObject(image: PlanImageInput, o: PlanObject): Promise<Crop> {
  const bw = (o.box.x1 - o.box.x0) * image.widthPx;
  const bh = (o.box.y1 - o.box.y0) * image.heightPx;
  const pad = Math.max(bw, bh) * CROP_PAD;
  const left = Math.max(0, Math.floor(o.box.x0 * image.widthPx - pad));
  const top = Math.max(0, Math.floor(o.box.y0 * image.heightPx - pad));
  const right = Math.min(image.widthPx, Math.ceil(o.box.x1 * image.widthPx + pad));
  const bottom = Math.min(image.heightPx, Math.ceil(o.box.y1 * image.heightPx + pad));
  const out = await sharp(image.data)
    .extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
    .resize({ width: CROP_MAX_SIDE, height: CROP_MAX_SIDE, fit: "inside", withoutEnlargement: false })
    .webp({ quality: 80 })
    .toBuffer();
  return {
    dataUrl: `data:image/webp;base64,${out.toString("base64")}`,
    rect: { x0: left / image.widthPx, y0: top / image.heightPx, x1: right / image.widthPx, y1: bottom / image.heightPx },
  };
}

/** El ambiente entero (contexto para la IA). */
async function cropRoom(image: PlanImageInput, polygon: PlanPoint[]): Promise<string> {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const left = Math.max(0, Math.floor(Math.min(...xs) * image.widthPx));
  const top = Math.max(0, Math.floor(Math.min(...ys) * image.heightPx));
  const right = Math.min(image.widthPx, Math.ceil(Math.max(...xs) * image.widthPx));
  const bottom = Math.min(image.heightPx, Math.ceil(Math.max(...ys) * image.heightPx));
  const out = await sharp(image.data)
    .extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
    .resize({ width: ROOM_MAX_SIDE, height: ROOM_MAX_SIDE, fit: "inside", withoutEnlargement: false })
    .webp({ quality: 80 })
    .toBuffer();
  return `data:image/webp;base64,${out.toString("base64")}`;
}

/** Muebles de un ambiente según lo dibujado en el plano. */
export async function furnitureFromPlan(input: {
  image: PlanImageInput;
  ink: { ink: Uint8Array; width: number; height: number };
  polygon: PlanPoint[];
  roomName: string;
  category: string;
  templateKey: string;
  map: RoomMapping;
}): Promise<FurnitureItem[]> {
  const { ink, width, height } = input.ink;
  // Metros por celda de la grilla.
  const cellM = input.map.mppX * (input.image.widthPx / width);
  const objects = extractRoomObjects(ink, width, height, input.polygon, cellM);
  if (!objects.length) return [];
  let readings: Awaited<ReturnType<typeof classifyPlanObjects>> = [];
  let crops: Crop[] = [];
  try {
    crops = await Promise.all(objects.map((o) => cropObject(input.image, o)));
    readings = await classifyPlanObjects(
      input.roomName,
      crops.map((c) => c.dataUrl),
      await cropRoom(input.image, input.polygon),
    );
  } catch (error) {
    console.error("[room-builder/plan-furniture] IA", error);
  }
  const classified: ClassifiedObject[] = [];
  objects.forEach((o, i) => {
    const reading = readings[i];
    const crop = crops[i];
    if (reading && crop) {
      // La IA descompone el recorte en muebles: cada uno en su lugar dentro del recorte.
      const cw = crop.rect.x1 - crop.rect.x0;
      const ch = crop.rect.y1 - crop.rect.y0;
      for (const item of reading) {
        classified.push({
          box: { x0: crop.rect.x0 + item.box.x0 * cw, y0: crop.rect.y0 + item.box.y0 * ch, x1: crop.rect.x0 + item.box.x1 * cw, y1: crop.rect.y0 + item.box.y1 * ch },
          againstWall: o.againstWall,
          density: o.density,
          kind: item.kind,
          facing: item.facing,
        });
      }
      return;
    }
    const wM = (o.box.x1 - o.box.x0) * input.image.widthPx * input.map.mppX;
    const dM = (o.box.y1 - o.box.y0) * input.image.heightPx * input.map.mppZ;
    const aspect = Math.max(wM, dM) / Math.max(0.01, Math.min(wM, dM));
    if (aspect >= TEXT_ASPECT && o.density < TEXT_DENSITY) return;
    classified.push({ ...o, kind: guessKind(wM, dM, input.category, input.templateKey), facing: facingAwayFromWall(o.againstWall) });
  });
  return objectsToFurniture(classified, input.map);
}
