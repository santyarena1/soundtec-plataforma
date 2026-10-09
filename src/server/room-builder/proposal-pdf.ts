/**
 * Propuesta técnica de un ambiente en PDF: rótulo, vistas 3D, plano con
 * cotas, equipos, cableado con metros, diagrama de conexiones y validación.
 * Usa el mismo motor de PDF que las cotizaciones.
 */

import { prisma } from "@/lib/prisma";
import { htmlToPdf } from "@/lib/html-to-pdf";
import { getCompanyIdentity } from "@/lib/quote-defaults";
import { escapeHtml, resolveAssetSrc } from "@/lib/quote-document-html";
import { loadCableCatalog } from "@/services/room-builder/cable-catalog";
import { pickCables } from "@/services/room-builder/cable-picks";
import { cablingProfile } from "@/services/room-builder/cabling-db";
import { cablingForScene } from "@/services/room-builder/cabling-scene";
import { buildDiagram } from "@/services/room-builder/connection-diagram";
import { SIGNAL_INFO } from "@/services/room-builder/device-ports";
import { resolveSceneFurniture } from "@/services/room-builder/furnishing";
import { getRoomProject } from "@/services/room-builder/project-service";
import { diagramSvg, planSvg, type PlanMark, type PlanOpening } from "@/services/room-builder/proposal-svg";
import { parseScene } from "@/services/room-builder/scene";
import { normalizeDeviceUnits, sceneDims } from "@/services/room-builder/units";

export type Snapshot = { label: string; dataUrl: string };

const ROLE_LABEL: Record<string, string> = { display: "Pantalla", camera: "Cámara", mic: "Micrófono", speaker: "Parlante", touch: "Panel / teclado", codec: "Codec / videoconferencia", processor: "Procesador", other: "Equipo" };
const MOUNT_LABEL: Record<string, string> = { wall: "Pared", ceiling: "Cielorraso", table: "Mesa", rack: "Rack", floor: "Piso" };
const SOURCE_LABEL: Record<string, string> = { ok: "Ficha del fabricante", none: "Sin conexiones", review: "Ficha a revisar", missing: "Sin ficha" };

