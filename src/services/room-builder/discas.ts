/**
 * Tamaño de imagen según AVIXA V202.01 (DISCAS: Display Image Size for 2D
 * Content in Audiovisual Systems), como lo calcula un integrador:
 *
 * - BDM (Basic Decision Making): el espectador reconoce el contenido sin leer
 *   cada detalle. Altura de imagen = distancia al espectador más lejano /
 *   (200 × % de altura del elemento). Con texto al 3 % de la altura de la
 *   imagen (presentaciones y contenido general) da distancia / 6; con
 *   elementos al 4 % (video, imágenes grandes) da distancia / 8.
 * - ADM (Analytical Decision Making): el espectador tiene que distinguir cada
 *   píxel (planillas, planos, código). Variante usada: agudeza visual de
 *   1 minuto de arco sobre la resolución vertical del CONTENIDO:
 *   altura = distancia × resolución vertical / 3438 (3438 ≈ 1 / tan 1').
 *   1080 líneas para contenido Full HD, 2160 para contenido 4K.
 * - Cine en casa / hotel (no es DISCAS): SMPTE, la imagen ocupa ~30° del
 *   campo horizontal desde el sillón.
 *
 * Además: distancia REAL de la pantalla al asiento más lejano de la escena
 * (sillas, sillones, bancos, pupitres; si no hay muebles, estimada), ángulo
 * horizontal al espectador más lateral, borde inferior por encima de las
 * cabezas (≥ 1,2 m sentados) y borde superior bajo el techo. Sugiere la
 * diagonal comercial y, si pasa la pantalla plana más grande, proyector o LED.
 */

import { resolveSceneFurniture, type FurnitureKind } from "./furnishing";
import type { RoomScene } from "./scene";
import { layoutSceneDevices, sceneDims } from "./units";
import { inchesFromModel, inchesFromName } from "./sizing";

/** Qué se mira en la pantalla: define el método de DISCAS. */
export const DISPLAY_CONTENTS = ["general", "video", "detail-1080", "detail-4k", "cinema"] as const;
export type DisplayContent = (typeof DISPLAY_CONTENTS)[number];

export const DISPLAY_CONTENT_LABEL: Record<DisplayContent, string> = {
  general: "Presentaciones / contenido general (BDM, texto al 3 %)",
  video: "Video e imágenes (BDM, elementos al 4 %)",
  "detail-1080": "Planillas y planos en detalle, Full HD (ADM 1080 líneas)",
  "detail-4k": "Detalle fino en 4K (ADM 2160 líneas)",
  cinema: "Cine en casa / hotel (SMPTE 30°, no es DISCAS)",
};

/** Tamaños comerciales de TV / monitor (pulgadas). */
export const FLAT_PANEL_SIZES_IN = [32, 43, 50, 55, 65, 75, 85, 98, 100] as const;
/** Tamaños comerciales de pantalla de proyección 16:9 (pulgadas). */
export const PROJECTION_SIZES_IN = [100, 106, 110, 120, 135, 150, 165, 180, 200, 250, 300] as const;
/** La pantalla plana más grande que se cotiza (98" / 100"). */
export const MAX_FLAT_IN = 100;
const MAX_PROJECTION_IN = PROJECTION_SIZES_IN[PROJECTION_SIZES_IN.length - 1];

const IN_TO_M = 0.0254;
/** Imagen 16:9: alto = 0,4903 × diagonal; ancho = 0,8716 × diagonal. */
export const H_PER_DIAG = 0.4903;
const W_PER_DIAG = 0.8716;
/** BDM: altura de imagen = distancia / (200 × % de altura del elemento). */
const BDM_FACTOR = 200;
const BDM_ELEMENT: Partial<Record<DisplayContent, number>> = { general: 0.03, video: 0.04 };
/** ADM: 1 minuto de arco → 1 / tan(1') ≈ 3438. */
export const ADM_ACUITY = 3438;
const ADM_LINES: Partial<Record<DisplayContent, number>> = { "detail-1080": 1080, "detail-4k": 2160 };
/** Cine (SMPTE): la imagen ocupa 30° horizontales desde el sillón. */
const CINEMA_HALF_ANGLE_RAD = (15 * Math.PI) / 180;
/** Borde inferior de la imagen: por encima de las cabezas de los sentados (m). */
export const MIN_BOTTOM_SEATED_M = 1.2;
/** De pie (eventos, bares): por encima de las cabezas de la gente parada (m, estimado). */
export const MIN_BOTTOM_STANDING_M = 1.8;
/** Cine en casa: el centro de la imagen cerca de la altura de los ojos del sillón (m). */
const CINEMA_BOTTOM_M = 0.75;
/** Margen del borde superior al techo (soporte, marco) (m). */
const CEILING_MARGIN_M = 0.1;
/** Ángulo horizontal máximo al espectador más lateral (límite habitual de paneles y pantallas, estimado). */
export const MAX_VIEW_ANGLE_DEG = 45;
/** Sin muebles: el último espectador a esta fracción de la profundidad (estimado). */
const FARTHEST_SEAT = 0.85;
const SOFA_SEAT = 0.6;
/** Distancia mínima de cálculo (m). */
const MIN_DISTANCE_M = 1.5;
/** Pupitres y escritorios: la persona se sienta a esta distancia del centro del mueble (m). */
const DESK_SEAT_M = 0.45;

