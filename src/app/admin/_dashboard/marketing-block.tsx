import Link from "next/link";
import { cn } from "@/lib/utils";
import { CAMPAIGN_STATUS } from "@/lib/mailing/status";
import { loadMarketing } from "@/server/dashboard/marketing";
import type { DashboardViewer } from "@/server/dashboard/viewer";
import { BlockError, Count, Panel, Quiet, SubHead, shortDate, timeOrDate } from "./ui";

/** Campañas por mail, interesados nuevos (formularios, Expo, catálogo) y solicitudes de cuenta de la semana. */
export async function MarketingBlock({ viewer, className }: { viewer: DashboardViewer; className?: string }) {
  let data: Awaited<ReturnType<typeof loadMarketing>>;
  try {
    data = await loadMarketing(viewer);
  } catch (error) {
    console.error("[dashboard] marketing", error);
    return <BlockError title="Marketing" className={className} />;
  }
  const now = new Date();
  const columns = [data.campaigns, data.leads || data.forms, data.accountRequests].filter(Boolean).length;
  if (!columns) return null;

  return (
    <Panel eyebrow="Marketing · últimos 7 días" title={data.campaigns ? "Campañas e interesados" : "Interesados y altas"} className={className} tour="dash-marketing">
      <div className={cn("grid gap-x-8 gap-y-2", columns >= 3 ? "lg:grid-cols-[minmax(0,6fr)_minmax(0,4fr)_minmax(0,3fr)]" : columns === 2 ? "lg:grid-cols-2" : "")}>
        {data.campaigns ? (
          <div className="min-w-0">
            <SubHead aside={<Link href="/admin/mailing" className="text-accent hover:underline">Campañas</Link>}>Últimas campañas por mail</SubHead>
            {data.campaigns.length ? (
              <ul className="space-y-2.5">
                {data.campaigns.map((c) => (
                  <li key={c.id}>
                    <Link href={`/admin/mailing/${c.id}`} className="group block rounded-md border border-border px-3 py-2 hover:border-accent/40">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium group-hover:text-accent">{c.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {c.simulated ? "Prueba" : CAMPAIGN_STATUS[c.status]?.label ?? c.status}
                          {c.at ? ` · ${shortDate(c.at)}` : ""}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <span>
                          <span className="block text-base font-semibold leading-none tabular-nums">{c.sent.toLocaleString("es-AR")}</span>
                          <span className="text-muted-foreground">enviados</span>
                        </span>
                        <Rate label="abrieron" pct={c.openRate} n={c.opened} />
                        <Rate label="hicieron clic" pct={c.clickRate} n={c.clicked} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Quiet>Todavía no salió ninguna campaña.</Quiet>
            )}
          </div>
        ) : null}

        {data.leads || data.forms ? (
          <div className="min-w-0">
            {data.leads ? (
              <>
                <SubHead aside={<Link href="/admin/leads" className="text-accent hover:underline">Leads</Link>}>
                  Interesados nuevos · <Count value={data.leads.count} />
                </SubHead>
                {data.leads.latest.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {data.leads.latest.map((l) => (
                      <li key={l.id} className="min-w-0">
                        <span className="block truncate font-medium">{l.name}{l.company ? ` · ${l.company}` : ""}</span>
                        <span className="block text-xs text-muted-foreground">{l.source} · {timeOrDate(l.at, now)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Quiet>Sin interesados nuevos esta semana.</Quiet>
                )}
              </>
            ) : null}
            {data.forms ? (
              <>
                <SubHead aside={<Link href="/admin/forms" className="text-accent hover:underline">Formularios</Link>}>
                  Respuestas a formularios · <Count value={data.forms.count} />
                </SubHead>
                {data.forms.byForm.length ? (
                  <ul className="space-y-1 text-sm">
                    {data.forms.byForm.map((f) => (
                      <li key={f.id} className="flex items-baseline justify-between gap-2">
                        <Link href={`/admin/forms/${f.id}`} className="truncate hover:text-accent hover:underline">{f.title}</Link>
                        <span className="shrink-0 text-xs font-semibold tabular-nums">{f.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Quiet>Nadie respondió formularios esta semana.</Quiet>
                )}
              </>
            ) : null}
          </div>
        ) : null}

        {data.accountRequests ? (
          <div className="min-w-0">
            <SubHead aside={<Link href="/admin/account-requests" className="text-accent hover:underline">Ver</Link>}>
              {viewer.can("account_requests.review") ? "Solicitudes de cuenta" : "Tus pedidos de alta"}
            </SubHead>
            <p className="text-3xl font-semibold leading-none tabular-nums">
              <Count value={data.accountRequests.total} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">entraron esta semana</p>
            <dl className="mt-3 space-y-1 text-sm">
              {[
                { label: "Esperando aprobación", value: data.accountRequests.pending, tone: "text-warning" },
                { label: "Aprobadas", value: data.accountRequests.approved, tone: "text-success" },
                { label: "Rechazadas", value: data.accountRequests.rejected, tone: "text-muted-foreground" },
              ].map((r) => (
                <div key={r.label} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd className={cn("font-semibold tabular-nums", r.value ? r.tone : "text-muted-foreground")}>{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function Rate({ label, pct, n }: { label: string; pct: number; n: number }) {
  return (
    <span>
      <span className="block text-base font-semibold leading-none tabular-nums">{pct.toLocaleString("es-AR")} %</span>
      <span className="text-muted-foreground">
        {label} ({n})
      </span>
    </span>
  );
}
