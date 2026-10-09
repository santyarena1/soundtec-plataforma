/** Modo "Desde plano": geometría esquemática sobre imagen calibrada. */

export type PlanPoint = { x: number; y: number }; // metros, origen centro

export type PlanWall = {
  id: string;
  a: PlanPoint;
  b: PlanPoint;
};

export type PlanModeState = {
  enabled: true;
  imageUrl: string;
  /** metros por unidad de imagen (tras calibración) */
  metersPerPixel: number;
  imageWidthPx: number;
  imageHeightPx: number;
  heightM: number;
  walls: PlanWall[];
  /** polígono de piso en metros (centro = 0,0) */
  floorPolygon: PlanPoint[];
  /** Puertas y ventanas del plano, por pared (metros desde el inicio de cada pared). */
  openings?: Array<{ wall: string; kind: "door" | "window"; from: number; to: number }>;
};

export type PlanCalibration = {
  p1: { x: number; y: number }; // px
  p2: { x: number; y: number }; // px
  realMeters: number;
};

export function computeMetersPerPixel(cal: PlanCalibration): number {
  const dx = cal.p2.x - cal.p1.x;
  const dy = cal.p2.y - cal.p1.y;
  const px = Math.hypot(dx, dy);
  if (px < 1 || cal.realMeters <= 0) {
    throw new Error("Calibración inválida");
  }
  return cal.realMeters / px;
}

export function pxToMeters(
  px: { x: number; y: number },
  imageWidthPx: number,
  imageHeightPx: number,
  metersPerPixel: number,
): PlanPoint {
  return {
    x: (px.x - imageWidthPx / 2) * metersPerPixel,
    y: (imageHeightPx / 2 - px.y) * metersPerPixel, // Y imagen abajo → Z escena
  };
}

export function boundsFromPolygon(poly: PlanPoint[]): {
  widthM: number;
  depthM: number;
  areaM2: number;
} {
  if (poly.length < 3) {
    return { widthM: 4, depthM: 3, areaM2: 12 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const widthM = Math.max(1, maxX - minX);
  const depthM = Math.max(1, maxY - minY);
  // shoelace
  let area = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const j = (i + 1) % poly.length;
    area += poly[i]!.x * poly[j]!.y - poly[j]!.x * poly[i]!.y;
  }
  return {
    widthM: Math.round(widthM * 100) / 100,
    depthM: Math.round(depthM * 100) / 100,
    areaM2: Math.round((Math.abs(area) / 2) * 100) / 100,
  };
}

export function rectangleFloor(widthM: number, depthM: number): PlanPoint[] {
  const w = widthM / 2;
  const d = depthM / 2;
  return [
    { x: -w, y: -d },
    { x: w, y: -d },
    { x: w, y: d },
    { x: -w, y: d },
  ];
}

export function wallsFromPolygon(poly: PlanPoint[]): PlanWall[] {
  const walls: PlanWall[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    walls.push({ id: `w${i}`, a, b });
  }
  return walls;
}
