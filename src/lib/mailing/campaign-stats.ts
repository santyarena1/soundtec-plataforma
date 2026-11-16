import { prisma } from "@/lib/prisma";
import { emptyTotals, type CampaignTotals } from "@/lib/mailing/stats";

/** Totales de una o varias campañas, con pocas consultas (para la lista y la pantalla de resultados). */
export async function loadCampaignTotals(campaignIds: string[]): Promise<Map<string, CampaignTotals>> {
  const out = new Map<string, CampaignTotals>(campaignIds.map((id) => [id, emptyTotals()]));
  if (!campaignIds.length) return out;
  const where = { campaignId: { in: campaignIds } };
  const [byStatus, delivered, opened, clicked, bounced, complained, unsubscribed] = await Promise.all([
    prisma.mailCampaignRecipient.groupBy({ by: ["campaignId", "status"], where, _count: { _all: true } }),
    prisma.mailCampaignRecipient.groupBy({ by: ["campaignId"], where: { ...where, deliveredAt: { not: null } }, _count: { _all: true } }),
    prisma.mailCampaignRecipient.groupBy({ by: ["campaignId"], where: { ...where, openedAt: { not: null } }, _count: { _all: true } }),
    prisma.mailCampaignRecipient.groupBy({ by: ["campaignId"], where: { ...where, clickedAt: { not: null } }, _count: { _all: true } }),
    prisma.mailCampaignRecipient.groupBy({ by: ["campaignId"], where: { ...where, bouncedAt: { not: null } }, _count: { _all: true } }),
    prisma.mailCampaignRecipient.groupBy({ by: ["campaignId"], where: { ...where, complainedAt: { not: null } }, _count: { _all: true } }),
    prisma.mailCampaignRecipient.groupBy({ by: ["campaignId"], where: { ...where, unsubscribedAt: { not: null } }, _count: { _all: true } }),
  ]);
  for (const row of byStatus) {
    const t = out.get(row.campaignId)!;
    const n = row._count._all;
    t.total += n;
    if (row.status === "QUEUED" || row.status === "SENDING") t.queued += n;
    if (row.status === "SENT") t.sent += n;
    if (row.status === "SIMULATED") t.simulated += n;
    if (row.status === "FAILED") t.failed += n;
    if (row.status === "SKIPPED") t.skipped += n;
    if (row.status === "CANCELED") t.canceled += n;
  }
  const add = (rows: Array<{ campaignId: string; _count: { _all: number } }>, key: keyof CampaignTotals) => {
    for (const row of rows) out.get(row.campaignId)![key] += row._count._all;
  };
  add(delivered, "delivered");
  add(opened, "opened");
  add(clicked, "clicked");
  add(bounced, "bounced");
  add(complained, "complained");
  add(unsubscribed, "unsubscribed");
  return out;
}