export async function buildProposalHtml(projectId: string, snapshots: Snapshot[], origin?: string): Promise<{ html: string; fileName: string }> {
  const project = await getRoomProject(projectId);
  if (!project || project.kind === "hub") throw new Error("Ambiente no encontrado");
  const scene = parseScene(project.sceneJson);
  if (!scene) throw new Error("Escena inválida");

  const [identity, profile, catalog] = await Promise.all([getCompanyIdentity(), cablingProfile(projectId), loadCableCatalog()]);
  const color = identity.primary || "#1e3553";
  const logo = await resolveAssetSrc(identity.logoUrl, origin);
  const hub = project.parentId ? await prisma.roomProject.findUnique({ where: { id: project.parentId }, select: { name: true } }) : null;

  const plan = profile ? cablingForScene(scene, project.category, profile) : null;
  const picks = plan ? pickCables(plan, catalog) : null;
  const diagram = plan && plan.links.length ? buildDiagram(plan) : null;

  // Equipos (numerados) y su lugar en el plano.
  const productIds = [...new Set(scene.devices.map((d) => d.productId).filter((id): id is string => Boolean(id)))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, normalizedName: true, modelNumber: true, brand: { select: { name: true } } } });
  const byId = new Map(products.map((p) => [p.id, p]));
  const dims = sceneDims(scene);
  const slots = new Map(scene.slots.map((s) => [s.key, s]));
  const marks: PlanMark[] = [];
  const devices = scene.devices
    .filter((d) => d.productId)
    .map((d, i) => {
      const n = i + 1;
      const units = normalizeDeviceUnits(d, slots.get(d.slotKey), dims).units ?? [];
      for (const u of units) marks.push({ n, x: u.pose.x, z: u.pose.z, role: d.designRole });
      const p = byId.get(d.productId!);
      return { n, role: ROLE_LABEL[d.designRole] ?? d.label, brand: p?.brand?.name ?? d.brandName ?? "", model: p?.normalizedName ?? d.productName ?? d.label, qty: d.quantity, mount: MOUNT_LABEL[slots.get(d.slotKey)?.mount ?? ""] ?? "—", sheet: SOURCE_LABEL[profile?.devices[d.id]?.datasheet ?? "missing"] };
    });

  const floor = scene.plan?.enabled && scene.plan.floorPolygon.length >= 3 ? scene.plan.floorPolygon : [
    { x: -scene.widthM / 2, y: -scene.depthM / 2 },
    { x: scene.widthM / 2, y: -scene.depthM / 2 },
    { x: scene.widthM / 2, y: scene.depthM / 2 },
    { x: -scene.widthM / 2, y: scene.depthM / 2 },
  ];
  const openings: PlanOpening[] = (scene.plan?.openings ?? []).flatMap((o) => {
    const w = scene.plan?.walls.find((x) => x.id === o.wall);
    if (!w) return [];
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const at = (t: number) => ({ x: w.a.x + ((w.b.x - w.a.x) * t) / len, y: w.a.y + ((w.b.y - w.a.y) * t) / len });
    return [{ a: at(o.from), b: at(o.to), kind: o.kind }];
  });
  const furniture = resolveSceneFurniture(scene, project.category)
    .filter((f) => !f.hiddenBy && f.mount === "floor")
    .map((f) => ({ x: f.x, z: f.z, w: f.w ?? 0.6, d: f.d ?? 0.6, rotY: f.rotY }));
  const planDrawing = planSvg({ floor, furniture, marks, openings, cables: plan?.links });

  const label = new Map(plan?.nodes.map((n) => [n.id, n.label]) ?? []);
  const date = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
  const h = (t: string) => `<h2 style="margin:14pt 0 6pt;padding-bottom:2pt;border-bottom:1pt solid ${color};font-size:11pt;color:${color};text-transform:uppercase;letter-spacing:.5pt">${escapeHtml(t)}</h2>`;
  const th = (cols: string[]) => `<tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
  const issues = plan?.findings.filter((f) => f.level !== "info") ?? [];

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Propuesta técnica</title><style>
@page { size: A4; margin: 12mm 11mm 14mm 11mm; }
body { font-family: Calibri, "Segoe UI", Arial, sans-serif; color: #16212f; font-size: 9.5pt; margin: 0; }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 8pt; }
th { background: ${color}; color: #fff; text-align: left; font-weight: 600; padding: 3pt 5pt; font-size: 8.5pt; }
td { border-bottom: .5pt solid #dbe2ea; padding: 3pt 5pt; vertical-align: top; }
.block { page-break-inside: avoid; }
.page { page-break-before: always; }
.muted { color: #64748b; }
.chip { display: inline-block; width: 8pt; height: 8pt; border-radius: 4pt; margin-right: 3pt; vertical-align: middle; }
.img { width: 100%; border: .5pt solid #dbe2ea; border-radius: 4pt; margin: 4pt 0; }
.svg svg { width: 100%; height: auto; }
.err { color: #9f1239; } .warn { color: #92400e; }
</style></head><body>
<table style="border:1pt solid ${color};margin:0 0 10pt"><tr>
<td style="width:34%;border:none;padding:8pt">${logo ? `<img src="${escapeHtml(logo)}" style="max-width:150pt;max-height:46pt"/>` : `<b>${escapeHtml(identity.name)}</b>`}</td>
<td style="border:none;border-left:1pt solid ${color};padding:8pt">
<div style="font-size:15pt;font-weight:700;color:${color}">Propuesta técnica</div>
<div style="font-size:11pt;font-weight:600">${escapeHtml(project.name)}${hub ? ` <span class="muted">· ${escapeHtml(hub.name)}</span>` : ""}</div>
<div class="muted">${scene.widthM.toFixed(1)} × ${scene.depthM.toFixed(1)} m · alto ${scene.heightM.toFixed(1)} m · ${escapeHtml(date)} · Rev. A</div>
</td></tr></table>

${snapshots.length ? `${h("Vistas 3D")}${snapshots.map((s) => `<div class="block"><img class="img" src="${escapeHtml(s.dataUrl)}"/><div class="muted">${escapeHtml(s.label)}</div></div>`).join("")}` : ""}

<div class="${snapshots.length ? "page" : ""}">${h("Plano con cotas y ubicación de equipos")}<div class="svg block">${planDrawing}</div></div>

${h("Equipos")}
<table>${th(["#", "Función", "Marca", "Modelo", "Cant.", "Montaje", "Puertos"])}
${devices.map((d) => `<tr><td><b>${d.n}</b></td><td>${escapeHtml(d.role)}</td><td>${escapeHtml(d.brand)}</td><td>${escapeHtml(d.model)}</td><td>${d.qty}</td><td>${escapeHtml(d.mount)}</td><td class="muted">${escapeHtml(d.sheet)}</td></tr>`).join("")}</table>

${plan ? `<div class="page">${h("Cableado")}
<table>${th(["Tipo de cable", "Cables", "Metros"])}
${plan.totals.map((t) => `<tr><td><span class="chip" style="background:${SIGNAL_INFO[t.signal].color}"></span>${escapeHtml(SIGNAL_INFO[t.signal].label)}</td><td>${t.count}</td><td>${t.meters} m</td></tr>`).join("")}</table>
${picks && (picks.lines.length || picks.missing.length) ? `<table>${th(["Cable del catálogo", "Cant.", "Detalle"])}
${picks.lines.map((l) => `<tr><td>${escapeHtml([l.product.brand, l.product.name].filter(Boolean).join(" "))}</td><td>${l.quantity}</td><td class="muted">${escapeHtml(l.note)}</td></tr>`).join("")}
${picks.missing.map((m) => `<tr><td class="warn">${escapeHtml(SIGNAL_INFO[m.signal].label)}</td><td>${m.count}</td><td class="warn">${m.meters} m — ${escapeHtml(m.reason)}</td></tr>`).join("")}</table>` : ""}
<table>${th(["Desde", "Puerto", "Hasta", "Puerto", "Señal", "Metros"])}
${plan.links.map((l) => `<tr><td>${escapeHtml(label.get(l.from) ?? l.from)}</td><td class="muted">${escapeHtml(l.fromPort)}</td><td>${escapeHtml(label.get(l.to) ?? l.to)}</td><td class="muted">${escapeHtml(l.toPort)}</td><td><span class="chip" style="background:${SIGNAL_INFO[l.signal].color}"></span>${escapeHtml(SIGNAL_INFO[l.signal].label)}</td><td>${l.signal === "wireless" ? "—" : `${l.cableM} m`}${l.note ? `<div class="muted">${escapeHtml(l.note)}</div>` : ""}</td></tr>`).join("")}</table>
<p class="muted">Recorrido por pared y cielorraso; los metros incluyen rulos de servicio en cada punta y los cables armados van al largo estándar.</p></div>` : ""}

${diagram ? `<div class="page">${h("Diagrama de conexiones")}<div class="svg">${diagramSvg(diagram)}</div></div>` : ""}

${h("Validación del sistema")}
${issues.length ? `<table>${th(["", "Observación"])}${issues.map((f) => `<tr><td class="${f.level === "error" ? "err" : "warn"}"><b>${f.level === "error" ? "Corregir" : "Revisar"}</b></td><td><b>${escapeHtml(f.title)}</b><div>${escapeHtml(f.detail)}</div></td></tr>`).join("")}</table>` : `<p>Señales, puertos, PoE, canales y largos verificados contra las fichas del fabricante: sin observaciones.</p>`}
<p class="muted" style="margin-top:10pt">${escapeHtml(identity.name)} · Documento técnico generado desde el diseño de la sala. Los puertos de cada equipo surgen de su ficha oficial.</p>
</body></html>`;
  return { html, fileName: `Propuesta_${project.name.replace(/[^\w\-]+/g, "_")}.pdf` };
}

export async function buildProposalPdf(projectId: string, snapshots: Snapshot[], origin?: string) {
  const { html, fileName } = await buildProposalHtml(projectId, snapshots, origin);
  return { bytes: await htmlToPdf(html), fileName };
}
