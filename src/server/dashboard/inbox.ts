import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { portalUserStatus } from "@/lib/clients/portal-status";
import { relativeDays, type InboxEntry, type InboxItem } from "@/lib/dashboard/inbox";
import { startOfDayArt, DAY_MS } from "@/lib/dashboard/periods";
import { countUncategorizedProducts } from "@/server/uncategorized";
import { loadSyncStatus } from "./sync-status";
import { quoteExpiresAt } from "./quotes";
import type { DashboardViewer } from "./viewer";

/** «Enviada hace más de N días sin novedad». */
export const STALE_QUOTE_DAYS = 7;
/** Más viejo que esto ya no se sigue desde el inicio. */
const STALE_QUOTE_MAX_DAYS = 45;

const fmtShort = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });

type IssuedRow = {
  id: string;
  number: string;
  client: string | null;
  clientId: string | null;
  issuedAt: Date;
  validityDays: number | null;
  followedUp: boolean;
};

async function quoteItems(viewer: DashboardViewer, now: Date): Promise<InboxItem[]> {
  if (!viewer.quotesAll && !viewer.can("quotes.view_own")) return [];
  const since = new Date(now.getTime() - STALE_QUOTE_MAX_DAYS * DAY_MS);
  const ownerFilter = viewer.quotesAll ? Prisma.empty : Prisma.sql`AND q."ownerId" = ${viewer.userId}`;
  // «Novedad» = alguien registró algo con el cliente (llamada, mail, nota, tarea) después de mandarla.
  const rows = await prisma.$queryRaw<IssuedRow[]>`
    SELECT q.id, q.number, COALESCE(c."companyName", q."clientName") AS client, q."clientId", q."issuedAt", t."validityDays",
      EXISTS (
        SELECT 1 FROM "ClientActivity" a
        WHERE a."clientId" = q."clientId" AND a."createdAt" > q."issuedAt" AND a.kind <> 'SYSTEM'
      ) AS "followedUp"
    FROM "Quote" q
    LEFT JOIN "QuoteCommercialTerms" t ON t."quoteId" = q.id
    LEFT JOIN "Client" c ON c.id = q."clientId"
    WHERE q.status = 'ISSUED' AND q."issuedAt" >= ${since} ${ownerFilter}
    ORDER BY q."issuedAt" ASC
  `;
  const weekAhead = now.getTime() + 7 * DAY_MS;
  const expiring = rows
    .map((r) => ({ ...r, expiresAt: quoteExpiresAt(r.issuedAt, r.validityDays)! }))
    .filter((r) => r.expiresAt.getTime() >= now.getTime() && r.expiresAt.getTime() <= weekAhead)
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
  const staleBefore = now.getTime() - STALE_QUOTE_DAYS * DAY_MS;
  const stale = rows.filter((r) => r.issuedAt.getTime() < staleBefore && !r.followedUp);
  const entry = (r: IssuedRow, note: string): InboxEntry => ({ label: `${r.number} · ${r.client || "Sin cliente"}`, href: `/admin/quotes/${r.id}`, note });
  return [
    {
      key: "quotes-expiring",
      severity: "high",
      count: expiring.length,
      title: expiring.length === 1 ? "Cotización que vence esta semana" : "Cotizaciones que vencen esta semana",
      detail: "Llamá antes de que venza o renovala con precios al día.",
      href: "/admin/quotes?status=ISSUED",
      actionLabel: "Ver cotizaciones",
      dueAt: expiring[0]?.expiresAt ?? null,
      entries: expiring.slice(0, 3).map((r) => entry(r, `vence ${relativeDays(r.expiresAt, now)}`)),
    },
    {
      key: "quotes-stale",
      severity: "normal",
      count: stale.length,
      title: `Enviadas hace más de ${STALE_QUOTE_DAYS} días, sin seguimiento`,
      detail: "Se mandó el PDF y no hay llamada, mail ni nota del cliente desde entonces.",
      href: "/admin/quotes?status=ISSUED",
      actionLabel: "Hacer seguimiento",
      oldestAt: stale[0]?.issuedAt ?? null,
      entries: stale.slice(0, 3).map((r) => entry(r, `enviada el ${fmtShort(r.issuedAt)}`)),
    },
  ];
}

async function inviteItems(viewer: DashboardViewer, now: Date): Promise<InboxItem[]> {
  if (!viewer.can("clients.portal_users")) return [];
  const users = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      isActive: true,
      activationTokens: { some: { usedAt: null } },
      ...(viewer.clientsAll ? {} : { client: { is: { ownerId: viewer.userId } } }),
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      lastLoginAt: true,
      mustChangePassword: true,
      clientId: true,
      client: { select: { companyName: true } },
      activationTokens: { where: { usedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { expiresAt: true, createdAt: true } },
    },
  });
  // Misma regla que el listado de clientes y usuarios.
  const classified = users.map((u) => ({ u, token: u.activationTokens[0] ?? null, status: portalUserStatus({ ...u, pendingToken: u.activationTokens[0] ?? null }, now) }));
  const expired = classified.filter((c) => c.status.state === "invite_expired").sort((a, b) => a.token!.expiresAt.getTime() - b.token!.expiresAt.getTime());
  const waiting = classified.filter((c) => c.status.state === "invited").sort((a, b) => a.token!.expiresAt.getTime() - b.token!.expiresAt.getTime());
  const label = (c: (typeof classified)[number]) => `${c.u.name}${c.u.client?.companyName ? ` · ${c.u.client.companyName}` : ""}`;
  const href = (c: (typeof classified)[number]) => (c.u.clientId ? `/admin/clients/${c.u.clientId}` : "/admin/users?vista=portal");
  return [
    {
      key: "invites-expired",
      severity: "high",
      count: expired.length,
      title: expired.length === 1 ? "Invitación al portal vencida" : "Invitaciones al portal vencidas",
      detail: "No llegaron a crear su clave. Mandales una invitación nueva desde la ficha del cliente.",
      href: "/admin/users?vista=portal",
      actionLabel: "Reenviar",
      oldestAt: expired[0]?.token?.expiresAt ?? null,
      entries: expired.slice(0, 3).map((c) => ({ label: label(c), href: href(c), note: `venció el ${fmtShort(c.token!.expiresAt)}` })),
    },
    {
      key: "invites-waiting",
      severity: "low",
      count: waiting.length,
      title: "Invitados que todavía no crearon su clave",
      detail: "El link sigue vigente. Si no lo encuentran, que revisen correo no deseado.",
      href: "/admin/users?vista=portal",
      actionLabel: "Ver usuarios",
      dueAt: null,
      oldestAt: waiting[0]?.token?.createdAt ?? null,
      entries: waiting.slice(0, 3).map((c) => ({ label: label(c), href: href(c), note: `el link vence ${relativeDays(c.token!.expiresAt, now)}` })),
    },
  ];
}

