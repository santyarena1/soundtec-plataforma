/**
 * Juego de láminas del proyecto completo: planta general por piso (ambientes,
 * rack central y troncales), plano a escala y diagrama de cada ambiente,
 * planilla de cables y etiquetas de toda la obra, y lista de equipos con el
 * rack central. La planta general sale de projectTechnical (lo mismo que se
 * ve en la vista técnica del proyecto).
 */

import { prisma } from "@/lib/prisma";
import { projectTechnical, roomCode, type ProjectFloor } from "@/services/room-builder/project-technical";
import { drawableArea, projectFloorExtent, projectFloorSvg, type FloorRoomInput, type ProjectFloorInput } from "@/services/room-builder/sheets/plan-sheet-svg";
import { pickScale, scaleLabel } from "@/services/room-builder/sheets/scale";
import type { SheetWarning } from "@/services/room-builder/sheets/sheet-model";
import { h, lineSample, MAIN_AREA_MM, sideBlock, type SheetPage } from "./sheet-html";
import { diagramPages, equipmentPages, equipmentRows, labelPages, planPage, schedulePages, type EquipmentRow } from "./sheet-pages";
import { loadRoomSheet, type RoomSheet } from "./room-sheet";

/** Planta esquemática de la pantalla (px por metro y acomodo automático): se replica para ubicar igual los ambientes. */
const S = 40;
const HEADER = 26;
const MARGIN = 60;
const RACK_COL = 200;
const GAP = 48;
const ROW_W = 1400;
const LEVELS = ["Subsuelo", "Planta baja", "Primer piso", "Segundo piso", "Tercer piso", "Terraza / exterior"];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 1;
};

type FloorRoom = ProjectFloor["rooms"][number];

const toInput = (r: FloorRoom, x0: number, z0: number): FloorRoomInput => ({
  name: r.name,
  x0,
  z0,
  widthM: r.widthM,
  depthM: r.depthM,
  devices: r.devices.map((d) => ({ x: d.x, z: d.z, role: d.role })),
  wires: r.wires.map((w) => ({ color: w.color, points: w.pts })),
  exit: r.exit,
  trunk: Object.values(r.trunk).reduce((a, n) => a + n, 0),
});

/**
 * Ambientes de un piso en metros. Con plano subido, la escala sale de las
 * medidas de los ambientes sobre la imagen; sin plano, de la planta
 * esquemática (cada ambiente a escala, la ubicación entre ellos es indicativa).
 */
function floorLayout(floor: ProjectFloor, rooms: FloorRoom[], imageHref: string | null): { input: Omit<ProjectFloorInput, "areaMm" | "scale">; planMode: boolean } {
  const image = floor.image;
  if (image && rooms.length && rooms.every((r) => r.box)) {
    const W = image.widthPx;
    const H = image.heightPx;
    const ppm = median(rooms.flatMap((r) => [((r.box!.x1 - r.box!.x0) * W) / Math.max(0.5, r.widthM), ((r.box!.y1 - r.box!.y0) * H) / Math.max(0.5, r.depthM)]));
    const placed = rooms.map((r) => toInput(r, (((r.box!.x0 + r.box!.x1) / 2) * W) / ppm - r.widthM / 2, (((r.box!.y0 + r.box!.y1) / 2) * H) / ppm - r.depthM / 2));
    const rack = floor.rack ?? { u: 0.05, v: 0.5 };
    return {
      planMode: true,
      input: { rooms: placed, rack: { x: (rack.u * W) / ppm, z: (rack.v * H) / ppm }, image: imageHref ? { href: imageHref, x0: 0, z0: 0, widthM: W / ppm, depthM: H / ppm } : null },
    };
  }
  let x = MARGIN + RACK_COL;
  let y = MARGIN;
  let rowH = 0;
  const placed = rooms.map((r) => {
    const w = Math.max(3, r.widthM) * S;
    const hgt = Math.max(3, r.depthM) * S + HEADER;
    if (x + w > ROW_W && x > MARGIN + RACK_COL) {
      x = MARGIN + RACK_COL;
      y += rowH + GAP;
      rowH = 0;
    }
    const pos = r.pos ?? { x, y };
    x += w + GAP;
    rowH = Math.max(rowH, hgt);
    return toInput(r, pos.x / S, (pos.y + HEADER) / S);
  });
  const rack = floor.rack ? { x: floor.rack.u / S, z: floor.rack.v / S } : { x: (MARGIN + 60) / S, z: (MARGIN + 90) / S };
  return { planMode: false, input: { rooms: placed, rack, image: null } };
}

async function planImageHref(hubId: string): Promise<string | null> {
  const img = await prisma.roomPlanImage.findUnique({ where: { roomProjectId: hubId }, select: { data: true, mimeType: true } });
  return img ? `data:${img.mimeType};base64,${Buffer.from(img.data).toString("base64")}` : null;
}

