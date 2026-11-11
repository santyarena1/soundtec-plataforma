/**
 * Marco de las láminas técnicas (A3 apaisado, estilo plano de obra AV):
 * recuadro, columna lateral con referencias y la cartela (rótulo) abajo a la
 * derecha con logo y datos de la empresa, proyecto, cliente, sala, número de
 * lámina, escala, fecha y revisión. Cada lámina es una hoja de 420 × 297 mm.
 */

import { escapeHtml } from "@/lib/quote-document-html";

/** Área útil de dibujo de la columna principal (mm). */
export const MAIN_AREA_MM = { w: 272, h: 264 };
/** Área de dibujo de la lámina apaisada a todo el ancho, con referencias y cartela abajo (mm). */
export const WIDE_AREA_MM = { w: 382, h: 214 };

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
};

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
<div class="c-grid"><div><span>N.º</span><b>${n}/${total}</b></div><div><span>Escala</span><b>${h(page.scale)}</b></div><div><span>Fecha</span><b>${h(meta.date)}</b></div><div><span>Rev.</span><b>${h(meta.revision)}</b></div></div>
</div>`;
}

export function renderSheetsHtml(pages: SheetPage[], meta: SheetMeta): string {
  const color = meta.color;
  const body = pages
    .map((p, i) =>
      p.layout === "wide"
        ? `<section class="sheet"><div class="frame wide"><div class="main">${p.main}</div><div class="bottom"><div class="side-body"><div class="doc">${h(meta.docTitle)}</div>${p.side}</div><div class="cartbox">${cartela(meta, p, i + 1, pages.length)}</div></div></div></section>`
        : `<section class="sheet"><div class="frame"><div class="main">${p.main}</div><div class="side"><div class="side-body"><div class="doc">${h(meta.docTitle)}</div>${p.side}</div>${cartela(meta, p, i + 1, pages.length)}</div></div></section>`,
    )
    .join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${h(meta.docTitle)} · ${h(meta.project)}</title><style>
@page { size: 420mm 297mm; margin: 0; }
html, body { margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 7.6pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet { position: relative; width: 420mm; height: 297mm; overflow: hidden; break-after: page; page-break-after: always; }
.sheet:last-child { break-after: auto; page-break-after: auto; }
.frame { position: absolute; left: 15mm; top: 10mm; width: 395mm; height: 277mm; border: .6mm solid #111827; box-sizing: border-box; display: flex; }
.main { width: 284mm; height: 100%; box-sizing: border-box; padding: 5mm; position: relative; overflow: hidden; }
.side { flex: 1; min-width: 0; height: 100%; border-left: .4mm solid #111827; display: flex; flex-direction: column; }
.side-body { flex: 1; min-height: 0; overflow: hidden; padding: 3.5mm 4mm; }
.frame.wide { flex-direction: column; }
.frame.wide .main { width: auto; flex: 1; min-height: 0; }
.bottom { height: 50mm; flex: none; display: flex; border-top: .4mm solid #111827; }
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
.labels { display: grid; grid-template-columns: repeat(4, 66mm); grid-auto-rows: 16.4mm; gap: 1mm; }
.label { border: .25mm dashed #94a3b8; display: flex; overflow: hidden; }
.label .stripe { width: 3mm; flex: none; }
.label .lt { padding: .8mm 1.4mm; min-width: 0; line-height: 1.25; }
.label .tag { font-size: 9.5pt; font-weight: 700; font-family: Consolas, "Courier New", monospace; }
.label .ln { font-size: 6.4pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60mm; }
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
.c-grid b { font-size: 8.5pt; }
</style></head><body>${body}</body></html>`;
}
