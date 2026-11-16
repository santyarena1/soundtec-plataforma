/**
 * Formatos de hoja de las láminas técnicas: A3 (el de siempre), Tabloid
 * (11 × 17", el A3 de EE. UU.) y ARCH D (24 × 36", plano de obra grande).
 * Todas apaisadas. El marco, la columna lateral y la cartela miden lo mismo
 * en las tres; lo que crece es el área de dibujo, así el plano se elige a una
 * escala mayor en una hoja más grande y las tablas entran con más renglones.
 * Lógica pura, sin base.
 */

export type SheetFormatKey = "a3" | "tabloid" | "archd";

export type SheetFormat = { key: SheetFormatKey; label: string; widthMm: number; heightMm: number };

/** Pulgadas a mm: Tabloid = 17 × 11 × 25,4; ARCH D = 36 × 24 × 25,4 (valores exactos). */
export const SHEET_FORMATS: Record<SheetFormatKey, SheetFormat> = {
  a3: { key: "a3", label: "A3 (420 × 297 mm)", widthMm: 420, heightMm: 297 },
  tabloid: { key: "tabloid", label: 'Tabloid (11 × 17")', widthMm: 431.8, heightMm: 279.4 },
  archd: { key: "archd", label: 'ARCH D (24 × 36")', widthMm: 914.4, heightMm: 609.6 },
};

export const SHEET_FORMAT_KEYS = Object.keys(SHEET_FORMATS) as SheetFormatKey[];

export const parseSheetFormat = (v: unknown): SheetFormatKey => (typeof v === "string" && v in SHEET_FORMATS ? (v as SheetFormatKey) : "a3");

/** Márgenes del recuadro (mm): el izquierdo más ancho para encarpetar. */
const FRAME = { left: 15, top: 10, right: 10, bottom: 10 };
/** Ancho de la columna lateral con referencias y cartela (mm). */
export const SIDE_COLUMN_MM = 111;
/** Alto de la franja inferior de las láminas a todo el ancho (mm). */
export const BOTTOM_BAND_MM = 50;
/** Relleno de la columna principal y descuento de la escala gráfica (mm). */
const MAIN_PAD = { w: 12, h: 13 };

export type SheetGeometry = {
  format: SheetFormat;
  frame: { left: number; top: number; w: number; h: number };
  /** Ancho de la columna principal (mm). */
  mainW: number;
  /** Área útil de dibujo de la columna principal (mm). */
  mainArea: { w: number; h: number };
  /** Área de dibujo de la lámina a todo el ancho (mm). */
  wideArea: { w: number; h: number };
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function sheetGeometry(key: SheetFormatKey = "a3"): SheetGeometry {
  const format = SHEET_FORMATS[key];
  const w = r1(format.widthMm - FRAME.left - FRAME.right);
  const h = r1(format.heightMm - FRAME.top - FRAME.bottom);
  const mainW = r1(w - SIDE_COLUMN_MM);
  return {
    format,
    frame: { left: FRAME.left, top: FRAME.top, w, h },
    mainW,
    mainArea: { w: r1(mainW - MAIN_PAD.w), h: r1(h - MAIN_PAD.h) },
    wideArea: { w: r1(w - MAIN_PAD.w - 1), h: r1(h - BOTTOM_BAND_MM - MAIN_PAD.h) },
  };
}

/** Alto de referencia (A3) con el que se calibraron los renglones por lámina. */
const A3_MAIN_H = 264;

/** Renglones de una tabla en la columna principal, proporcionales al alto de la hoja. */
export const rowsFor = (base: number, geo: SheetGeometry) => Math.max(base, Math.floor((base * geo.mainArea.h) / A3_MAIN_H));
