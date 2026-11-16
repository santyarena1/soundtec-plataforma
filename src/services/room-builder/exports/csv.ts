/**
 * Exportaciones CSV de un proyecto: lista de materiales (equipos y cables con
 * cantidades) y planilla de cables con los ID F501. Llevan un encabezado con
 * la marca de la empresa, el proyecto y la revisión vigente, y después la
 * tabla. Separador ";" y BOM (Excel en español los abre bien así).
 * La lista para el cliente NUNCA lleva precios; la del panel los suma solo si
 * quien la baja puede ver precios de venta. Lógica pura, sin base.
 */

export type CsvBrand = { name: string; address: string; phone: string; email: string; web: string };

export type CsvMeta = {
  brand: CsvBrand;
  /** "Lista de materiales" / "Planilla de cables". */
  title: string;
  project: string;
  client: string | null;
  revision: { code: string; status: string };
  date: string;
};

export type CsvCell = string | number | null | undefined;

const cell = (v: CsvCell) => {
  if (v == null) return '""';
  const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
  return `"${s.replace(/"/g, '""')}"`;
};

/** Texto CSV (sin BOM: lo agrega quien lo descarga). */
export const csvText = (rows: CsvCell[][]) => rows.map((r) => r.map(cell).join(";")).join("\r\n");

/** BOM UTF-8 para que Excel lea los acentos. */
export const CSV_BOM = "﻿";

/** Encabezado de marca: empresa, documento, proyecto, revisión y fecha; una línea en blanco antes de la tabla. */
export function csvHeader(meta: CsvMeta): CsvCell[][] {
  const b = meta.brand;
  return [
    [b.name, b.address, b.phone, b.email, b.web],
    [meta.title, `Proyecto: ${meta.project}`, `Cliente: ${meta.client ?? "—"}`, `Rev. ${meta.revision.code} · ${meta.revision.status}`, meta.date],
    [],
  ];
}

export type BomItem = {
  room: string;
  kind: "equipo" | "cable";
  /** N.º del equipo en el plano (vacío en cables). */
  n: string;
  brand: string;
  model: string;
  /** Equipos: unidades. Cables: tramos. */
  quantity: number;
  /** Solo cables: metros totales. */
  meters?: number | null;
  /** Precio de venta unitario (USD); solo se usa en la versión con precios. */
  priceUsd?: number | null;
  /** Producto del catálogo (para buscar el precio; no se exporta). */
  productId?: string | null;
};

export const BOM_COLUMNS = ["Ambiente", "Tipo", "N.º", "Marca", "Modelo / descripción", "Cantidad", "Unidad", "Metros"] as const;
export const BOM_PRICE_COLUMNS = ["Precio unit. USD", "Subtotal USD"] as const;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Lista de materiales. `prices: false` (cliente) no incluye columnas ni valores de precio. */
export function bomCsv(items: BomItem[], meta: CsvMeta, opts: { prices: boolean }): string {
  const head: CsvCell[] = opts.prices ? [...BOM_COLUMNS, ...BOM_PRICE_COLUMNS] : [...BOM_COLUMNS];
  const rows: CsvCell[][] = items.map((it) => {
    const base: CsvCell[] = [it.room, it.kind === "equipo" ? "Equipo" : "Cable", it.n, it.brand, it.model, it.quantity, it.kind === "equipo" ? "u" : "tramos", it.meters ?? null];
    if (!opts.prices) return base;
    const price = it.kind === "equipo" && it.priceUsd != null ? r2(it.priceUsd) : null;
    return [...base, price, price != null ? r2(price * it.quantity) : null];
  });
  const total = opts.prices ? r2(items.reduce((a, it) => a + (it.kind === "equipo" && it.priceUsd != null ? it.priceUsd * it.quantity : 0), 0)) : null;
  const footer: CsvCell[][] = opts.prices
    ? [[], ["Total equipos USD (sin cables, mano de obra ni impuestos)", "", "", "", "", "", "", "", "", total]]
    : [[], ["Documento sin precios. La cotización se envía por separado."]];
  return csvText([...csvHeader(meta), head, ...rows, ...footer]);
}

export type CableCsvRow = {
  id: string;
  room: string;
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
  signal: string;
  cable: string | null;
  lengthM: number;
  /** "Medido en plano" / "Fijado a mano" / "Estimado". */
  lengthKind: string;
};

export const CABLE_COLUMNS = ["ID F501", "Ambiente", "Desde", "Puerto desde", "Hasta", "Puerto hasta", "Señal", "Cable", "Largo (m)", "Origen del largo"] as const;

/** Planilla de cables con los ID F501 (la misma de las láminas). */
export function cableScheduleCsv(rows: CableCsvRow[], meta: CsvMeta, scheme: string): string {
  return csvText([
    ...csvHeader(meta),
    [...CABLE_COLUMNS],
    ...rows.map((c) => [c.id, c.room, c.from, c.fromPort, c.to, c.toPort, c.signal, c.cable ?? "A definir", c.lengthM, c.lengthKind]),
    [],
    [scheme],
  ]);
}

/** Nombre de archivo seguro (ASCII) para un CSV o PNG del proyecto. */
export function exportFileName(kind: string, project: string, ext: string): string {
  const slug = project.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "proyecto";
  return `${kind}_${slug}.${ext}`;
}
