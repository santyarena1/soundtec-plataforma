import Link from "next/link";
import type { MailCampaign, Prisma } from "@prisma/client";
import { Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import { loadCampaignTotals } from "@/lib/mailing/campaign-stats";
import { rate, recipientStage, type StageTone } from "@/lib/mailing/stats";
import { CAMPAIGN_STATUS } from "@/lib/mailing/status";
import { readBlocks } from "@/lib/mailing/blocks";
import type { CampaignFooter } from "@/lib/mailing/template";
import { EmailPreview } from "@/components/mailing/email-preview";
import { DuplicateCampaignButton } from "../campaign-list-actions";
import { CampaignControls } from "./campaign-controls";

const PAGE_SIZE = 100;

const FILTERS: Array<{ key: string; label: string; where: Prisma.MailCampaignRecipientWhereInput }> = [
  { key: "todos", label: "Todos", where: {} },
  { key: "abrieron", label: "Abrieron", where: { openedAt: { not: null } } },
  { key: "clic", label: "Hicieron clic", where: { clickedAt: { not: null } } },
  { key: "no-abrieron", label: "No abrieron", where: { status: "SENT", openedAt: null } },
  { key: "rebotes", label: "Rebotes", where: { bouncedAt: { not: null } } },
  { key: "quejas", label: "Spam", where: { complainedAt: { not: null } } },
  { key: "bajas", label: "Bajas", where: { unsubscribedAt: { not: null } } },
  { key: "problemas", label: "No salieron", where: { status: { in: ["FAILED", "SKIPPED", "CANCELED"] } } },
  { key: "cola", label: "En cola", where: { status: { in: ["QUEUED", "SENDING"] } } },
];

const TONE: Record<StageTone, string> = {
  success: "bg-emerald-100 text-emerald-800",
  info: "bg-sky-100 text-sky-800",
  muted: "bg-slate-100 text-slate-700",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-red-100 text-red-800",
};

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "danger" && "text-red-700")}>{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export async function CampaignResults({ campaign, searchParams, footer }: { campaign: MailCampaign; searchParams: Record<string, string | string[] | undefined>; footer: CampaignFooter }) {
  const filter = FILTERS.find((f) => f.key === one(searchParams.filtro)) ?? FILTERS[0]!;
  const q = one(searchParams.q).trim().toLowerCase().slice(0, 120);
  const page = Math.max(1, Number(one(searchParams.pagina)) || 1);
  const where: Prisma.MailCampaignRecipientWhereInput = { campaignId: campaign.id, ...filter.where, ...(q ? { OR: [{ email: { contains: q } }, { name: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }] } : {}) };
  const [totalsMap, rows, matching] = await Promise.all([
    loadCampaignTotals([campaign.id]),
    prisma.mailCampaignRecipient.findMany({ where, orderBy: { createdAt: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.mailCampaignRecipient.count({ where }),
  ]);
  const t = totalsMap.get(campaign.id)!;
  const out = t.sent + t.simulated;
  const status = CAMPAIGN_STATUS[campaign.status] ?? CAMPAIGN_STATUS.SENT!;
  const pages = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const href = (params: Record<string, string | number>) => {
    const sp = new URLSearchParams({ ...(filter.key !== "todos" ? { filtro: filter.key } : {}), ...(q ? { q } : {}) });
    for (const [k, v] of Object.entries(params)) {
      if (v === "" || v === 1 || v === "todos") sp.delete(k);
      else sp.set(k, String(v));
    }
    const s = sp.toString();
    return `/admin/mailing/${campaign.id}${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Link href="/admin/mailing" className="text-sm text-muted-foreground hover:text-foreground">
            ← Campañas
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
            <Badge tone={status.tone}>{status.label}</Badge>
            {campaign.simulated ? <Badge tone="muted">Simulada: no salió nada</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            «{campaign.subject}» · arrancó {formatDate(campaign.startedAt)}
            {campaign.finishedAt ? ` · terminó ${formatDate(campaign.finishedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/admin/mailing/${campaign.id}/export`} className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-secondary">
            <Download className="h-4 w-4" /> Excel
          </a>
          <DuplicateCampaignButton id={campaign.id} />
        </div>
      </div>

      <CampaignControls id={campaign.id} status={campaign.status} note={campaign.note} total={t.total} done={out + t.failed + t.skipped + t.canceled} simulated={campaign.simulated} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label={campaign.simulated ? "Simulados" : "Enviados"} value={out.toLocaleString("es-AR")} sub={`de ${t.total.toLocaleString("es-AR")}`} />
        <Stat label="Entregados" value={t.delivered.toLocaleString("es-AR")} sub={`${rate(t.delivered, out)}%`} />
        <Stat label="Abrieron" value={t.opened.toLocaleString("es-AR")} sub={`${rate(t.opened, out)}%`} />
        <Stat label="Hicieron clic" value={t.clicked.toLocaleString("es-AR")} sub={`${rate(t.clicked, out)}%`} />
        <Stat label="Rebotes" value={t.bounced.toLocaleString("es-AR")} sub={`${rate(t.bounced, out)}%`} tone={rate(t.bounced, out) > 4 ? "danger" : undefined} />
        <Stat label="Spam" value={t.complained.toLocaleString("es-AR")} sub={`${rate(t.complained, out)}%`} tone={rate(t.complained, out) > 0.3 ? "danger" : undefined} />
        <Stat label="Bajas" value={t.unsubscribed.toLocaleString("es-AR")} sub={`${rate(t.unsubscribed, out)}%`} />
      </div>
      {!campaign.simulated && out > 0 && t.delivered === 0 ? (
        <p className="text-xs text-muted-foreground">Entregados, aperturas y clics llegan por el webhook de Resend a medida que pasan. Si después de un rato siguen en cero, revisá el webhook en Configuración.</p>
      ) : null}
      {rate(t.bounced, out) > 4 || rate(t.complained, out) > 0.3 ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Rebotes o quejas altos: Gmail y Resend frenan los dominios que pasan del 4 % de rebotes o del 0,3 % de spam. Limpiá la lista antes de la próxima campaña.
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <Link key={f.key} href={href({ filtro: f.key, pagina: 1 })} className={cn("rounded-full px-3 py-1 text-xs font-medium", f.key === filter.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
                {f.label}
              </Link>
            ))}
          </div>
          <form className="flex gap-2" action={`/admin/mailing/${campaign.id}`}>
            {filter.key !== "todos" ? <input type="hidden" name="filtro" value={filter.key} /> : null}
            <input name="q" defaultValue={q} placeholder="Buscar por mail, nombre o empresa" className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary/60" />
          </form>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Destinatario</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 pr-3 font-medium">Enviado</th>
                  <th className="py-2 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const stage = recipientStage(r);
                  return (
                    <tr key={r.id} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3">
                        <p className="font-medium">{r.email}</p>
                        <p className="text-xs text-muted-foreground">{[r.name, r.company].filter(Boolean).join(" · ")}</p>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONE[stage.tone])}>{stage.label}</span>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground">{r.sentAt ? formatDate(r.sentAt) : "—"}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {r.openCount ? `${r.openCount} aperturas` : ""}
                        {r.clickCount ? ` · ${r.clickCount} clics` : ""}
                        {r.lastClickUrl ? <span className="block max-w-[260px] truncate">{r.lastClickUrl}</span> : null}
                        {r.lastError ? <span className="block max-w-[260px] text-red-700">{r.lastError}</span> : null}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      Nadie en este filtro.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {matching.toLocaleString("es-AR")} personas · página {page} de {pages}
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link href={href({ pagina: page - 1 })} className="rounded-md border border-border px-2.5 py-1 hover:bg-secondary">
                    Anterior
                  </Link>
                ) : null}
                {page < pages ? (
                  <Link href={href({ pagina: page + 1 })} className="rounded-md border border-border px-2.5 py-1 hover:bg-secondary">
                    Siguiente
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
        <div className="xl:sticky xl:top-4 xl:self-start">
          <EmailPreview subject={campaign.subject} preheader={campaign.preheader} blocks={readBlocks(campaign.blocks)} footer={footer} contact={{ email: "martin@ejemplo.com", name: "Martín Pereyra", company: "Estudio Acústico Sur" }} />
        </div>
      </div>
    </div>
  );
}
