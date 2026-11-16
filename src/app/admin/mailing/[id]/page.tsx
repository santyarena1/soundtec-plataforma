import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getMailingConfig } from "@/lib/mailing/config";
import { readBlocks } from "@/lib/mailing/blocks";
import { AUDIENCE_SOURCES, readAudience, readAudienceQuery } from "@/lib/mailing/audience";
import { CampaignEditor } from "@/components/mailing/campaign-editor";
import type { ListOption } from "@/components/mailing/audience-panel";
import { CampaignResults } from "./campaign-results";

export const metadata = { title: "Admin · Campaña por mail" };
/** La pantalla manda tandas mientras está abierta (además del cron). */
export const maxDuration = 60;

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireStaff("marketing.manage");
  const { id } = await params;
  const campaign = await prisma.mailCampaign.findUnique({ where: { id } });
  if (!campaign) notFound();
  const config = await getMailingConfig();

  if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
    return <CampaignResults campaign={campaign} searchParams={await searchParams} footer={config.footer} />;
  }

  const lists = await prisma.mailingList.findMany({
    orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
    select: { id: true, name: true, kind: true, query: true, extraFields: true, description: true, _count: { select: { members: true } } },
  });
  const options: ListOption[] = lists.map((l) => {
    const query = l.kind === "DYNAMIC" ? readAudienceQuery(l.query) : null;
    return {
      id: l.id,
      name: l.name,
      kind: l.kind === "DYNAMIC" ? "DYNAMIC" : "IMPORTED",
      detail: query ? `Desde la base · ${AUDIENCE_SOURCES[query.source].label}${l.description ? ` · ${l.description}` : ""}` : `Importada · ${l._count.members.toLocaleString("es-AR")} personas`,
      extraFields: l.extraFields,
    };
  });

  return (
    <CampaignEditor
      campaign={{
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        preheader: campaign.preheader,
        blocks: readBlocks(campaign.blocks),
        audience: readAudience(campaign.audience),
        status: campaign.status,
        scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
      }}
      lists={options}
      footer={config.footer}
      simulate={config.simulate}
      dailyLimit={config.dailyLimit}
      defaultTestEmail={user.email ?? ""}
    />
  );
}
