/**
 * Láminas sueltas (contenido de la columna principal y de la lateral):
 * plano a escala, diagrama de conexiones, planilla de cables, etiquetas,
 * lista de equipos, avisos y vistas 3D. Las usan el juego de una sala y el
 * del proyecto completo.
 */

import { cableLabels, cableTotals, LENGTH_KIND_LABEL, PORTS_SOURCE_LABEL, totalLength, type PortsSource, type SheetCable, type SheetDevice, type SheetWarning } from "@/services/room-builder/sheets/sheet-model";
import { drawableArea, planContentExtent, scaledPlanSvg } from "@/services/room-builder/sheets/plan-sheet-svg";
import { pickScale, scaleLabel } from "@/services/room-builder/sheets/scale";
import { diagramSlices, sliceSvg } from "@/services/room-builder/sheets/wiring-diagram-svg";
import { F501_SCHEME, F501_VARIANTS, type F501Variant } from "@/services/room-builder/sheets/f501";
import { rowsFor, sheetGeometry, type SheetGeometry } from "@/services/room-builder/sheets/sheet-format";
import { h, lineSample, sideBlock, type SheetPage } from "./sheet-html";
import type { RoomSheet } from "./room-sheet";

/** Renglones por lámina en A3 (en hojas más grandes entran más: rowsFor). */
const SCHEDULE_ROWS = 34;
const LIST_ROWS = 34;
/** Separación entre etiquetas y espacio que ocupa el relleno de la columna principal (mm). */
const LABEL_GAP_MM = 2;
const LABEL_PAD_MM = 10;
/** Formato A3 por defecto (el de siempre). */
const A3 = sheetGeometry("a3");
/** Hasta cuántas láminas se parte un diagrama largo, y cuánto más ancho que la hoja se acepta en una sola. */
const MAX_DIAGRAM_PARTS = 4;
const DIAGRAM_STRETCH = 1.1;

const m1 = (n: number) => n.toFixed(1).replace(".", ",");
const chunk = <T,>(list: T[], size: number) => (list.length ? Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size)) : [[] as T[]]);
const part = (title: string, i: number, n: number) => (n > 1 ? `${title} (${i + 1}/${n})` : title);

/** Referencias de señales usadas y del tipo de línea según cómo se obtuvo el largo. */
function signalLegend(cables: SheetCable[]): string {
  const seen = new Map<string, string>();
  for (const c of cables) if (!seen.has(c.signal)) seen.set(c.signal, c.color);
  const rows = [...seen].map(([s, color]) => `<div class="leg">${lineSample(color)}<span>${h(s)}</span></div>`).join("");
  const kinds = `<div class="leg">${lineSample("#334155")}<span>Largo medido en plano o fijado a mano</span></div><div class="leg">${lineSample("#334155", true)}<span>Largo estimado</span></div>`;
  return sideBlock("Señales", rows || `<p class="muted">Sin cables.</p>`) + sideBlock("Recorridos", kinds);
}

/** Lista corta n.º → modelo para leer el plano. */
function deviceKey(devices: SheetDevice[]): string {
  const rows = devices
    .slice(0, 40)
    .map((d) => `<div class="leg"><b style="width:5mm;display:inline-block">${d.remote ? "R" : d.n}</b><span>${h([d.brand, d.model].filter(Boolean).join(" "))}${d.quantity > 1 ? ` × ${d.quantity}` : ""}</span></div>`)
    .join("");
  return sideBlock("Equipos", rows || `<p class="muted">Sin equipos.</p>`);
}

/** Lámina: plano de la sala a escala normalizada. */
export function planPage(room: RoomSheet, opts: { scaleNote?: string; geo?: SheetGeometry } = {}): SheetPage {
  const geo = opts.geo ?? A3;
  const ext = planContentExtent(room);
  const scale = pickScale(ext, drawableArea(geo.mainArea));
  const svg = scaledPlanSvg({ floor: room.floor, walls: room.walls, furniture: room.furniture, devices: room.devices, cables: room.cables, exit: room.exit, areaMm: geo.mainArea, scale: scale.denominator });
  const notes = [
    "Cotas en metros, a eje de muro.",
    `Sala de ${m1(room.dims.widthM)} × ${m1(room.dims.depthM)} m, alto ${m1(room.dims.heightM)} m.`,
    `Imprimir en ${geo.format.label.replace(/ \(.*$/, "")} al 100 % para medir sobre el plano.`,
    scale.normalized ? null : "La planta no entra a 1:100: se usó una escala mayor fuera de la serie normalizada.",
    room.exit && room.devices.some((d) => d.remote) ? "R: salida del cableado hacia el rack central." : null,
    opts.scaleNote ?? null,
  ].filter(Boolean);
  return {
    title: "Plano a escala",
    scale: scaleLabel(scale),
    room: room.name,
    main: `<div class="plan">${svg}</div>`,
    side: signalLegend(room.cables) + deviceKey(room.devices) + sideBlock("Notas", notes.map((n) => `<p>${h(n!)}</p>`).join("")),
  };
}

