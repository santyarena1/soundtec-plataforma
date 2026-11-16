/**
 * Exportaciones de un proyecto o ambiente, para el panel y para el enlace del
 * cliente: CSV de lista de materiales (equipos y cables), CSV de planilla de
 * cables con los ID F501 y los dibujos (plano y diagrama en SVG) que el
 * navegador pasa a PNG con una cartela mínima. Salen de los mismos datos que
 * las láminas (loadRoomSheet), con la marca de getCompanyIdentity y la
 * revisión vigente. Los precios solo se suman en el panel y si se piden.
 */

import { prisma } from "@/lib/prisma";
import { uniqueRoomCodes } from "@/services/room-builder/project-technical";
import { cartelaRevision } from "@/services/room-builder/revisions";
import { salePricesFor } from "@/services/room-builder/sale-prices";
import { bomCsv, cableScheduleCsv, type BomItem, type CsvMeta } from "@/services/room-builder/exports/csv";
import { F501_SCHEME } from "@/services/room-builder/sheets/f501";
import { cableTotals, LENGTH_KIND_LABEL } from "@/services/room-builder/sheets/sheet-model";
import { brandIdentity } from "./proposal-pdf";
import { webPlanSvg } from "./public-project";
import { loadRevisions } from "./revisions";
import { loadRoomSheet, type RoomSheet } from "./sheets/room-sheet";

type ExportRoom = RoomSheet & { unitCount: number };

type Bundle = { name: string; client: string | null; rooms: ExportRoom[]; revision: { code: string; status: string }; date: string };

const today = () => new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });

async function loadBundle(projectId: string): Promise<Bundle> {
  const project = await prisma.roomProject.findUnique({
    where: { id: projectId },
    select: { name: true, kind: true, unitCount: true, client: { select: { companyName: true } }, parent: { select: { name: true, client: { select: { companyName: true } } } }, children: { select: { id: true, name: true, unitCount: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!project) throw new Error("Proyecto no encontrado");
  const list = project.kind === "hub" ? project.children : [{ id: projectId, name: project.name, unitCount: project.unitCount }];
  // Mismos códigos de ambiente que la planilla del proyecto: los ID F501 coinciden con las láminas.
  const codes = project.kind === "hub" ? uniqueRoomCodes(list.map((r) => r.name)) : null;
  const [rooms, revs] = await Promise.all([
    Promise.all(
      list.map((r, i) =>
        loadRoomSheet(r.id, codes ? { tagPrefix: codes[i] } : {})
          .then((sheet) => ({ ...sheet, unitCount: Math.max(1, r.unitCount || 1) }))
          .catch((error: unknown) => {
            console.error(`[room-builder/exports] ambiente ${r.id}`, error);
            return null;
          }),
      ),
    ),
    loadRevisions(projectId),
  ]);
  return {
    name: project.kind === "hub" ? project.name : (project.parent?.name ?? project.name),
    client: project.client?.companyName ?? project.parent?.client?.companyName ?? null,
    rooms: rooms.filter((r): r is ExportRoom => Boolean(r)),
    revision: cartelaRevision(revs.list),
    date: today(),
  };
}

async function csvMeta(b: Bundle, title: string, origin?: string): Promise<CsvMeta> {
  const brand = await brandIdentity(origin);
  return { brand: brand.company, title, project: b.name, client: b.client, revision: b.revision, date: b.date };
}

const roomLabel = (r: ExportRoom) => (r.unitCount > 1 ? `${r.name} (× ${r.unitCount})` : r.name);

/** Renglones de la lista de materiales: equipos de cada ambiente, el rack central una vez y los cables por tipo. */
function bomItems(rooms: ExportRoom[]): BomItem[] {
  const items: BomItem[] = [];
  const central = new Map<string, BomItem>();
  for (const r of rooms) {
    for (const d of r.devices) {
      if (d.remote) {
        // El rack central alimenta varios ambientes: va una sola vez.
        const key = d.productId ?? d.model;
        if (!central.has(key)) central.set(key, { room: "Rack central", kind: "equipo", n: "R", brand: d.brand, model: d.model, quantity: d.quantity, priceUsd: null, productId: d.productId });
        continue;
      }
      items.push({ room: roomLabel(r), kind: "equipo", n: String(d.n), brand: d.brand, model: d.model, quantity: d.quantity * r.unitCount, priceUsd: null, productId: d.productId });
    }
  }
  items.push(...central.values());
  for (const r of rooms) {
    for (const t of cableTotals(r.cables)) items.push({ room: roomLabel(r), kind: "cable", n: "", brand: "", model: t.estimated ? `${t.cable} (largo estimado)` : t.cable, quantity: t.count * r.unitCount, meters: Math.round(t.meters * r.unitCount * 10) / 10 });
  }
  return items;
}

/** CSV de lista de materiales. `prices` solo desde el panel con permiso de ver precios de venta. */
export async function exportBomCsv(projectId: string, opts: { prices: boolean; origin?: string }): Promise<{ csv: string; name: string }> {
  const b = await loadBundle(projectId);
  const base = bomItems(b.rooms);
  const prices = opts.prices ? await salePricesFor(base.map((it) => it.productId).filter((id): id is string => Boolean(id))) : null;
  const items = prices ? base.map((it) => ({ ...it, priceUsd: it.productId ? (prices.get(it.productId) ?? null) : null })) : base;
  return { csv: bomCsv(items, await csvMeta(b, "Lista de materiales", opts.origin), { prices: opts.prices }), name: b.name };
}

/** CSV de la planilla de cables con los ID F501 (los mismos de las láminas y las etiquetas). */
export async function exportCablesCsv(projectId: string, origin?: string): Promise<{ csv: string; name: string }> {
  const b = await loadBundle(projectId);
  const rows = b.rooms.flatMap((r) =>
    r.cables.map((c) => ({ id: c.tag, room: roomLabel(r), from: c.fromDevice, fromPort: c.fromPort, to: c.toDevice, toPort: c.toPort, signal: c.signal, cable: c.cable, lengthM: c.lengthM, lengthKind: LENGTH_KIND_LABEL[c.lengthKind] })),
  );
  return { csv: cableScheduleCsv(rows, await csvMeta(b, "Planilla de cables", origin), F501_SCHEME), name: b.name };
}

export type ExportDrawings = {
  project: string;
  client: string | null;
  revision: { code: string; status: string };
  date: string;
  brand: { name: string; web: string; phone: string; logoUrl: string; color: string };
  rooms: Array<{ id: string; name: string; planSvg: string | null; diagramSvg: string | null }>;
};

/** Plano y diagrama de cada ambiente en SVG con los datos de la cartela mínima del PNG. */
export async function exportDrawings(projectId: string): Promise<ExportDrawings> {
  const [b, brand] = await Promise.all([loadBundle(projectId), brandIdentity()]);
  return {
    project: b.name,
    client: b.client,
    revision: b.revision,
    date: b.date,
    brand: { name: brand.company.name, web: brand.company.web, phone: brand.company.phone, logoUrl: brand.logoUrl, color: brand.color },
    rooms: b.rooms.map((r) => ({ id: r.id, name: r.name, planSvg: webPlanSvg(r), diagramSvg: r.diagram?.svg ?? null })),
  };
}
