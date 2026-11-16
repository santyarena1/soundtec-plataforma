/**
 * Lámina "Mapa de sonido" de una sala: mapa de SPL y de STI a escala sobre la
 * planta, resultados contra los objetivos del uso, RT60 por banda, método y
 * supuestos estimados. Mismo motor que el editor (acoustics/*), con los
 * parlantes, la amplificación y los materiales guardados en la escena.
 * Sin parlantes de rango completo en la sala no hay lámina.
 */

import { loadRoomCables } from "@/services/room-builder/cable-list-db";
import { getRoomProject } from "@/services/room-builder/project-service";
import { RT_BANDS, USE_TARGETS, MATERIALS, SURFACE_LABEL, FURNISHING, type Surface } from "@/services/room-builder/acoustics/materials";
import { resolveAcoustics } from "@/services/room-builder/acoustics/settings";
import { polygonAreaPerimeter } from "@/services/room-builder/acoustics/reverb";
import { sceneSoundMap } from "@/services/room-builder/acoustics/scene-sources";
import type { SoundMapResult } from "@/services/room-builder/acoustics/sound-map";
import { soundMapScale, soundMapSvg } from "@/services/room-builder/acoustics/sound-map-svg";
import { stiRating } from "@/services/room-builder/acoustics/sti";
import { scaleLabel } from "@/services/room-builder/sheets/scale";
import { sheetGeometry, type SheetGeometry } from "@/services/room-builder/sheets/sheet-format";
import { floorOf } from "@/services/room-builder/wiring/plan-geometry";
import { h, sideBlock, type SheetPage } from "./sheet-html";

const fmt = (n: number, d = 1) => n.toFixed(d).replace(".", ",");
const STATUS: Record<string, string> = { ok: "#16a34a", warn: "#f59e0b", fail: "#dc2626", na: "#94a3b8" };
/** Supuestos que entran en la columna lateral (el resto se cuenta). */
const MAX_ESTIMATES = 7;
/** Alto de la franja del método debajo de los mapas (mm). */
const METHOD_BAND_MM = 16;

const METHOD = [
  "Directo: Lp = S + 10·log W − 20·log d − A(θ) − aire; A(θ) desde la cobertura de ficha (−6 dB en el borde).",
  "Reverberante: Lw + 10·log(4/R), R = constante de sala con RT60 de Eyring por banda (materiales, personas, muebles y aire ISO 9613-1).",
  "STI: método indirecto MTF (Houtgast-Steeneken, IEC 60268-16) con directo/reverberante, ruido NC y enmascaramiento simplificado, a nivel de operación.",
  "Uniformidad: ± mitad del rango en el área de audiencia (0,5 m de las paredes), banda ancha; AVIXA A102 la mide por bandas.",
];

function resultsTable(r: SoundMapResult): string {
  const rows = r.checks
    .map((c) => `<tr><td><span class="chip" style="background:${STATUS[c.status]};border-radius:50%"></span>${h(c.label)}</td><td class="num"><b>${h(c.value)}</b></td><td class="num muted">${h(c.target)}</td></tr>`)
    .join("");
  const st = r.stats;
  const extra = st
    ? `<tr><td>SPL mín / máx</td><td class="num">${fmt(st.splMin)} / ${fmt(st.splMax)} dB</td><td></td></tr><tr><td>Uniformidad del directo</td><td class="num">±${fmt(st.directUniformityDb)} dB</td><td></td></tr><tr><td>STI mínimo</td><td class="num">${fmt(st.stiMin, 2)} (${stiRating(st.stiMin)})</td><td></td></tr>`
    : "";
  return `<table class="tbl"><tr><th>Resultado</th><th class="num">Valor</th><th class="num">Objetivo</th></tr>${rows}${extra}</table>`;
}

function rtTable(r: SoundMapResult): string {
  const bands = r.reverb.filter((b) => (RT_BANDS as readonly number[]).includes(b.hz));
  const head = bands.map((b) => `<th class="num">${b.hz >= 1000 ? `${b.hz / 1000}k` : b.hz}</th>`).join("");
  const row = (k: "eyring" | "sabine", label: string) => `<tr><td>${label}</td>${bands.map((b) => `<td class="num">${fmt(b[k], 2)}</td>`).join("")}</tr>`;
  return `<table class="tbl"><tr><th>RT60 (s)</th>${head}</tr>${row("eyring", "<b>Eyring</b>")}${row("sabine", "Sabine")}</table>`;
}

