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
  mergeSeating,
  objectsToFurniture,
  snapBoxToInk,
  type ClassifiedObject,
  type PlanObject,
  type RoomMapping,
} from "@/services/room-builder/plan-objects";
import type { PlanPoint } from "@/services/room-builder/plan-polygon";
import { planInkGrid, planOpenings } from "@/services/room-builder/plan-segment";
import { footprintPolygon } from "@/services/room-builder/plan-shape";

/** Margen alrededor de cada objeto al recortarlo (fracción de su tamaño). */
const CROP_PAD = 0.25;
const CROP_MAX_SIDE = 640;
/** Lado máximo de la imagen del ambiente entero que va de contexto. */
const ROOM_MAX_SIDE = 1024;
/** Sin IA: un renglón de texto es largo, angosto y ralo. */
const TEXT_ASPECT = 4;
const TEXT_DENSITY = 0.15;

/** Lee los recortes: un listado de muebles por recorte (null si no se pudo). `where`: dónde está cada recorte en el plano. */
export type PlanObjectClassifier = (
  roomName: string,
  crops: string[],
  roomDataUrl?: string,
  where?: { rects: Crop["rect"][]; boxes: PlanObject["box"][] },
) => ReturnType<typeof classifyPlanObjects>;

export type PlanImageInput = { data: Buffer; widthPx: number; heightPx: number };

/** Trazo del plano en la grilla y sus puertas / ventanas (se calcula una vez por proyecto). */
export async function planInk(image: PlanImageInput) {
  const g = await sharp(image.data).greyscale().raw().toBuffer({ resolveWithObject: true });
  const gray = { data: new Uint8Array(g.data), width: g.info.width, height: g.info.height };
  return { ...planInkGrid(gray), openings: planOpenings(gray) };
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
/** Junta máxima (m) entre piezas dibujadas de un mismo sillón. */
const SEAT_JOINT_M = 0.12;

export async function furnitureFromPlan(input: {
  image: PlanImageInput;
  ink: { ink: Uint8Array; width: number; height: number };
  polygon: PlanPoint[];
  roomName: string;
  category: string;
  templateKey: string;
  map: RoomMapping;
  /** Clasificador (la IA por defecto; las pruebas pasan uno con la respuesta conocida). */
  classify?: PlanObjectClassifier;
}): Promise<FurnitureItem[]> {
  const classify = input.classify ?? classifyPlanObjects;
  const { ink, width, height } = input.ink;
  // Metros por celda de la grilla.
  const cellM = input.map.mppX * (input.image.widthPx / width);
  const objects = extractRoomObjects(ink, width, height, input.polygon, cellM);
  if (!objects.length) return [];
  let readings: Awaited<ReturnType<typeof classifyPlanObjects>> = [];
  let crops: Crop[] = [];
  try {
    crops = await Promise.all(objects.map((o) => cropObject(input.image, o)));
    readings = await classify(
      input.roomName,
      crops.map((c) => c.dataUrl),
      await cropRoom(input.image, input.polygon),
      { rects: crops.map((c) => c.rect), boxes: objects.map((o) => o.box) },
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
      const real = reading.filter((it) => it.kind !== "door" && it.kind !== "text" && it.kind !== "other");
      for (const item of reading) {
        const approx = { x0: crop.rect.x0 + item.box.x0 * cw, y0: crop.rect.y0 + item.box.y0 * ch, x1: crop.rect.x0 + item.box.x1 * cw, y1: crop.rect.y0 + item.box.y1 * ch };
        // Un solo mueble en el recorte: su contorno es el del objeto encontrado. Si son varios,
        // cada uno se ajusta a los trazos que hay en su zona (cae sobre las líneas del plano).
        const box = real.length === 1 && real[0] === item ? o.box : snapBoxToInk(approx, o.box, ink, width, height);
        classified.push({
          box,
          againstWall: o.againstWall,
          density: o.density,
          kind: item.kind,
          facing: item.facing,
          shape: footprintPolygon(box, ink, width, height),
        });
      }
      return;
    }
    const wM = (o.box.x1 - o.box.x0) * input.image.widthPx * input.map.mppX;
    const dM = (o.box.y1 - o.box.y0) * input.image.heightPx * input.map.mppZ;
    const aspect = Math.max(wM, dM) / Math.max(0.01, Math.min(wM, dM));
    if (aspect >= TEXT_ASPECT && o.density < TEXT_DENSITY) return;
    classified.push({ ...o, kind: guessKind(wM, dM, input.category, input.templateKey), facing: facingAwayFromWall(o.againstWall), shape: footprintPolygon(o.box, ink, width, height) });
  });
  // Sillones modulares o en L leídos por partes: un solo sillón con la forma de la unión.
  const seats = mergeSeating(classified, SEAT_JOINT_M / (input.image.widthPx * input.map.mppX), SEAT_JOINT_M / (input.image.heightPx * input.map.mppZ));
  return objectsToFurniture(seats, input.map);
}