/**
 * Láminas: diagrama de conexiones puerto a puerto, a todo el ancho de la
 * hoja. Si es muy largo para leerse en una, se parte en tramos por los
 * huecos entre columnas (nunca por un equipo).
 */
export function diagramPages(room: RoomSheet, geo: SheetGeometry = A3): SheetPage[] {
  const d = room.diagram;
  if (!d) return [];
  const areaAspect = geo.wideArea.w / geo.wideArea.h;
  const parts = Math.min(MAX_DIAGRAM_PARTS, Math.max(1, Math.ceil(d.width / d.height / (areaAspect * DIAGRAM_STRETCH))));
  const slices = diagramSlices(d.width, d.cuts, parts);
  const notes = room.source === "manual"
    ? ["Puertos con el nombre de la ficha del fabricante.", "* Puerto sin ficha (genérico o cargado a mano).", "Bloque punteado: equipo sin puertos cargados.", "Bloque gris: equipo del rack central."]
    : ["Propuesta automática del sistema: a confirmar en el plano técnico.", "Puntos de conexión según la ficha de cada equipo."];
  return slices.map(([x0, x1], i) => ({
    layout: "wide" as const,
    title: part("Diagrama de conexiones", i, slices.length),
    scale: "S/E",
    room: room.name,
    main: `<div class="fit">${slices.length > 1 ? sliceSvg(d.svg, x0, x1, d.height) : d.svg}</div>`,
    side: signalLegend(room.cables) + sideBlock("Notas", [...notes, ...(slices.length > 1 ? [i < slices.length - 1 ? "Los cables cortados en el borde derecho siguen en la lámina siguiente." : "Los cables cortados en el borde izquierdo vienen de la lámina anterior."] : [])].map((n) => `<p>${h(n)}</p>`).join("")),
  }));
}

function lengthCell(c: SheetCable): string {
  if (c.lengthKind === "estimated") return `<span class="est" title="${h(LENGTH_KIND_LABEL.estimated)}">≈ ${m1(c.lengthM)} m</span>`;
  return `${m1(c.lengthM)} m${c.lengthKind === "fixed" ? ` <span class="muted">(a mano)</span>` : ""}`;
}

/** Láminas: planilla de cables (con totales por tipo de cable en la columna lateral). */
export function schedulePages(cables: SheetCable[], room: string | null, opts: { withRoom?: boolean; geo?: SheetGeometry } = {}): SheetPage[] {
  const totals = cableTotals(cables);
  const totalsHtml = `<table class="tbl"><tr><th>Cable</th><th class="num">Cant.</th><th class="num">Metros</th></tr>${totals
    .map((t) => `<tr><td><span class="chip" style="background:${t.color}"></span>${h(t.cable)}</td><td class="num">${t.count}</td><td class="num">${t.estimated ? `<span class="est">≈ ${m1(t.meters)}</span>` : m1(t.meters)}</td></tr>`)
    .join("")}<tr><td><b>Total</b></td><td class="num"><b>${cables.length}</b></td><td class="num"><b>${m1(totalLength(cables))}</b></td></tr></table>`;
  const legend = `<p><b>${h(LENGTH_KIND_LABEL.plan)}</b>: recorrido dibujado en el plano, con subidas, bajadas, terminaciones y 10 % de reserva.</p><p><b>${h(LENGTH_KIND_LABEL.fixed)}</b>: largo cargado en el plano técnico.</p><p class="est"><b>≈ ${h(LENGTH_KIND_LABEL.estimated)}</b>: propuesta automática o tramo que sale de la sala; confirmar en obra.</p>`;
  const pages = chunk(cables, rowsFor(SCHEDULE_ROWS, opts.geo ?? A3));
  return pages.map((rows, i) => ({
    title: part("Planilla de cables", i, pages.length),
    scale: "S/E",
    room,
    main: `<table class="tbl"><tr><th>ID F501</th>${opts.withRoom ? "<th>Ambiente</th>" : ""}<th>Desde</th><th>Puerto</th><th>Hasta</th><th>Puerto</th><th>Señal</th><th>Cable</th><th class="num">Largo</th></tr>${rows
      .map(
        (c) =>
          `<tr><td class="mono"><b>${h(c.tag)}</b></td>${opts.withRoom ? `<td>${h(c.room ?? "")}</td>` : ""}<td>${h(c.fromDevice)}</td><td class="muted">${h(c.fromPort)}</td><td>${h(c.toDevice)}</td><td class="muted">${h(c.toPort)}</td><td><span class="chip" style="background:${c.color}"></span>${h(c.signal)}</td><td>${c.cable ? h(c.cable) : `<span class="muted">A definir</span>`}</td><td class="num">${lengthCell(c)}</td></tr>`,
      )
      .join("")}</table>${rows.length ? "" : `<p class="muted">Sin cables trazados.</p>`}`,
    side: sideBlock("Totales por tipo de cable", totalsHtml) + sideBlock("Largos", legend) + sideBlock("Identificación", `<p>${h(F501_SCHEME)}</p>`),
  }));
}

