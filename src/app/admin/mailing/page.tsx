import Link from "next/link";
import { Megaphone } from "lucide-react";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { MailingNav } from "@/components/mailing/mailing-nav";
import { getMailingConfig } from "@/lib/mailing/config";
import { loadCampaignTotals } from "@/lib/mailing/campaign-stats";
import { rate } from "@/lib/mailing/stats";
import { CAMPAIGN_STATUS } from "@/lib/mailing/status";
import { CampaignRowActions, NewCampaignButton } from "./campaign-list-actions";

export const metadata = { title: "Admin · Campañas por mail" };

export default async function MailingPage() {
  await requireStaff("marketing.manage");
  const [campaigns, config] = await Promise.all([
    prisma.mailCampaign.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, name: true, subject: true, status: true, scheduledAt: true, startedAt: true, simulated: true, updatedAt: true, note: true },
    }),
    getMailingConfig(),
  ]);
  const totals = await loadCampaignTotals(campaigns.map((c) => c.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campañas por mail"
        description="Promociones y novedades a clientes, usuarios del portal, interesados y listas propias. Cada mail lleva su enlace de baja y quien se dio de baja no vuelve a recibir."
        actions={<NewCampaignButton />}
      />
      <MailingNav active="campanas" simulate={config.simulate ? { reason: config.simulateReason } : null} />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-5 w-5" />}
          title="Todavía no hay campañas"
          description="Primero armá una lista (desde la base de clientes o importando un Excel) y después creá la campaña: asunto, bloques con productos del catálogo y a quién va."
          action={<NewCampaignButton />}
        />
      ) : (
        <ul className="grid gap-3">
          {campaigns.map((c) => {
            const t = totals.get(c.id)!;
            const status = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.DRAFT!;
            const out = t.sent + t.simulated;
            const editable = c.status === "DRAFT" || c.status === "SCHEDULED";
            return (
              <li key={c.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/mailing/${c.id}`} className="truncate text-base font-semibold hover:underline">
                      {c.name}
                    </Link>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {c.simulated && !editable ? <Badge tone="muted">Simulada</Badge> : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {c.subject ? `«${c.subject}»` : "Sin asunto"}
                    {c.status === "SCHEDULED" && c.scheduledAt ? ` · sale ${formatDate(c.scheduledAt)}` : ""}
                    {c.startedAt ? ` · arrancó ${formatDate(c.startedAt)}` : ` · editada ${formatDate(c.updatedAt)}`}
                  </p>
                  {c.note && (c.status === "SENDING" || c.status === "PAUSED") ? <p className="mt-1 text-xs text-amber-800">{c.note}</p> : null}
                </div>
                {t.total ? (
                  <div className="flex gap-5 text-right text-xs tabular-nums text-muted-foreground">
                    <div>
                      <p className="text-base font-semibold text-foreground">{out.toLocaleString("es-AR")}</p>
                      <p>{c.simulated ? "simulados" : "enviados"}</p>
                    </div>
                    {!c.simulated ? (
                      <>
                        <div>
                          <p className="text-base font-semibold text-foreground">{rate(t.opened, out)}%</p>
                          <p>abrieron</p>
                        </div>
                        <div>
                          <p className="text-base font-semibold text-foreground">{rate(t.clicked, out)}%</p>
                          <p>clics</p>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
                <CampaignRowActions id={c.id} editable={editable} sending={c.status === "SENDING"} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
