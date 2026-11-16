/**
 * Láminas técnicas en PDF (A3 apaisado por defecto; también Tabloid y
 * ARCH D), con cartela en cada hoja: revisión vigente y estado de emisión, y
 * la tabla de revisiones en la primera.
 * Sala: plano a escala, diagrama de conexiones, planilla de cables,
 * etiquetas F501, equipos con avisos y, si vienen, las vistas 3D del editor.
 * Proyecto completo: planta general, cada ambiente, planilla, etiquetas y
 * equipos de toda la obra. Mismo motor de PDF que las cotizaciones.
 */

import { htmlToPdf } from "@/lib/html-to-pdf";
import { getCompanyIdentity, QUOTE_CORPORATE_ASSETS } from "@/lib/quote-defaults";
import { resolveAssetSrc } from "@/lib/quote-document-html";
import { getRoomProject } from "@/services/room-builder/project-service";
import { cartelaRevision, revisionTableRows } from "@/services/room-builder/revisions";
import type { F501Variant } from "@/services/room-builder/sheets/f501";
import { sheetGeometry, type SheetFormatKey } from "@/services/room-builder/sheets/sheet-format";
import { renderSheetsHtml, type SheetMeta, type SheetPage } from "./sheets/sheet-html";
import { diagramPages, equipmentPages, equipmentRows, labelPages, planPage, schedulePages, snapshotsPage } from "./sheets/sheet-pages";
import { loadRoomSheet } from "./sheets/room-sheet";
import { projectSheetPages } from "./sheets/project-sheets";
import { soundMapPage } from "./sheets/sound-sheet";
import { roomRackPages } from "./sheets/rack-pages";
import { loadRevisions } from "./revisions";

export type Snapshot = { label: string; dataUrl: string };

/** Formato de hoja y variante de etiquetas elegidos al descargar. */
export type SheetOptions = { format?: SheetFormatKey; labels?: F501Variant };

/** Marca de Soundtec sin márgenes (la misma de las tarjetas al compartir). */
const CARTELA_LOGO = "/landing/logo_soundtec.png";

/** Marca de la empresa para las salidas (cartela, CSV, PNG): getCompanyIdentity con el logo de cartela. */
export async function brandIdentity(origin?: string) {
  const identity = await getCompanyIdentity();
  return {
    company: { name: identity.name, address: identity.address, phone: identity.phone, email: identity.email, web: identity.web },
    // El logo de fábrica de las cotizaciones es una franja ancha: en la cartela va la marca sola.
    logo: await resolveAssetSrc(identity.logoUrl === QUOTE_CORPORATE_ASSETS.logo ? CARTELA_LOGO : identity.logoUrl, origin),
    /** Logo como URL (sin pasar a data:), para el navegador. */
    logoUrl: identity.logoUrl === QUOTE_CORPORATE_ASSETS.logo ? CARTELA_LOGO : identity.logoUrl,
    color: identity.primary || "#1e3553",
  };
}

async function sheetMeta(projectId: string, project: string, client: string | null, origin: string | undefined, format: SheetFormatKey): Promise<SheetMeta> {
  const [brand, revs] = await Promise.all([brandIdentity(origin), loadRevisions(projectId)]);
  const rev = cartelaRevision(revs.list);
  return {
    docTitle: "Láminas técnicas",
    project,
    client,
    company: brand.company,
    logo: brand.logo,
    color: brand.color,
    date: new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }),
    revision: rev.code,
    revisionStatus: rev.status,
    revisions: revisionTableRows(revs.list),
    format,
  };
}

/** Nombre de archivo con el nombre del proyecto (ASCII para el encabezado; el UTF-8 va aparte). */
export function sheetsFileName(name: string): { ascii: string; utf8: string } {
  const base = `Laminas_${name}`;
  const ascii = base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\-]+/g, "_").replace(/_+/g, "_");
  return { ascii: `${ascii}.pdf`, utf8: `Láminas ${name}.pdf` };
}

export async function buildProposalHtml(projectId: string, snapshots: Snapshot[], origin?: string, opts: SheetOptions = {}): Promise<{ html: string; name: string }> {
  const project = await getRoomProject(projectId);
  if (!project) throw new Error("Proyecto no encontrado");
  const format = opts.format ?? "a3";
  const geo = sheetGeometry(format);

  if (project.kind === "hub") {
    const { pages } = await projectSheetPages(projectId, { geo, labels: opts.labels });
    const meta = await sheetMeta(projectId, project.name, project.client?.companyName ?? null, origin, format);
    return { html: renderSheetsHtml(pages, meta), name: project.name };
  }

  const room = await loadRoomSheet(projectId);
  const pages: SheetPage[] = [planPage(room, { geo }), ...diagramPages(room, geo)];
  const sound = await soundMapPage(projectId, room.name, { geo });
  if (sound) pages.push(sound);
  pages.push(...schedulePages(room.cables, room.name, { geo }), ...labelPages(room.cables, room.name, { variant: opts.labels, geo }), ...equipmentPages(equipmentRows(room.devices), room.warnings, room.name, { geo }));
  pages.push(...(await roomRackPages(projectId, room.name, geo)));
  const shots = snapshotsPage(snapshots, room.name);
  if (shots) pages.push(shots);
  // Una sala de un proyecto se rotula con el proyecto; la sala va en su renglón de la cartela.
  const meta = await sheetMeta(projectId, room.hubName ?? room.name, room.clientName, origin, format);
  return { html: renderSheetsHtml(pages, meta), name: room.hubName ? `${room.hubName} - ${room.name}` : room.name };
}

export async function buildProposalPdf(projectId: string, snapshots: Snapshot[], origin?: string, opts: SheetOptions = {}) {
  const { html, name } = await buildProposalHtml(projectId, snapshots, origin, opts);
  return { bytes: await htmlToPdf(html, { margin: "none" }), fileName: sheetsFileName(name) };
}