const HOME_CATEGORIES = new Set(["residential", "hotel"]);
const STANDING_CATEGORIES = new Set(["event", "lobby"]);
const SEAT_KINDS = new Set<FurnitureKind>(["chair", "side-chair", "sofa", "lounge-chair", "bench", "bench-seat", "bar-stool", "ottoman"]);
const DESK_KINDS = new Set<FurnitureKind>(["desk"]);
/** Muebles del que presenta (escritorio docente, atril, recepción): no son espectadores. */
const PRESENTER = /teacher|docente|lectern|atril|reception|recepci/i;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Contenido por defecto según el tipo de ambiente. */
export function defaultDisplayContent(category: string): DisplayContent {
  if (HOME_CATEGORIES.has(category)) return "cinema";
  if (category === "control-room") return "detail-1080";
  return "general";
}

export type Viewer = { x: number; z: number; label: string };
export type DisplaySpot = { x: number; y: number; z: number; /** Grados (como las poses de la escena). */ rotY: number };

export type DiscasInput = {
  display: DisplaySpot;
  viewers: Viewer[];
  content: DisplayContent;
  heightM: number;
  /** Público de pie (eventos): el borde inferior va más alto. */
  standing?: boolean;
  /** Sin espectadores ubicados: distancia estimada al más lejano (m). */
  fallbackDistanceM: number;
  /** Pulgadas de la pantalla elegida (para controlarla), si hay. */
  currentInches?: number | null;
};

export type DiscasRecommendation = { kind: "flat" | "projector" | "led"; sizeIn: number; text: string };

export type DiscasResult = {
  content: DisplayContent;
  method: "BDM" | "ADM" | "SMPTE";
  /** La fórmula con los números, para mostrarla. */
  formula: string;
  farthestM: number;
  farthestLabel: string;
  /** La distancia no sale de muebles ubicados: es estimada. */
  distanceEstimated: boolean;
  imageHeightM: number;
  /** Diagonal mínima exacta (pulgadas, sin redondear a comercial). */
  requiredIn: number;
  /** Diagonal comercial de pantalla plana que alcanza (null: no hay plana tan grande). */
  flatPanelIn: number | null;
  recommendation: DiscasRecommendation;
  /** Ángulo horizontal al espectador más lateral (grados) y quién es. */
  maxAngleDeg: number | null;
  lateralLabel: string | null;
  /** Borde inferior mínimo, propuesto y borde superior de la imagen recomendada (m). */
  bottomMinM: number;
  bottomM: number;
  topM: number;
  fitsCeiling: boolean;
  /** Control de la pantalla elegida. */
  current: { inches: number; enough: boolean; bottomM: number; topM: number } | null;
  /** Avisos (ángulo, techo, borde inferior, tamaño). */
  warnings: string[];
};

/** Alto de imagen requerido según el método. */
function imageHeightFor(content: DisplayContent, distanceM: number): { heightM: number; method: DiscasResult["method"]; formula: string } {
  const lines = ADM_LINES[content];
  if (lines) {
    const h = (distanceM * lines) / ADM_ACUITY;
    return { heightM: h, method: "ADM", formula: `ADM: altura = ${r2(distanceM)} m × ${lines} / ${ADM_ACUITY} = ${r2(h)} m` };
  }
  const element = BDM_ELEMENT[content];
  if (element) {
    const h = distanceM / (BDM_FACTOR * element);
    return { heightM: h, method: "BDM", formula: `BDM: altura = ${r2(distanceM)} m / (200 × ${Math.round(element * 100)} %) = ${r2(h)} m` };
  }
  // Cine: ancho = 2 · d · tan(15°) → alto 16:9.
  const width = 2 * distanceM * Math.tan(CINEMA_HALF_ANGLE_RAD);
  const h = (width / W_PER_DIAG) * H_PER_DIAG;
  return { heightM: h, method: "SMPTE", formula: `SMPTE 30°: ancho = 2 × ${r2(distanceM)} m × tan 15° = ${r2(width)} m → altura ${r2(h)} m` };
}

