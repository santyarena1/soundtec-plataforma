/**
 * Láminas técnicas en PDF (A3 apaisado, con cartela en cada hoja).
 * Sala: plano a escala, diagrama de conexiones, planilla de cables,
 * etiquetas, equipos con avisos y, si vienen, las vistas 3D del editor.
 * Proyecto completo: planta general, cada ambiente, planilla, etiquetas y
 * equipos de toda la obra. Mismo motor de PDF que las cotizaciones.
 */

import { htmlToPdf } from "@/lib/html-to-pdf";
import { getCompanyIdentity, QUOTE_CORPORATE_ASSETS } from "@/lib/quote-defaults";
import { resolveAssetSrc } from "@/lib/quote-document-html";
import { getRoomProject } from "@/services/room-builder/project-service";
import { renderSheetsHtml, type SheetMeta, type SheetPage } from "./sheets/sheet-html";
import { diagramPages, equipmentPages, equipmentRows, labelPages, planPage, schedulePages, snapshotsPage } from "./sheets/sheet-pages";
import { loadRoomSheet } from "./sheets/room-sheet";
import { projectSheetPages } from "./sheets/project-sheets";

export type Snapshot = { label: string; dataUrl: string };

/** Revisión de las láminas (no hay historial de revisiones todavía). */
const REVISION = "A";
/** Marca de Soundtec sin márgenes (la misma de las tarjetas al compartir). */
const CARTELA_LOGO = "/landing/logo_soundtec.png";

async function sheetMeta(project: string, client: string | null, origin?: string): Promise<SheetMeta> {
  const identity = await getCompanyIdentity();
  return {
    docTitle: "Láminas técnicas",
    project,
    client,
    company: { name: identity.name, address: identity.address, phone: identity.phone, email: identity.email, web: identity.web },
    // El logo de fábrica de las cotizaciones es una franja ancha: en la cartela va la marca sola.
    logo: await resolveAssetSrc(identity.logoUrl === QUOTE_CORPORATE_ASSETS.logo ? CARTELA_LOGO : identity.logoUrl, origin),
    color: identity.primary || "#1e3553",
    date: new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }),
    revision: REVISION,
  };
}

/** Nombre de archivo con el nombre del proyecto (ASCII para el encabezado; el UTF-8 va aparte). */
export function sheetsFileName(name: string): { ascii: string; utf8: string } {
  const base = `Laminas_${name}`;
  const ascii = base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\-]+/g, "_").replace(/_+/g, "_");
  return { ascii: `${ascii}.pdf`, utf8: `Láminas ${name}.pdf` };
}

export async function buildProposalHtml(projectId: string, snapshots: Snapshot[], origin?: string): Promise<{ html: string; name: string }> {
  const project = await getRoomProject(projectId);
  if (!project) throw new Error("Proyecto no encontrado");

  if (project.kind === "hub") {
    const { pages } = await projectSheetPages(projectId);
    const meta = await sheetMeta(project.name, project.client?.companyName ?? null, origin);
    return { html: renderSheetsHtml(pages, meta), name: project.name };
  }

  const room = await loadRoomSheet(projectId);
  const pages: SheetPage[] = [planPage(room), ...diagramPages(room)];
  pages.push(...schedulePages(room.cables, room.name), ...labelPages(room.cables, room.name), ...equipmentPages(equipmentRows(room.devices), room.warnings, room.name));
  const shots = snapshotsPage(snapshots, room.name);
  if (shots) pages.push(shots);
  // Una sala de un proyecto se rotula con el proyecto; la sala va en su renglón de la cartela.
  const meta = await sheetMeta(room.hubName ?? room.name, room.clientName, origin);
  return { html: renderSheetsHtml(pages, meta), name: room.hubName ? `${room.hubName} - ${room.name}` : room.name };
}

export async function buildProposalPdf(projectId: string, snapshots: Snapshot[], origin?: string) {
  const { html, name } = await buildProposalHtml(projectId, snapshots, origin);
  return { bytes: await htmlToPdf(html, { margin: "none" }), fileName: sheetsFileName(name) };
}