async function taskItems(viewer: DashboardViewer, now: Date): Promise<InboxItem[]> {
  if (!viewer.seesClients) return [];
  const endOfToday = new Date(startOfDayArt(now).getTime() + DAY_MS);
  const tasks = await prisma.clientActivity.findMany({
    where: {
      kind: "TASK",
      doneAt: null,
      dueAt: { lt: endOfToday },
      ...(viewer.clientsAll ? {} : { OR: [{ createdById: viewer.userId }, { client: { ownerId: viewer.userId } }] }),
    },
    orderBy: { dueAt: "asc" },
    take: 50,
    select: { id: true, title: true, dueAt: true, client: { select: { id: true, companyName: true } } },
  });
  return [
    {
      key: "crm-tasks",
      severity: "high",
      count: tasks.length,
      title: "Tareas de clientes para hoy o atrasadas",
      href: tasks[0] ? `/admin/clients/${tasks[0].client.id}` : "/admin/clients",
      actionLabel: "Abrir",
      oldestAt: tasks[0]?.dueAt ?? null,
      entries: tasks.slice(0, 3).map((t) => ({ label: `${t.title} · ${t.client.companyName}`, href: `/admin/clients/${t.client.id}`, note: t.dueAt ? relativeDays(t.dueAt, now) : undefined })),
    },
  ];
}

async function systemItems(viewer: DashboardViewer): Promise<InboxItem[]> {
  const [requests, uncategorized, feedback, tickets, sync] = await Promise.all([
    viewer.can("account_requests.review")
      ? prisma.accountRequest.aggregate({ where: { status: "PENDING" }, _count: { _all: true }, _min: { createdAt: true } })
      : null,
    viewer.can("categories.manage") ? countUncategorizedProducts() : 0,
    viewer.can("ai.manage")
      ? prisma.aiContentFeedback.aggregate({ where: { verdict: "HAS_ERRORS", resolvedAt: null }, _count: { _all: true }, _min: { createdAt: true } })
      : null,
    viewer.can("tickets.manage")
      ? prisma.developerTicket.aggregate({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, _count: { _all: true }, _min: { createdAt: true } })
      : null,
    viewer.isAdmin ? loadSyncStatus() : [],
  ]);
  const syncBad = sync.filter((s) => s.needsAttention);
  return [
    {
      key: "account-requests",
      severity: "high",
      count: requests?._count._all ?? 0,
      title: "Solicitudes de cuenta por aprobar",
      detail: "Empresas que pidieron acceso al portal.",
      href: "/admin/account-requests",
      actionLabel: "Revisar",
      oldestAt: requests?._min.createdAt ?? null,
    },
    {
      key: "sync",
      severity: "urgent",
      count: syncBad.length,
      title: syncBad.length === 1 ? "Sincronización con problemas" : "Sincronizaciones con problemas",
      detail: syncBad.map((s) => `${s.label}: ${s.health.label.toLowerCase()}`).join(" · "),
      href: "/admin/sync",
      actionLabel: "Ver sincronizaciones",
    },
    {
      key: "uncategorized",
      severity: "low",
      count: uncategorized,
      title: "Productos sin categorizar",
      detail: "Activos sin rubro de Tango: no aparecen bien en el catálogo.",
      href: "/admin/products/reclasificacion?ver=uno-a-uno",
      actionLabel: "Revisar uno a uno",
    },
    {
      key: "ai-feedback",
      severity: "normal",
      count: feedback?._count._all ?? 0,
      title: "Textos de IA marcados con errores",
      href: "/admin/feedback",
      actionLabel: "Corregir",
      oldestAt: feedback?._min.createdAt ?? null,
    },
    {
      key: "tickets",
      severity: "normal",
      count: tickets?._count._all ?? 0,
      title: "Tickets abiertos al desarrollador",
      href: "/admin/tickets",
      actionLabel: "Ver tickets",
      oldestAt: tickets?._min.createdAt ?? null,
    },
  ];
}

/** Todo lo pendiente que este usuario puede resolver (sin ordenar). */
export async function loadInbox(viewer: DashboardViewer, now: Date = new Date()): Promise<InboxItem[]> {
  const groups = await Promise.all([quoteItems(viewer, now), inviteItems(viewer, now), taskItems(viewer, now), systemItems(viewer)]);
  return groups.flat();
}