/** Recomendación comercial para una diagonal mínima. */
export function recommendSize(requiredIn: number): { flatPanelIn: number | null; recommendation: DiscasRecommendation } {
  const flat = FLAT_PANEL_SIZES_IN.find((s) => s >= requiredIn - 1e-9) ?? null;
  if (flat) return { flatPanelIn: flat, recommendation: { kind: "flat", sizeIn: flat, text: `Pantalla de ${flat}"` } };
  const screen = PROJECTION_SIZES_IN.find((s) => s >= requiredIn - 1e-9) ?? null;
  if (screen) {
    return {
      flatPanelIn: null,
      recommendation: { kind: "projector", sizeIn: screen, text: `Supera la pantalla plana más grande (${MAX_FLAT_IN}"): proyector con pantalla de ${screen}" (o pared LED de ese tamaño)` },
    };
  }
  const led = Math.ceil(requiredIn / 10) * 10;
  return { flatPanelIn: null, recommendation: { kind: "led", sizeIn: led, text: `Supera la pantalla de proyección más grande (${MAX_PROJECTION_IN}"): pared LED de ~${led}" de diagonal` } };
}

/** Pulgadas → alto de imagen 16:9 (m). */
export const imageHeightOfIn = (inches: number) => inches * IN_TO_M * H_PER_DIAG;

/** Cálculo DISCAS para una pantalla y sus espectadores. */
export function discas(input: DiscasInput): DiscasResult {
  const { display, content } = input;
  const rad = (display.rotY * Math.PI) / 180;
  // Hacia dónde mira la pantalla (en planta).
  const fx = Math.sin(rad);
  const fz = Math.cos(rad);
  const seen = input.viewers
    .map((v) => {
      const dx = v.x - display.x;
      const dz = v.z - display.z;
      const along = dx * fx + dz * fz;
      const lateral = Math.abs(dx * fz - dz * fx);
      return { v, along, dist: Math.hypot(dx, dz), angle: (Math.atan2(lateral, Math.max(along, 1e-6)) * 180) / Math.PI };
    })
    // Solo los que están delante de la pantalla.
    .filter((s) => s.along > 0.3);
  const far = seen.length ? seen.reduce((a, b) => (b.dist > a.dist ? b : a)) : null;
  const farthestM = Math.max(MIN_DISTANCE_M, far ? far.dist : input.fallbackDistanceM);
  const lateral = seen.length ? seen.reduce((a, b) => (b.angle > a.angle ? b : a)) : null;

  const { heightM, method, formula } = imageHeightFor(content, farthestM);
  const requiredIn = heightM / H_PER_DIAG / IN_TO_M;
  const { flatPanelIn, recommendation } = recommendSize(requiredIn);
  const shownHeight = imageHeightOfIn(recommendation.sizeIn);

  const bottomMinM = content === "cinema" ? CINEMA_BOTTOM_M : input.standing ? MIN_BOTTOM_STANDING_M : MIN_BOTTOM_SEATED_M;
  const ceilingTop = input.heightM - CEILING_MARGIN_M;
  const bottomM = bottomMinM;
  const topM = bottomM + shownHeight;
  const fitsCeiling = topM <= ceilingTop + 1e-9;

  const warnings: string[] = [];
  if (!far) warnings.push(`Distancia estimada (${r1(farthestM)} m): no hay asientos ubicados en la sala delante de la pantalla.`);
  if (lateral && lateral.angle > MAX_VIEW_ANGLE_DEG) {
    warnings.push(`${lateral.v.label} mira la pantalla a ${Math.round(lateral.angle)}° (más de ${MAX_VIEW_ANGLE_DEG}°, límite estimado): ve la imagen deformada; mover el asiento o sumar una pantalla lateral.`);
  }
  if (!fitsCeiling) {
    warnings.push(`La imagen de ${recommendation.sizeIn}" (${r2(shownHeight)} m de alto) con el borde inferior a ${r2(bottomM)} m llega a ${r2(topM)} m y el techo está a ${r2(input.heightM)} m: no entra. Acercar al último espectador, usar contenido más grande o dos pantallas.`);
  }

  let current: DiscasResult["current"] = null;
  if (input.currentInches && input.currentInches > 0) {
    const h = imageHeightOfIn(input.currentInches);
    const cBottom = display.y - h / 2;
    const cTop = display.y + h / 2;
    const enough = input.currentInches + 1e-9 >= requiredIn;
    current = { inches: input.currentInches, enough, bottomM: r2(cBottom), topM: r2(cTop) };
    if (!enough) warnings.push(`La pantalla elegida (${input.currentInches}") es chica: el cálculo pide al menos ${Math.ceil(requiredIn)}".`);
    if (cBottom < bottomMinM - 0.05) warnings.push(`Borde inferior de la pantalla elegida a ${r2(cBottom)} m: queda tapado por las cabezas (mínimo ${r2(bottomMinM)} m). Subirla.`);
    if (cTop > ceilingTop + 0.05) warnings.push(`Borde superior de la pantalla elegida a ${r2(cTop)} m: choca con el techo (${r2(input.heightM)} m).`);
  }

  return {
    content,
    method,
    formula,
    farthestM: r2(farthestM),
    farthestLabel: far ? far.v.label : "estimado",
    distanceEstimated: !far,
    imageHeightM: r2(heightM),
    requiredIn: r1(requiredIn),
    flatPanelIn,
    recommendation,
    maxAngleDeg: lateral ? Math.round(lateral.angle) : null,
    lateralLabel: lateral ? lateral.v.label : null,
    bottomMinM,
    bottomM: r2(bottomM),
    topM: r2(topM),
    fitsCeiling,
    current,
    warnings,
  };
}