/** Lámina del mapa de sonido de una sala (null si no tiene parlantes). */
export async function soundMapPage(spaceId: string, roomName: string, opts: { geo?: SheetGeometry } = {}): Promise<SheetPage | null> {
  const project = await getRoomProject(spaceId);
  if (!project || project.kind === "hub") return null;
  const loaded = await loadRoomCables(project);
  if (!loaded) return null;
  const { scene, profile, list } = loaded;
  const result = sceneSoundMap(scene, project.category, profile, list.plan?.amplification ?? null);
  if (!result.sources.length) return null;

  const geo = opts.geo ?? sheetGeometry("a3");
  const floor = floorOf(scene);
  // Los dos mapas comparten la columna principal; abajo, una franja con el método.
  const half = { w: geo.mainArea.w, h: Math.floor((geo.mainArea.h - METHOD_BAND_MM) / 2) };
  const scale = soundMapScale(floor, half);
  const method = `<div style="font-size:6.3pt;line-height:1.3;color:#475569;padding:0 4mm"><b>Método.</b> ${METHOD.map(h).join(" ")} ${h(USE_TARGETS[result.use].source)}. Predicción de diseño: no reemplaza la medición en obra.</div>`;
  const main = `<div class="plan">${soundMapSvg(result, "spl", floor, half, scale.denominator)}${soundMapSvg(result, "sti", floor, half, scale.denominator)}</div>${method}`;

  const s = resolveAcoustics(project.category, scene.acoustics, polygonAreaPerimeter(floor).area);
  const room = `<p>${fmt(result.areaM2)} m² · ${fmt(result.volumeM3, 0)} m³ · oído a ${fmt(result.earM)} m · ruido NC-${result.nc} (≈ ${fmt(result.noiseDbA, 0)} dBA) · ${s.people} personas · ${h(FURNISHING[s.furnishing].label.toLowerCase())}.</p>${(Object.keys(SURFACE_LABEL) as Surface[])
    .map((k) => `<p><b>${h(SURFACE_LABEL[k])}:</b> ${h(MATERIALS[s.materials[k]].label)}</p>`)
    .join("")}`;
  // Parlantes agrupados por modelo (los números de unidad son los del mapa).
  const groups = new Map<string, { n: number[]; sens: number; watts: number[] }>();
  result.sources.forEach((src, i) => {
    const key = src.label.replace(/ \(\d+\)$/, "");
    const g = groups.get(key) ?? { n: [], sens: src.sensitivityDb, watts: [] };
    g.n.push(i + 1);
    g.watts.push(src.watts);
    groups.set(key, g);
  });
  const watt = (ws: number[]) => { const lo = Math.min(...ws); const hi = Math.max(...ws); return lo === hi ? `${fmt(lo, lo < 1 ? 2 : 1)} W` : `${fmt(lo, 1)}–${fmt(hi, 1)} W`; };
  const speakers = [...groups].map(([label, g]) => `<p><b>${g.n.length > 1 ? `${g.n[0]}–${g.n[g.n.length - 1]}` : g.n[0]}</b> ${h(label)} ×${g.n.length} · ${fmt(g.sens, 0)} dB 1 W/1 m · ${watt(g.watts)}</p>`);
  const shown = result.estimates.slice(0, MAX_ESTIMATES).map((e) => `<li>${h(e)}</li>`).join("");
  const more = result.estimates.length > MAX_ESTIMATES ? `<li>… y ${result.estimates.length - MAX_ESTIMATES} más (ver Mapa de sonido en el editor).</li>` : "";

  return {
    title: "Mapa de sonido",
    scale: scaleLabel(scale),
    room: roomName,
    main,
    side:
      sideBlock(`Resultados · ${USE_TARGETS[result.use].label}`, resultsTable(result)) +
      sideBlock("Reverberación", rtTable(result)) +
      sideBlock("Sala", room) +
      sideBlock("Parlantes", speakers.join("")) +
      sideBlock("Supuestos (datos estimados)", `<ul class="warn-list">${shown}${more}</ul>`),
  };
}
