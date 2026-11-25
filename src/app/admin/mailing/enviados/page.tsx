import Link from "next/link";
import { Download } from "lucide-react";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import { MailingNav } from "@/components/mailing/mailing-nav";
import { getMailingConfig } from "@/lib/mailing/config";
import { SENT_STAGE_LABELS, TOTAL_KEYS, baseWhere, lastEvent, parseSentFilters, sentWhere, stageOf, stageWhere, type SentFilters, type SentStageKey } from "@/lib/mailing/sent-table";
import { RefreshFromResendButton } from "./refresh-button";

export const metadata = { title: "Admin · Enviados por campañas" };

const PAGE_SIZE = 100;
const TONE = { success: "success", info: "primary", muted: "muted", warning: "warning", danger: "destructive" } as const;

function query(f: SentFilters, patch: Partial<Record<"campana" | "estado" | "q" | "desde" | "hasta" | "pagina", string | null>>): string {
  const values: Record<string, string | null> = { campana: f.campaignId, estado: f.stage, q: f.q || null, desde: f.from, hasta: f.to, pagina: null, ...patch };
  return new URLSearchParams(Object.entries(values).filter((e): e is [string, string] => Boolean(e[1]))).toString();
}

export default async function SentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff("marketing.manage");
  const filters = parseSentFilters(await searchParams);
  const where = sentWhere(filters);
  const base = baseWhere(filters);
  const [rows, filteredTotal, allTotal, stageCounts, campaigns, config] = await Promise.all([
    prisma.mailCampaignRecipient.findMany({
      where,
      orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        name: true,
        company: true,
        status: true,
        sentAt: true,
        deliveredAt: true,
        openedAt: true,
        clickedAt: true,
        bouncedAt: true,
        bounceType: true,
        complainedAt: true,
        unsubscribedAt: true,
        lastError: true,
        campaign: { select: { id: true, name: true } },
      },
    }),
    prisma.mailCampaignRecipient.count({ where }),
    prisma.mailCampaignRecipient.count({ where: base }),
    Promise.all(TOTAL_KEYS.map((key) => prisma.mailCampaignRecipient.count({ where: { AND: [base, stageWhere(key)] } }))),
    prisma.mailCampaign.findMany({ where: { recipients: { some: {} }, status: { not: "DRAFT" } }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, name: true } }),
    getMailingConfig(),
  ]);
  const counts = new Map<SentStageKey, number>(TOTAL_KEYS.map((key, i) => [key, stageCounts[i] ?? 0]));
  // Entregados «en total» (incluye a los que abrieron o hicieron clic), como lo cuenta cualquier panel de envíos.
  const reached = (counts.get("delivered") ?? 0) + (counts.get("opened") ?? 0) + (counts.get("clicked") ?? 0) + (counts.get("complained") ?? 0) + (counts.get("unsubscribed") ?? 0);
  const pages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const exportHref = `/api/admin/mailing/enviados/export?${query(filters, { pagina: null })}`;

  const cards: Array<{ label: string; value: number; stage: SentStageKey | null; hint?: string }> = [
    { label: "Enviados", value: allTotal, stage: null },
    { label: "Entregados", value: reached, stage: "delivered", hint: "incluye los que abrieron" },
    { label: "Abrieron", value: (counts.get("opened") ?? 0) + (counts.get("clicked") ?? 0), stage: "opened" },
    { label: "Clics", value: counts.get("clicked") ?? 0, stage: "clicked" },
    { label: "Rebotes", value: counts.get("bounced") ?? 0, stage: "bounced" },
    { label: "Quejas", value: counts.get("complained") ?? 0, stage: "complained" },
    { label: "Bajas", value: counts.get("unsubscribed") ?? 0, stage: "unsubscribed" },
    { label: "Fallidos", value: counts.get("failed") ?? 0, stage: "failed" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enviados"
        description="Cada mail que salió por las campañas (noreply@, por Resend), con su estado y el último movimiento. Los estados llegan solos por el webhook de Resend; «Traer de Resend» completa los que falten."
        actions={
          <>
            <RefreshFromResendButton campaignId={filters.campaignId} disabled={!config.apiKey || config.simulate} />
            <a href={exportHref} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-secondary">
              <Download className="h-4 w-4" /> Exportar a Excel
            </a>
          </>
        }
      />
      <MailingNav active="enviados" simulate={config.simulate ? { reason: config.simulateReason } : null} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={`/admin/mailing/enviados?${query(filters, { estado: c.stage })}`}
            className={cn("rounded-lg border bg-card px-3 py-2 transition hover:border-primary/40", filters.stage === c.stage ? "border-primary ring-1 ring-primary/30" : "border-border")}
            title={c.hint}
          >
            <p className="text-lg font-semibold tabular-nums">{c.value.toLocaleString("es-AR")}</p>
            <p className="text-xs text-muted-foreground">
              {c.label}
              {c.stage && c.label !== "Enviados" && allTotal ? <span className="ml-1 tabular-nums">· {Math.round((c.value / allTotal) * 1000) / 10}%</span> : null}
            </p>
          </Link>
        ))}
      </div>

      <form action="/admin/mailing/enviados" className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
        <input name="q" defaultValue={filters.q} placeholder="Buscar un mail" className="h-9 min-w-[200px] flex-1 rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary/60" />
        <select name="campana" defaultValue={filters.campaignId ?? ""} className="h-9 max-w-[260px] rounded-md border border-border bg-white px-2 text-sm">
          <option value="">Todas las campañas</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={filters.stage ?? ""} className="h-9 rounded-md border border-border bg-white px-2 text-sm">
          <option value="">Todos los estados</option>
          {TOTAL_KEYS.map((key) => (
            <option key={key} value={key}>
              {SENT_STAGE_LABELS[key]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Desde
          <input type="date" name="desde" defaultValue={filters.from ?? ""} className="h-9 rounded-md border border-border bg-white px-2 text-sm text-foreground" />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Hasta
          <input type="date" name="hasta" defaultValue={filters.to ?? ""} className="h-9 rounded-md border border-border bg-white px-2 text-sm text-foreground" />
        </label>
        <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Filtrar
        </button>
        {filters.q || filters.campaignId || filters.stage || filters.from || filters.to ? (
          <Link href="/admin/mailing/enviados" className="h-9 px-2 text-sm leading-9 text-muted-foreground underline">
            Limpiar
          </Link>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Destinatario</th>
              <th className="px-3 py-2 font-medium">Campaña</th>
              <th className="px-3 py-2 font-medium">Enviado</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Último evento</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const stage = stageOf(r);
              const last = lastEvent(r);
              return (
                <tr key={r.id} className="border-b border-border/60 align-top last:border-b-0">
                  <td className="px-3 py-2">
                    <p className="font-medium">{r.email}</p>
                    {r.name || r.company ? <p className="text-xs text-muted-foreground">{[r.name, r.company].filter(Boolean).join(" · ")}</p> : null}
                  </td>
                  <td className="max-w-[240px] px-3 py-2">
                    <Link href={`/admin/mailing/${r.campaign.id}`} className="line-clamp-2 hover:underline">
                      {r.campaign.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{formatDate(r.sentAt)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={TONE[stage.tone]}>{stage.label}</Badge>
                    {r.lastError && (stage.key === "failed" || stage.key === "bounced") ? <p className="mt-1 max-w-[260px] truncate text-xs text-muted-foreground" title={r.lastError}>{r.lastError}</p> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {last ? (
                      <>
                        <span className="font-medium">{last.label}</span> <span className="text-muted-foreground">· {formatDate(last.at)}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {allTotal ? "No hay envíos con estos filtros." : "Todavía no salió ningún mail por campañas."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{filteredTotal.toLocaleString("es-AR")} mails</span>
        {pages > 1 ? (
          <span className="flex gap-1">
            {filters.page > 1 ? (
              <Link href={`/admin/mailing/enviados?${query(filters, { pagina: String(filters.page - 1) })}`} className="rounded border border-border px-2 py-1 hover:bg-secondary">
                ← Anterior
              </Link>
            ) : null}
            <span className="px-2 py-1">
              Página {Math.min(filters.page, pages)} de {pages}
            </span>
            {filters.page < pages ? (
              <Link href={`/admin/mailing/enviados?${query(filters, { pagina: String(filters.page + 1) })}`} className="rounded border border-border px-2 py-1 hover:bg-secondary">
                Siguiente →
              </Link>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}