/** Cuántas etiquetas entran por lámina en la columna principal (columnas × filas). */
export function labelsPerSheet(variant: F501Variant, geo: SheetGeometry = A3): { cols: number; rows: number } {
  const v = F501_VARIANTS[variant];
  const cols = Math.max(1, Math.floor((geo.mainW - LABEL_PAD_MM + LABEL_GAP_MM) / (v.widthMm + LABEL_GAP_MM)));
  const rows = Math.max(1, Math.floor((geo.mainArea.h - LABEL_PAD_MM + 2 + LABEL_GAP_MM) / (v.heightMm + LABEL_GAP_MM)));
  return { cols, rows };
}

type Label = ReturnType<typeof cableLabels>[number];

/** Cara impresa de 51 × 25 mm: ID F501 grande, punta (A origen / B destino), dónde está y a dónde va. */
const labelFace = (l: Label, flip = false) =>
  `<div class="face${flip ? " flip" : ""}"><div class="stripe" style="background:${l.color}"></div><div class="lt"><div class="tag">${h(l.tag)}</div><div class="end">Punta ${l.end} · ${l.end === "A" ? "origen" : "destino"} · ${h(l.signal)}</div><div class="ln"><b>Acá:</b> ${h(l.here)} · ${h(l.herePort)}</div><div class="ln"><b>Va a:</b> ${h(l.there)} · ${h(l.therePort)}</div></div></div>`;

const labelHtml = (l: Label, variant: F501Variant) =>
  `<div class="label" style="height:${F501_VARIANTS[variant].heightMm}mm">${labelFace(l)}${variant === "bandera" ? labelFace(l, true) : variant === "autolaminable" ? `<div class="tail">zona transparente · envuelve el cable</div>` : ""}</div>`;

/**
 * Láminas: etiquetas F501 de 51 × 25 mm para imprimir, dos por cable (punta A
 * en el origen, B en el destino). Variantes: plana, bandera (dos caras para
 * doblar sobre el cable) y autolaminable (con cola transparente).
 */
export function labelPages(cables: SheetCable[], room: string | null, opts: { variant?: F501Variant; geo?: SheetGeometry } = {}): SheetPage[] {
  if (!cables.length) return [];
  const variant = opts.variant ?? "plana";
  const { cols, rows } = labelsPerSheet(variant, opts.geo ?? A3);
  const pages = chunk(cableLabels(cables), cols * rows);
  const v = F501_VARIANTS[variant];
  return pages.map((labels, i) => ({
    title: part("Etiquetas de cables F501", i, pages.length),
    scale: "S/E",
    room,
    main: `<div class="labels">${labels.map((l) => labelHtml(l, variant)).join("")}</div>`,
    side:
      sideBlock("Formato", `<p><b>${h(v.label)}</b> (ANSI/AVIXA F501.01).</p><p>${h(v.note)}</p><p>Imprimir al 100 % (sin ajustar a la hoja) y recortar por la línea punteada.</p>`) +
      sideBlock("Uso", `<p>Cada cable lleva dos etiquetas con el mismo ID: <b>A</b> en la punta de origen y <b>B</b> en la de destino, cerca del conector y legibles sin desconectar.</p><p>El color de la franja es el de la señal en el plano.</p>`) +
      sideBlock("Identificación", `<p>${h(F501_SCHEME)}</p>`),
  }));
}

