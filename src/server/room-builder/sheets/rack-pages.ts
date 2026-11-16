/**
 * Lámina "Rack": el frente del rack a escala con la referencia de cada bloque
 * (U, alto, consumo) y, en la columna lateral, el resumen de energía y calor,
 * la PDU y la ventilación recomendadas, los avisos y los criterios usados. La
 * planilla de consumo por equipo va debajo del dibujo si entra; si no, en una
 * lámina aparte. Sirve para la sala y para el proyecto (rack central y racks
 * de cada ambiente).
 */

import { buildRack, type RackModel } from "@/services/room-builder/rack/rack-elevation";
import { projectRackInputs, roomRackInput } from "@/services/room-builder/rack/rack-db";
import { POWER_KIND_LABEL } from "@/services/room-builder/rack/rack-power";
import { rackElevationSvg } from "@/services/room-builder/sheets/rack-elevation-svg";
import { sheetGeometry, type SheetGeometry } from "@/services/room-builder/sheets/sheet-format";
import { h, sideBlock, type SheetPage } from "./sheet-html";

/** Alto de un renglón de la planilla (mm) y encabezado + márgenes. */
const ROW_MM = 4.4;
const TABLE_EXTRA_MM = 14;
/** Ancho de la columna de referencias del dibujo (mm). */
const LABELS_MM = 120;

const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });

function powerTable(model: RackModel): string {
  const p = model.power;
  return `<div class="h2">Consumo y calor por equipo</div><table class="tbl"><tr><th>Equipo</th><th>U</th><th class="num">W</th><th class="num">BTU/h</th><th>Dato</th></tr>${p.rows
    .map(
      (r) =>
        `<tr><td>${h([r.brand, r.name].filter(Boolean).join(" "))}</td><td class="muted">${h(r.u)}</td><td class="num">${r.kind === "poe" ? "PoE" : r.kind === "estimado" ? `<span class="est">≈ ${fmt(r.watts)}</span>` : fmt(r.watts)}</td><td class="num">${fmt(r.heatBtu)}</td><td class="muted">${r.kind === "poe" ? "Del switch" : POWER_KIND_LABEL[r.kind]}${r.note ? ` · ${h(r.note)}` : ""}</td></tr>`,
    )
    .join("")}<tr><td><b>Total</b></td><td></td><td class="num"><b>${fmt(p.totalW)}</b></td><td class="num"><b>${fmt(p.heatBtu)}</b></td><td class="muted">${p.estimatedW ? `≈ ${fmt(p.estimatedW)} W estimados` : ""}</td></tr></table>`;
}

function side(model: RackModel): string {
  const p = model.power;
  const kv = (k: string, v: string) => `<div class="leg"><span style="flex:1" class="muted">${h(k)}</span><b>${h(v)}</b></div>`;
  const summary =
    kv("Rack sugerido", `${model.sizeU}U · 19"`) +
    kv("Ocupado / libre", `${model.usedU}U / ${model.freeU}U (${Math.round(model.reserve * 100)} %)`) +
    (model.depthCm ? kv("Fondo útil mínimo", `${model.depthCm} cm`) : "") +
    (model.weightKg ? kv("Peso de equipos", `${model.weightEstimated ? "≥ " : ""}${fmt(model.weightKg)} kg`) : "");
  const energy =
    kv("Consumo", `${fmt(p.totalW)} W`) +
    kv("Corriente a 220 V", `${fmt(p.amps)} A`) +
    kv("Tomas usadas", String(p.outlets)) +
    kv("Calor en el rack", `${fmt(p.heatBtu)} BTU/h`) +
    (p.poeOutsideW || p.poeInRackW ? kv("PoE desde el switch", `${fmt(p.poeOutsideW + p.poeInRackW)} W${p.poeBudgetW ? ` de ${fmt(p.poeBudgetW)} W` : ""}`) : "");
  const reco = `<p><b>PDU:</b> ${p.pdu.outlets} tomas, ${p.pdu.amps} A${p.pdu.vertical ? ", vertical 0U atrás" : ", 1U al fondo"}${p.pdu.circuits > 1 ? `, ${p.pdu.circuits} circuitos` : ""}.</p><p><b>Ventilación:</b> ${h(p.ventilation.text)}</p>${model.info.map((t) => `<p class="muted">${h(t)}</p>`).join("")}`;
  const warn = model.warnings.length ? sideBlock("Avisos", `<ul class="warn-list">${model.warnings.map((w) => `<li class="warn">${h(w)}</li>`).join("")}</ul>`) : "";
  return sideBlock("Rack", summary) + sideBlock("Energía", energy) + sideBlock("Recomendación", reco) + warn + sideBlock("Criterios", model.notes.map((n) => `<p class="muted">${h(n)}</p>`).join(""));
}

/** Láminas de un rack (vacío: ninguna). */
export function rackPages(model: RackModel, room: string | null, geo: SheetGeometry = sheetGeometry("a3")): SheetPage[] {
  if (model.empty) return [];
  const area = geo.mainArea;
  const tableH = model.power.rows.length * ROW_MM + TABLE_EXTRA_MM;
  // Si la planilla entra debajo del dibujo con la escala de detalle, va en la misma lámina.
  const together = rackElevationSvg(model, { maxHeightMm: area.h - tableH, labelsMm: LABELS_MM });
  const fitsTogether = together.heightMm + tableH <= area.h && together.scale <= 10;
  const drawing = fitsTogether ? together : rackElevationSvg(model, { maxHeightMm: area.h - 4, labelsMm: LABELS_MM });
  const title = model.scope === "central" ? "Rack central" : "Rack";
  const main = `<div style="width:${Math.min(area.w, drawing.widthMm)}mm">${drawing.svg}</div>`;
  const first: SheetPage = { title: fitsTogether ? title : `${title} · frente`, scale: `1:${drawing.scale}`, room, main: fitsTogether ? `${main}<div style="margin-top:3mm">${powerTable(model)}</div>` : main, side: side(model) };
  if (fitsTogether) return [first];
  return [first, { title: `${title} · consumo y calor`, scale: "S/E", room, main: powerTable(model), side: side(model) }];
}

/** Láminas del rack de una sala. */
export async function roomRackPages(projectId: string, room: string | null, geo?: SheetGeometry): Promise<SheetPage[]> {
  const input = await roomRackInput(projectId);
  return input ? rackPages(buildRack(input), room, geo) : [];
}

/** Láminas de los racks del proyecto: el central y el de cada ambiente con equipos de rack. */
export async function projectRackPages(hubId: string, geo?: SheetGeometry): Promise<SheetPage[]> {
  const inputs = await projectRackInputs(hubId);
  return inputs.flatMap((input) => rackPages(buildRack(input), input.scope === "central" ? null : input.title.replace(/^Rack · /, ""), geo));
}
