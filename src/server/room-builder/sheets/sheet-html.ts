/**
 * Marco de las láminas técnicas (A3 apaisado, estilo plano de obra AV):
 * recuadro, columna lateral con referencias y la cartela (rótulo) abajo a la
 * derecha con logo y datos de la empresa, proyecto, cliente, sala, número de
 * lámina, escala, fecha, revisión y estado de emisión (la primera lámina suma
 * la tabla de revisiones). Hoja A3 de 420 × 297 mm, o Tabloid / ARCH D
 * (sheet-format.ts).
 */

import { escapeHtml } from "@/lib/quote-document-html";
import type { RevisionRow } from "@/services/room-builder/revisions";
import { BOTTOM_BAND_MM, sheetGeometry, type SheetFormatKey } from "@/services/room-builder/sheets/sheet-format";

/** Área útil de dibujo de la columna principal en A3 (mm); para otros formatos, sheetGeometry(). */
export const MAIN_AREA_MM = sheetGeometry("a3").mainArea;
/** Área de dibujo de la lámina apaisada a todo el ancho en A3, con referencias y cartela abajo (mm). */
export const WIDE_AREA_MM = sheetGeometry("a3").wideArea;

export type SheetPage = {
  /** wide: dibujo a todo el ancho y las referencias abajo (diagramas largos). */
  layout?: "side" | "wide";
  /** Nombre de la lámina en la cartela ("Plano a escala"). */
  title: string;
  /** "1:50" o "S/E" (sin escala). */
  scale: string;
  /** Sala de la lámina (null = proyecto completo). */
  room: string | null;
  main: string;
  side: string;
};

export type SheetMeta = {
  docTitle: string;
  project: string;
  client: string | null;
  company: { name: string; address: string; phone: string; email: string; web: string };
  logo: string;
  color: string;
  date: string;
  revision: string;
  /** Estado de emisión de la revisión vigente ("Para aprobación"…). */
  revisionStatus?: string;
  /** Historial de revisiones (la más nueva primero): tabla en la primera lámina. */
  revisions?: RevisionRow[];
  /** Formato de hoja (A3 por defecto). */
  format?: SheetFormatKey;
};

/** Tabla de revisiones de la primera lámina (dentro de la cartela). */
function revisionTable(rows: RevisionRow[]): string {
  if (!rows.length) return "";
  return `<table class="c-revs"><tr><th>Rev.</th><th>Fecha</th><th>Estado</th><th>Descripción</th><th>Por</th></tr>${rows
    .map((r) => `<tr${r.current ? ' class="cur"' : ""}><td><b>${h(r.code)}</b></td><td>${h(r.date)}</td><td>${h(r.status)}</td><td>${h(r.description)}</td><td>${h(r.author)}</td></tr>`)
    .join("")}</table>`;
}

export const h = escapeHtml;

/** Bloque de la columna lateral con título. */
export const sideBlock = (title: string, body: string) => `<div class="sb"><div class="sb-t">${h(title)}</div>${body}</div>`;

/** Muestra de línea para las referencias (sólida o punteada). */
export const lineSample = (color: string, dashed = false) =>
  `<svg width="9mm" height="2mm" viewBox="0 0 9 2" style="vertical-align:middle"><line x1="0" y1="1" x2="9" y2="1" stroke="${color}" stroke-width="0.6"${dashed ? ' stroke-dasharray="1.6 0.9"' : ""}/></svg>`;

function cartela(meta: SheetMeta, page: SheetPage, n: number, total: number): string {
  const c = meta.company;
  return `<div class="cartela">
<div class="c-head">${meta.logo ? `<img src="${h(meta.logo)}" alt=""/>` : `<b>${h(c.name)}</b>`}<div class="c-co"><b>${h(c.name)}</b><br/>${h(c.address)}<br/>${h(c.phone)} · ${h(c.email)}<br/>${h(c.web)}</div></div>
<div class="c-row"><span>Proyecto</span><b>${h(meta.project)}</b></div>
<div class="c-row"><span>Cliente</span>${h(meta.client ?? "—")}</div>
<div class="c-row"><span>Sala</span>${h(page.room ?? "Proyecto completo")}</div>
<div class="c-row c-title"><span>Lámina</span><b>${h(page.title)}</b></div>
${n === 1 ? revisionTable(meta.revisions ?? []) : ""}<div class="c-row c-status"><span>Emisión</span><b>${h(meta.revisionStatus ?? "")}</b></div>
<div class="c-grid"><div><span>N.º</span><b>${n}/${total}</b></div><div><span>Escala</span><b>${h(page.scale)}</b></div><div><span>Fecha</span><b>${h(meta.date)}</b></div><div><span>Rev.</span><b>${h(meta.revision)}</b></div></div>
</div>`;
}