/** Asientos de la escena (sillas, sillones, bancos, pupitres) como espectadores. */
export function sceneViewers(scene: RoomScene, category: string): Viewer[] {
  const items = resolveSceneFurniture(scene, category).filter((f) => !f.hiddenBy);
  const out: Viewer[] = [];
  for (const f of items) {
    // El que presenta (docente, atril, recepción) mira al público, no a la pantalla.
    if (PRESENTER.test(`${f.id} ${f.group}`)) continue;
    if (SEAT_KINDS.has(f.kind)) out.push({ x: f.x, z: f.z, label: f.group });
    else if (DESK_KINDS.has(f.kind)) {
      // La persona se sienta del lado del asiento del pupitre (rotY en radianes).
      const side = f.seat ?? 1;
      out.push({ x: f.x + Math.sin(f.rotY) * DESK_SEAT_M * side, z: f.z + Math.cos(f.rotY) * DESK_SEAT_M * side, label: f.group });
    }
  }
  return out;
}

export type SceneSizingOptions = { content?: DisplayContent | null; /** Equipo de pantalla (id); si no, la primera. */ deviceId?: string | null; currentInches?: number | null };

/** DISCAS de la pantalla de una escena, con los asientos reales y su posición real. */
export function sceneDisplaySizing(scene: RoomScene, category: string, opts: SceneSizingOptions = {}): DiscasResult | null {
  const dims = sceneDims(scene);
  const slots = new Map(scene.slots.map((s) => [s.key, s]));
  const laid = layoutSceneDevices(scene.devices, slots, dims).map((l) => l.device);
  const display = laid.find((d) => (opts.deviceId ? d.id === opts.deviceId : d.designRole === "display"));
  const pose = display?.units?.[0]?.pose ?? display?.pose ?? null;
  if (!pose) return null;
  const content = opts.content ?? scene.displaySizing?.content ?? defaultDisplayContent(category);
  // Pulgadas de la pantalla elegida: las del nombre / modelo ("HT-HV55-Q" → 55) o, si no, las del modelo 3D ("tv_75").
  const fromProxy = display?.productId ? Number(/^tv_(\d{2,3})$/.exec(display.proxyKey ?? "")?.[1] ?? 0) || null : null;
  const fromName = display?.productId ? (inchesFromName(display.productName) ?? inchesFromModel(display.productName)) : null;
  const home = HOME_CATEGORIES.has(category);
  return discas({
    display: pose,
    viewers: sceneViewers(scene, category),
    content,
    heightM: scene.heightM,
    standing: STANDING_CATEGORIES.has(category),
    fallbackDistanceM: scene.depthM * (home ? SOFA_SEAT : FARTHEST_SEAT),
    currentInches: opts.currentInches ?? fromName ?? fromProxy,
  });
}

/** Una línea para láminas y avisos. */
export function discasLine(r: DiscasResult): string {
  const dist = `${r.farthestM.toString().replace(".", ",")} m al espectador más lejano${r.distanceEstimated ? " (estimado)" : ""}`;
  const rec = r.recommendation.kind === "flat" ? `pantalla de ${r.recommendation.sizeIn}"` : r.recommendation.text.split(": ").pop();
  return `Tamaño de imagen (AVIXA V202 ${r.method}): ${dist} → mínimo ${Math.ceil(r.requiredIn)}" → ${rec}; borde inferior ≥ ${r.bottomMinM.toString().replace(".", ",")} m.`;
}
