import Link from "next/link";
import { cn } from "@/lib/utils";
import { monthName } from "@/lib/dashboard/periods";
import { quoteStatusLabel } from "@/lib/quote-status";
import { loadCommercial } from "@/server/dashboard/commercial";
import type { DashboardViewer } from "@/server/dashboard/viewer";
import { BlockError, Count, Delta, Panel, Quiet, SubHead, shortDate, usd } from "./ui";

/** Comercial del mes: creadas, enviadas, monto y archivadas, contra el mismo tramo del mes anterior. */
export async function CommercialBlock({ viewer, className }: { viewer: DashboardViewer; className?: string }) {
  let data: Awaited<ReturnType<typeof loadCommercial>>;
  try {
    data = await loadCommercial(viewer);
  } catch (error) {
    console.error("[dashboard] comercial", error);
    return <BlockError title="Comercial del mes" className={className} />;
  }
  const money = viewer.seesSalePrices;
  const { kpis } = data;
  const tiles = [
    { label: "Creadas", cmp: kpis.created, value: <Count value={kpis.created.current} /> },
    { label: "Enviadas (PDF generado)", cmp: kpis.issued, value: <Count value={kpis.issued.current} /> },
    ...(money ? [{ label: "Monto enviado", cmp: kpis.issuedAmount, value: <>{usd(kpis.issuedAmount.current)}</>, wide: true }] : []),
    { label: "Archivadas", cmp: kpis.archived, value: <Count value={kpis.archived.current} />, lowerIsBetter: true },
  ];

  return (
    <Panel
      eyebrow={`Comercial · ${monthName(new Date())}`}
      title={viewer.quotesAll ? "Cotizaciones del mes" : "Tus cotizaciones del mes"}
      action={{ href: "/admin/quotes", label: "Cotizaciones" }}
      className={className}
      tour="dash-commercial"
    >
      <p className="-mt-1 mb-3 text-xs text-muted-foreground">Del 1 a hoy, contra el mismo tramo del mes pasado ({data.previousLabel}).</p>
      <div className={cn("grid gap-px overflow-hidden rounded-md border border-border bg-border", money ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3")}>
        {tiles.map((t) => (
          <div key={t.label} className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold leading-none tracking-tight tabular-nums">{t.value}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <Delta cmp={t.cmp} lowerIsBetter={"lowerIsBetter" in t && t.lowerIsBetter} />
              <span className="text-[11px] text-muted-foreground tabular-nums">
                antes {"wide" in t && t.wide ? usd(t.cmp.previous) : t.cmp.previous.toLocaleString("es-AR")}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Aprobadas y perdidas por el cliente: el sistema todavía no registra ese resultado. «Archivadas» son las que se cerraron en el mes.
      </p>

      <div className={cn("mt-2 grid gap-x-8", data.bySeller ? "xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : "")}>
        <div className="min-w-0">
          <SubHead aside={money && data.openCount ? `${data.openCount} abiertas · ${usd(data.openAmount)}` : `${data.openCount} abiertas`}>Abiertas con más monto</SubHead>
          {data.topOpen.length ? (
            <ol className="divide-y divide-border rounded-md border border-border">
              {data.topOpen.map((q) => (
                <li key={q.id}>
                  <Link href={`/admin/quotes/${q.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-secondary/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{q.client}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {q.number} · {quoteStatusLabel(q.status)}
                        {q.expiresAt ? ` · vence ${shortDate(q.expiresAt)}` : ""}
                        {viewer.quotesAll && q.owner ? ` · ${q.owner}` : ""}
                      </span>
                    </span>
                    {money ? <span className="shrink-0 text-sm font-semibold tabular-nums">{usd(q.amount)}</span> : null}
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <Quiet>No hay cotizaciones abiertas.</Quiet>
          )}
        </div>

        {data.bySeller ? (
          <div className="min-w-0">
            <SubHead>Por vendedor</SubHead>
            {data.bySeller.length ? (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="whitespace-nowrap bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Vendedor</th>
                      <th className="px-3 py-2 text-right font-medium">Creadas</th>
                      <th className="px-3 py-2 text-right font-medium">Enviadas</th>
                      {money ? <th className="px-3 py-2 text-right font-medium">Monto enviado</th> : null}
                      <th className="px-3 py-2 text-right font-medium">Abiertas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.bySeller.map((s) => (
                      <tr key={s.ownerId} className="hover:bg-secondary/30">
                        <td className="px-3 py-2">
                          <Link href={`/admin/quotes?owner=${s.ownerId}`} className="font-medium hover:text-accent hover:underline">{s.name}</Link>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.created}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.issued}</td>
                        {money ? <td className="px-3 py-2 text-right font-medium tabular-nums">{s.issuedAmount ? usd(s.issuedAmount) : "—"}</td> : null}
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s.open}
                          {money && s.openAmount ? <span className="ml-1 text-xs text-muted-foreground">({usd(s.openAmount)})</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Quiet>Este mes todavía nadie cotizó.</Quiet>
            )}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