export function renderSheetsHtml(pages: SheetPage[], meta: SheetMeta): string {
  const color = meta.color;
  // Hoja y recuadro según el formato elegido (A3, Tabloid o ARCH D).
  const geo = sheetGeometry(meta.format ?? "a3");
  const W = geo.format.widthMm;
  const H = geo.format.heightMm;
  const body = pages
    .map((p, i) =>
      p.layout === "wide"
        ? `<section class="sheet"><div class="frame wide"><div class="main">${p.main}</div><div class="bottom"><div class="side-body"><div class="doc">${h(meta.docTitle)}</div>${p.side}</div><div class="cartbox">${cartela(meta, p, i + 1, pages.length)}</div></div></div></section>`
        : `<section class="sheet"><div class="frame"><div class="main">${p.main}</div><div class="side"><div class="side-body"><div class="doc">${h(meta.docTitle)}</div>${p.side}</div>${cartela(meta, p, i + 1, pages.length)}</div></div></section>`,
    )
    .join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${h(meta.docTitle)} · ${h(meta.project)}</title><style>
@page { size: ${W}mm ${H}mm; margin: 0; }
html, body { margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 7.6pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet { position: relative; width: ${W}mm; height: ${H}mm; overflow: hidden; break-after: page; page-break-after: always; }
.sheet:last-child { break-after: auto; page-break-after: auto; }
.frame { position: absolute; left: ${geo.frame.left}mm; top: ${geo.frame.top}mm; width: ${geo.frame.w}mm; height: ${geo.frame.h}mm; border: .6mm solid #111827; box-sizing: border-box; display: flex; }
.main { width: ${geo.mainW}mm; height: 100%; box-sizing: border-box; padding: 5mm; position: relative; overflow: hidden; }
.side { flex: 1; min-width: 0; height: 100%; border-left: .4mm solid #111827; display: flex; flex-direction: column; }
.side-body { flex: 1; min-height: 0; overflow: hidden; padding: 3.5mm 4mm; }
.frame.wide { flex-direction: column; }
.frame.wide .main { width: auto; flex: 1; min-height: 0; }
.bottom { height: ${BOTTOM_BAND_MM}mm; flex: none; display: flex; border-top: .4mm solid #111827; }
.bottom .side-body { column-count: 3; column-gap: 6mm; }
.bottom .sb { break-inside: avoid; }
.cartbox { width: 110mm; flex: none; border-left: .4mm solid #111827; }
.cartbox .cartela { border-top: none; }
.doc { font-size: 11pt; font-weight: 700; color: ${color}; letter-spacing: .3pt; text-transform: uppercase; margin-bottom: 2.5mm; }
.sb { margin-bottom: 3mm; }
.sb-t { font-size: 7pt; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: .4pt; border-bottom: .2mm solid #cbd5e1; padding-bottom: .8mm; margin-bottom: 1.2mm; }
.sb p { margin: .8mm 0; }
.leg { display: flex; align-items: center; gap: 1.5mm; margin: .7mm 0; }
.muted { color: #64748b; }
.fit { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.fit svg { width: 100%; height: 100%; }
.plan svg { display: block; }
table { width: 100%; border-collapse: collapse; }
.tbl th { background: ${color}; color: #fff; text-align: left; font-weight: 700; padding: 1.1mm 1.4mm; font-size: 7pt; }
.tbl td { border-bottom: .2mm solid #d1d5db; padding: .9mm 1.4mm; vertical-align: top; }
.tbl tr:nth-child(even) td { background: #f8fafc; }
.mono { font-family: Consolas, "Courier New", monospace; }
.num { text-align: right; white-space: nowrap; }
.est { color: #92400e; font-style: italic; }
.chip { display: inline-block; width: 2.2mm; height: 2.2mm; border-radius: 1.1mm; margin-right: 1mm; vertical-align: middle; }
.badge { display: inline-block; padding: .2mm 1.2mm; border-radius: 1mm; font-size: 6.6pt; font-weight: 700; }
.b-ficha { background: #dcfce7; color: #166534; } .b-pendiente { background: #fef3c7; color: #92400e; } .b-generico { background: #e0e7ff; color: #3730a3; }
.warn-list { margin: 0; padding: 0; list-style: none; }
.warn-list li { padding: 1mm 0 1mm 4mm; border-bottom: .2mm solid #e5e7eb; position: relative; }
.warn-list li::before { content: ""; position: absolute; left: 0; top: 1.9mm; width: 2mm; height: 2mm; border-radius: 1mm; background: #94a3b8; }
.warn-list li.error::before { background: #be123c; } .warn-list li.warn::before { background: #d97706; }
.h2 { font-size: 10pt; font-weight: 700; color: ${color}; margin: 0 0 2mm; text-transform: uppercase; letter-spacing: .3pt; }
.labels { display: grid; grid-template-columns: repeat(auto-fill, 51mm); gap: 2mm; align-content: start; }
.label { width: 51mm; box-sizing: border-box; border: .25mm dashed #94a3b8; display: flex; flex-direction: column; overflow: hidden; }
.label .face { height: 25mm; flex: none; display: flex; overflow: hidden; box-sizing: border-box; }
.label .face.flip { transform: rotate(180deg); border-top: .25mm dashed #475569; }
.label .tail { flex: 1; border-top: .25mm dashed #94a3b8; background: repeating-linear-gradient(45deg, #fff 0 1.2mm, #f1f5f9 1.2mm 2.4mm); color: #94a3b8; font-size: 5.5pt; display: flex; align-items: center; justify-content: center; }
.label .stripe { width: 3mm; flex: none; }
.label .lt { padding: 1mm 1.4mm; min-width: 0; line-height: 1.22; display: flex; flex-direction: column; justify-content: center; }
.label .tag { font-size: 11pt; font-weight: 700; font-family: Consolas, "Courier New", monospace; letter-spacing: .2pt; white-space: nowrap; }
.label .end { font-size: 6.4pt; font-weight: 700; color: #475569; }
.label .ln { font-size: 6.2pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45mm; }
.c-status b { font-size: 8pt; color: ${color}; text-transform: uppercase; letter-spacing: .3pt; }
.c-revs { width: 100%; border-collapse: collapse; font-size: 6pt; border-bottom: .2mm solid #94a3b8; }
.c-revs th { background: #f1f5f9; color: #475569; text-align: left; padding: .6mm 1.2mm; font-weight: 700; text-transform: uppercase; font-size: 5.6pt; }
.c-revs td { padding: .5mm 1.2mm; border-top: .2mm solid #e2e8f0; vertical-align: top; }
.c-revs tr.cur td { background: #eef2ff; }
.shots { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; height: 100%; align-content: start; }
.shots img { width: 100%; border: .2mm solid #cbd5e1; }
.cartela { border-top: .4mm solid #111827; font-size: 7pt; }
.c-head { display: flex; gap: 3mm; align-items: center; padding: 2.2mm 3mm; border-bottom: .3mm solid #111827; }
.c-head img { max-width: 30mm; max-height: 13mm; }
.c-co { font-size: 6.4pt; line-height: 1.3; color: #334155; }
.c-co b { color: #111827; font-size: 7.4pt; }
.c-row { display: flex; gap: 2mm; padding: 1.1mm 3mm; border-bottom: .2mm solid #94a3b8; }
.c-row span, .c-grid span { width: 15mm; flex: none; color: #64748b; text-transform: uppercase; font-size: 6pt; letter-spacing: .3pt; padding-top: .3mm; }
.c-title b { font-size: 9pt; color: ${color}; }
.c-grid { display: grid; grid-template-columns: 1fr 1fr 1.4fr .7fr; }
.c-grid div { padding: 1.1mm 2mm; border-right: .2mm solid #94a3b8; display: flex; flex-direction: column; }
.c-grid div:last-child { border-right: none; }
.c-grid span { width: auto; }
.c-grid b { font-size: 8.5pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-grid div { min-width: 0; }
/* Lámina apaisada: la cartela vive en la banda de abajo (${BOTTOM_BAND_MM} mm) y tiene que
   entrar entera, con N.º / Escala / Fecha / Rev. dentro del recuadro. */
.cartbox { display: flex; flex-direction: column; overflow: hidden; }
.cartbox .cartela { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.cartbox .c-head { padding: 1.2mm 3mm; }
.cartbox .c-head img { max-height: 8.5mm; }
.cartbox .c-co { font-size: 5.8pt; line-height: 1.2; }
.cartbox .c-co b { font-size: 6.6pt; }
.cartbox .c-row { padding: .55mm 3mm; }
.cartbox .c-title b { font-size: 8pt; }
.cartbox .c-status b { font-size: 7pt; }
.cartbox .c-grid { margin-top: auto; border-top: .2mm solid #94a3b8; }
.cartbox .c-grid div { padding: .6mm 2mm; }
.cartbox .c-grid b { font-size: 7.6pt; }
</style></head><body>${body}</body></html>`;
}