/** Láminas de planta general: una por piso. */
function floorPages(floor: ProjectFloor, imageHref: string | null): SheetPage[] {
  const levels = [...new Set(floor.rooms.map((r) => r.level))].sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b));
  return levels.map((level) => {
    const rooms = floor.rooms.filter((r) => r.level === level);
    const { input, planMode } = floorLayout(floor, rooms, imageHref);
    const ext = projectFloorExtent(input);
    const scale = pickScale(ext, drawableArea(MAIN_AREA_MM));
    const svg = projectFloorSvg({ ...input, areaMm: MAIN_AREA_MM, scale: scale.denominator });
    const list = rooms
      .map((r) => `<div class="leg"><span style="flex:1">${h(r.name)}</span><span class="muted">${r.devices.length} eq. · ${Object.values(r.trunk).reduce((a, n) => a + n, 0)} al rack${r.trunkMeters ? ` · ≈ ${r.trunkMeters} m` : ""}</span></div>`)
      .join("");
    const notes = [
      planMode ? "Ambientes ubicados sobre el plano del cliente; la escala se deduce de las medidas de cada ambiente (aproximada)." : "Planta esquemática: cada ambiente está a escala, pero su ubicación relativa es indicativa (no hay plano del edificio).",
      "Troncales al rack trazadas en recorrido ortogonal de referencia: el largo final depende del recorrido de obra.",
      scale.normalized ? null : "La planta no entra a 1:100: se usó una escala mayor fuera de la serie normalizada.",
    ].filter(Boolean);
    return {
      title: levels.length > 1 ? `Planta general · ${level}` : "Planta general",
      scale: scaleLabel(scale),
      room: null,
      main: `<div class="plan">${svg}</div>`,
      side:
        sideBlock("Ambientes", list) +
        sideBlock("Referencias", `<div class="leg">${lineSample("#1e3553", true)}<span>Troncal hacia el rack central</span></div><div class="leg"><b style="background:#1e3553;color:#fff;padding:0 1.2mm">R</b><span>Rack central</span></div>`) +
        sideBlock("Notas", notes.map((n) => `<p>${h(n!)}</p>`).join("")),
    };
  });
}

/** Láminas del proyecto completo. */
export async function projectSheetPages(hubId: string): Promise<{ pages: SheetPage[]; rooms: RoomSheet[] }> {
  const hub = await prisma.roomProject.findUnique({ where: { id: hubId }, select: { children: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } } } });
  const children = hub?.children ?? [];
  const prefixes = uniqueRoomCodes(children.map((c) => c.name));
  // La planta general y los ambientes se leen en paralelo (cada uno hace varias consultas).
  const [tech, rooms] = await Promise.all([
    projectTechnical(hubId),
    Promise.all(
      children.map((child, i) =>
        // Un ambiente con la escena rota no frena el juego: queda fuera y se avisa.
        loadRoomSheet(child.id, { tagPrefix: prefixes[i] }).catch((error: unknown) => {
          console.error(`[room-builder/sheets] ambiente ${child.id}`, error);
          return emptyRoom(child.id, child.name);
        }),
      ),
    ),
  ]);
  const usesImage = Boolean(tech.floor.image && tech.floor.rooms.length && tech.floor.rooms.every((r) => r.box));
  const pages: SheetPage[] = [...floorPages(tech.floor, usesImage ? await planImageHref(hubId) : null)];
  for (const room of rooms) {
    if (!room.walls.length) continue;
    pages.push(planPage(room), ...diagramPages(room));
  }
  const cables = rooms.flatMap((r) => r.cables.map((c) => ({ ...c, room: r.name })));
  pages.push(...schedulePages(cables, null, { withRoom: true }), ...labelPages(cables, null));

  // Equipos: los de cada ambiente (numerados por ambiente) y el rack central del proyecto.
  const remote = rooms.flatMap((r) => r.devices.filter((d) => d.remote));
  const central: EquipmentRow[] = tech.equipment
    .filter((e) => e.room === "Rack central")
    .map((e, i) => {
      const seen = remote.find((d) => d.productId && d.productId === e.productId);
      return { n: `R${i + 1}`, room: "Rack central", brand: e.brand ?? "", model: e.name, quantity: e.quantity, location: "Rack central", ports: e.generic ? "generico" : (seen?.ports ?? null), note: seen?.portsNote ?? (e.generic ? "Equipo genérico: modelo a definir" : null) };
    });
  const rows = [...rooms.flatMap((r) => equipmentRows(r.devices.filter((d) => !d.remote), r.name)), ...central];
  const warnings: SheetWarning[] = rooms.flatMap((r) => r.warnings.map((w) => ({ ...w, text: `${r.name} · ${w.text}` })));
  pages.push(...equipmentPages(rows, dedupe(warnings), null, { withRoom: true }));
  return { pages, rooms };
}

/**
 * Código de cada ambiente para las etiquetas, sin repetir: "Dormitorio
 * principal" y "Dormitorio 2" darían los dos "DOR" y habría dos cables con la
 * misma etiqueta en obra; el segundo pasa a "DOR2".
 */
export function uniqueRoomCodes(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((name) => {
    const base = roomCode(name);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}${n}`;
  });
}

/** Los avisos de los equipos del rack central se repiten en cada ambiente: van una sola vez. */
function dedupe(list: SheetWarning[]): SheetWarning[] {
  const seen = new Set<string>();
  return list.filter((w) => {
    const key = w.text.replace(/^[^·]+· /, "");
    if (key.startsWith("R ·") && seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyRoom(id: string, name: string): RoomSheet {
  return { id, name, category: "", hubName: null, clientName: null, dims: { widthM: 0, depthM: 0, heightM: 0 }, source: "none", floor: [], walls: [], furniture: [], exit: null, devices: [], cables: [], diagram: null, warnings: [{ level: "error", text: "No se pudo leer el ambiente (escena inválida)." }] };
}