export type EquipmentRow = { n: string; room?: string; brand: string; model: string; quantity: number; location: string; ports: PortsSource | null; note: string | null };

export const equipmentRows = (devices: SheetDevice[], room?: string): EquipmentRow[] =>
  devices.map((d) => ({ n: d.remote ? "R" : String(d.n), room, brand: d.brand, model: d.model, quantity: d.quantity, location: d.location, ports: d.ports, note: d.portsNote }));

/** Láminas: lista de equipos numerados (sin precios) y avisos de validación. */
export function equipmentPages(rows: EquipmentRow[], warnings: SheetWarning[], room: string | null, opts: { withRoom?: boolean; geo?: SheetGeometry } = {}): SheetPage[] {
  const listRows = rowsFor(LIST_ROWS, opts.geo ?? A3);
  const side = sideBlock(
    "Origen de los puertos",
    (["ficha", "pendiente", "generico"] as const).map((k) => `<p><span class="badge b-${k}">${PORTS_SOURCE_LABEL[k]}</span> ${k === "ficha" ? "puertos leídos de la ficha oficial." : k === "pendiente" ? "sin ficha validada: las conexiones no están confirmadas." : "equipo a definir; puertos típicos de su tipo."}</p>`).join(""),
  ) + sideBlock("Nota", `<p>Documento técnico sin precios. La cotización se envía por separado.</p>`);
  const table = (list: EquipmentRow[]) =>
    `<table class="tbl"><tr><th>N.º</th>${opts.withRoom ? "<th>Ambiente</th>" : ""}<th>Marca</th><th>Modelo</th><th class="num">Cant.</th><th>Ubicación</th><th>Puertos</th></tr>${list
      .map((r) => `<tr><td><b>${h(r.n)}</b></td>${opts.withRoom ? `<td>${h(r.room ?? "")}</td>` : ""}<td>${h(r.brand || "—")}</td><td>${h(r.model)}</td><td class="num">${r.quantity}</td><td>${h(r.location)}</td><td>${r.ports ? `<span class="badge b-${r.ports}">${PORTS_SOURCE_LABEL[r.ports]}</span>` : "—"}${r.note ? ` <span class="muted">${h(r.note)}</span>` : ""}</td></tr>`)
      .join("")}</table>`;
  const warnList = (list: SheetWarning[]) => `<ul class="warn-list">${list.map((w) => `<li class="${w.level}">${h(w.text)}</li>`).join("")}</ul>`;
  const noWarnings = `<p>Sin avisos pendientes: puertos, señales y largos verificados contra las fichas.</p>`;
  // Equipos y avisos en la misma lámina si entran; si no, los avisos van aparte.
  if (rows.length + warnings.length + 4 <= listRows) {
    return [{ title: "Equipos y avisos", scale: "S/E", room, main: `<div class="h2">Lista de equipos</div>${table(rows)}<div class="h2" style="margin-top:5mm">Avisos de validación</div>${warnings.length ? warnList(warnings) : noWarnings}`, side }];
  }
  const eq = chunk(rows, listRows);
  const wa = warnings.length ? chunk(warnings, listRows) : [];
  return [
    ...eq.map((list, i) => ({ title: part("Lista de equipos", i, eq.length), scale: "S/E", room, main: table(list), side })),
    ...wa.map((list, i) => ({ title: part("Avisos de validación", i, wa.length), scale: "S/E", room, main: warnList(list), side })),
  ];
}

/** Lámina: vistas 3D capturadas en el editor. */
export function snapshotsPage(snapshots: Array<{ label: string; dataUrl: string }>, room: string | null): SheetPage | null {
  if (!snapshots.length) return null;
  return {
    title: "Vistas 3D",
    scale: "S/E",
    room,
    main: `<div class="shots">${snapshots.map((s) => `<figure style="margin:0"><img src="${h(s.dataUrl)}" alt=""/><figcaption class="muted">${h(s.label)}</figcaption></figure>`).join("")}</div>`,
    side: sideBlock("Notas", `<p>Vistas ilustrativas del diseño; las medidas valen en el plano a escala.</p>`),
  };
}
