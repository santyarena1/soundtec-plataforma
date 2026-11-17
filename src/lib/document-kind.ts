/**
 * Rótulo de un documento descargable en la ficha.
 *
 * El campo "tipo" de los documentos viene mezclado: a veces es la categoría
 * del fabricante ("Spec Sheets", "Guides & Manuals") y a veces el tipo de
 * recurso del almacenamiento ("image", "raw"), que no dice nada al cliente y
 * encima miente: un PDF subido como "image" se mostraba como IMAGE y un DXF
 * como RAW. El formato se toma de la extensión del archivo (o del mime).
 */

const STORAGE_TYPES = new Set(["image", "raw", "video", "upload", "file", "auto", "authenticated", "private"]);

const CATEGORY_ES: Record<string, string> = {
  "guides & manuals": "Guías y manuales",
  "product certificates": "Certificados",
  "specifier resources": "Recursos para especificar",
  "software & firmware": "Software y firmware",
  "spec sheets": "Hoja técnica",
  "spec sheet": "Hoja técnica",
  multimedia: "Multimedia",
  "marketing resources": "Material de marketing",
  "technical resources": "Recursos técnicos",
  firmware: "Firmware",
  manual: "Manual",
  manuals: "Manuales",
  datasheet: "Hoja técnica",
};

const FORMAT_BY_EXT: Record<string, string> = {
  pdf: "PDF",
  dxf: "DXF (CAD)",
  dwg: "DWG (CAD)",
  rfa: "Revit (BIM)",
  rvt: "Revit (BIM)",
  step: "STEP (3D)",
  stp: "STEP (3D)",
  skp: "SketchUp (3D)",
  zip: "ZIP",
  rar: "RAR",
  "7z": "7Z",
  gll: "GLL (acústica)",
  doc: "Word",
  docx: "Word",
  xls: "Excel",
  xlsx: "Excel",
  csv: "CSV",
  txt: "Texto",
  exe: "Instalador",
  msi: "Instalador",
  jpg: "Imagen",
  jpeg: "Imagen",
  png: "Imagen",
  gif: "Imagen",
  webp: "Imagen",
  avif: "Imagen",
  mp4: "Video",
  mov: "Video",
};

const FORMAT_BY_MIME: Array<[RegExp, string]> = [
  [/application\/pdf/i, "PDF"],
  [/application\/(zip|x-zip)/i, "ZIP"],
  [/dxf/i, "DXF (CAD)"],
  [/dwg/i, "DWG (CAD)"],
  [/^image\//i, "Imagen"],
  [/^video\//i, "Video"],
  [/msword|wordprocessingml/i, "Word"],
  [/ms-excel|spreadsheetml/i, "Excel"],
];

export function fileExtension(url: string): string | null {
  const path = url.split(/[?#]/)[0] ?? "";
  const match = /\.([a-z0-9]{2,5})$/i.exec(path);
  return match ? match[1].toLowerCase() : null;
}

export interface DocumentKind {
  /** Formato legible: PDF, DXF (CAD), ZIP… null si no se puede saber. */
  format: string | null;
  /** Categoría del fabricante en español, si vino una. */
  category: string | null;
  /** Texto para mostrar debajo del nombre ("Hoja técnica · PDF"). */
  label: string | null;
  isImage: boolean;
}

export function documentKind(input: { type?: string | null; url?: string | null; mime?: string | null }): DocumentKind {
  const rawType = (input.type ?? "").trim();
  const typeKey = rawType.toLowerCase();
  const ext = fileExtension(input.url ?? "");

  let format: string | null = (ext && FORMAT_BY_EXT[ext]) || null;
  if (!format && input.mime) format = FORMAT_BY_MIME.find(([re]) => re.test(input.mime as string))?.[1] ?? null;
  // A veces el "tipo" es directamente el formato ("pdf", "zip").
  if (!format && FORMAT_BY_EXT[typeKey]) format = FORMAT_BY_EXT[typeKey];

  // Un mime en el campo tipo ("application/pdf") no es una categoría.
  const looksLikeMime = /^[a-z]+\/[a-z0-9.+-]+$/.test(typeKey);
  if (!format && looksLikeMime) format = FORMAT_BY_MIME.find(([re]) => re.test(typeKey))?.[1] ?? null;

  const isCategory = rawType !== "" && !STORAGE_TYPES.has(typeKey) && !FORMAT_BY_EXT[typeKey] && !looksLikeMime;
  const category: string | null = isCategory ? CATEGORY_ES[typeKey] ?? rawType : null;

  const label = [category, format].filter(Boolean).join(" · ") || null;
  return { format, category, label, isImage: format === "Imagen" };
}
