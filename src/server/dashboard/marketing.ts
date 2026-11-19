import { prisma } from "@/lib/prisma";
import { DAY_MS } from "@/lib/dashboard/periods";
import { loadCampaignTotals } from "@/lib/mailing/campaign-stats";
import { rate } from "@/lib/mailing/stats";
import type { DashboardViewer } from "./viewer";

const WEEK = 7;

export type CampaignRow = {
  id: string;
  name: string;
  status: string;
  simulated: boolean;
  at: Date | null;
  sent: number;
  openRate: number;
  clickRate: number;
  opened: number;
  clicked: number;
};

export type LeadRow = { id: string; name: string; company: string | null; source: string; at: Date };

export type MarketingData = {
  campaigns: CampaignRow[] | null;
  leads: { count: number; latest: LeadRow[] } | null;
  forms: { count: number; byForm: Array<{ id: string; title: string; count: number }> } | null;
  accountRequests: { total: number; pending: number; approved: number; rejected: number } | null;
};

export function seesMarketing(viewer: DashboardViewer): boolean {
  return (
    viewer.can("marketing.manage") ||
    viewer.can("leads.view") ||
    viewer.can("forms.manage") ||
    viewer.can("account_requests.review") ||
    viewer.can("account_requests.create")
  );
}

async function campaigns(): Promise<CampaignRow[]> {
  const rows = await prisma.mailCampaign.findMany({
    where: { status: { in: ["SENT", "SENDING", "PAUSED"] } },
    orderBy: [{ startedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
    take: 4,
    select: { id: true, name: true, status: true, simulated: true, startedAt: true, finishedAt: true },
  });
  const totals = await loadCampaignTotals(rows.map((r) => r.id));
  return rows.map((r) => {
    const t = totals.get(r.id)!;
    // Base: lo que efectivamente salió (entregado si hay webhook; si no, enviado).
    const base = Math.max(t.delivered, t.sent);
    return {
      id: r.id,
      name: r.name,
      status: r.status,
      simulated: r.simulated,
      at: r.finishedAt ?? r.startedAt,
      sent: t.sent + t.simulated,
      opened: t.opened,
      clicked: t.clicked,
      openRate: rate(t.opened, base),
      clickRate: rate(t.clicked, base),
    };
  });
}

async function leads(since: Date): Promise<{ count: number; latest: LeadRow[] }> {
  const [visitorCount, expoCount, visitors, expo] = await Promise.all([
    prisma.visitorLead.count({ where: { createdAt: { gte: since } } }),
    prisma.expoLead.count({ where: { createdAt: { gte: since } } }),
    prisma.visitorLead.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, company: true, source: true, createdAt: true, event: { select: { name: true } } },
    }),
    prisma.expoLead.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, company: true, createdAt: true },
    }),
  ]);
  const latest: LeadRow[] = [
    ...visitors.map((v) => ({
      id: v.id,
      name: v.name || v.email,
      company: v.company,
      source: v.event?.name ? `Expo · ${v.event.name}` : v.source === "QR" ? "QR" : "Catálogo",
      at: v.createdAt,
    })),
    ...expo.map((e) => ({ id: e.id, name: e.name || e.email || "Sin nombre", company: e.company, source: "Soundtec AI", at: e.createdAt })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 5);
  return { count: visitorCount + expoCount, latest };
}

async function forms(since: Date) {
  const grouped = await prisma.formResponse.groupBy({ by: ["formId"], where: { submittedAt: { gte: since } }, _count: { _all: true } });
  const titles = grouped.length ? await prisma.form.findMany({ where: { id: { in: grouped.map((g) => g.formId) } }, select: { id: true, title: true } }) : [];
  const byForm = grouped
    .map((g) => ({ id: g.formId, title: titles.find((t) => t.id === g.formId)?.title ?? "Formulario", count: g._count._all }))
    .sort((a, b) => b.count - a.count);
  return { count: byForm.reduce((s, f) => s + f.count, 0), byForm: byForm.slice(0, 4) };
}

async function accountRequests(viewer: DashboardViewer, since: Date) {
  const mine = viewer.can("account_requests.review") ? {} : { requestedById: viewer.userId };
  const grouped = await prisma.accountRequest.groupBy({ by: ["status"], where: { ...mine, createdAt: { gte: since } }, _count: { _all: true } });
  const n = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  return { total: grouped.reduce((s, g) => s + g._count._all, 0), pending: n("PENDING"), approved: n("APPROVED"), rejected: n("REJECTED") };
}

/** Marketing de la semana, según lo que cada uno puede ver. */
export async function loadMarketing(viewer: DashboardViewer, now: Date = new Date()): Promise<MarketingData> {
  const since = new Date(now.getTime() - WEEK * DAY_MS);
  const [c, l, f, a] = await Promise.all([
    viewer.can("marketing.manage") ? campaigns() : null,
    viewer.can("leads.view") ? leads(since) : null,
    viewer.can("forms.manage") ? forms(since) : null,
    viewer.can("account_requests.review") || viewer.can("account_requests.create") ? accountRequests(viewer, since) : null,
  ]);
  return { campaigns: c, leads: l, forms: f, accountRequests: a };
}
