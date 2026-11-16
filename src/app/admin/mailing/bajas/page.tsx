import Link from "next/link";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { cn, formatDate } from "@/lib/utils";
import { MailingNav } from "@/components/mailing/mailing-nav";
import { getMailingConfig } from "@/lib/mailing/config";
import { SUPPRESSION_LABELS, type SuppressionReason } from "@/lib/mailing/events";
import { AddSuppressions, RemoveSuppression } from "./suppression-actions";

export const metadata = { title: "Admin · Bajas y rebotes" };

const PAGE_SIZE = 200;
const REASONS = Object.keys(SUPPRESSION_LABELS) as SuppressionReason[];

export default async function SuppressionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff("marketing.manage");
  const sp = await searchParams;
  const reason = REASONS.includes(sp.motivo as SuppressionReason) ? (sp.motivo as SuppressionReason) : null;
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 120);
  const page = Math.max(1, Number(sp.pagina) || 1);
  const where = { ...(reason ? { reason } : {}), ...(q ? { email: { contains: q } } : {}) };
  const [rows, total, counts, config] = await Promise.all([
    prisma.mailSuppression.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.mailSuppression.count({ where }),
    prisma.mailSuppression.groupBy({ by: ["reason"], _count: { _all: true } }),
    getMailingConfig(),
  ]);
  const countOf = (r: string) => counts.find((c) => c.reason === r)?._count._all ?? 0;
  const all = counts.reduce((sum, c) => sum + c._count._all, 0);
  const link = (params: Record<string, string>) => `/admin/mailing/bajas?${new URLSearchParams(Object.fromEntries(Object.entries({ motivo: reason ?? "", q, ...params }).filter(([, v]) => v)))}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bajas y rebotes"
        description="Direcciones a las que no se manda nunca más, en ninguna campaña: quienes se dieron de baja, los rebotes permanentes y quienes marcaron un mail como spam. Se cargan solas."
      />
      <MailingNav active="bajas" simulate={config.simulate ? { reason: config.simulateReason } : null} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap gap-1.5">
            <Link href={link({ motivo: "", pagina: "" })} className={cn("rounded-full px-3 py-1 text-xs font-medium", !reason ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
              Todas · {all}
            </Link>
            {REASONS.map((r) => (
              <Link key={r} href={link({ motivo: r, pagina: "" })} className={cn("rounded-full px-3 py-1 text-xs font-medium", reason === r ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                {SUPPRESSION_LABELS[r]} · {countOf(r)}
              </Link>
            ))}
          </div>
          <form action="/admin/mailing/bajas">
            {reason ? <input type="hidden" name="motivo" value={reason} /> : null}
            <input name="q" defaultValue={q} placeholder="Buscar un mail" className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary/60" />
          </form>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Mail</th>
                  <th className="py-2 pr-3 font-medium">Motivo</th>
                  <th className="py-2 pr-3 font-medium">Desde</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3">
                      <p className="font-medium">{r.email}</p>
                      {r.detail ? <p className="max-w-[320px] truncate text-xs text-muted-foreground">{r.detail}</p> : null}
                    </td>
                    <td className="py-2 pr-3 text-xs">{SUPPRESSION_LABELS[r.reason as SuppressionReason] ?? r.reason}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground">{formatDate(r.createdAt)}</td>
                    <td className="py-2 text-right">{r.reason === "MANUAL" || r.reason === "BOUNCE" ? <RemoveSuppression id={r.id} email={r.email} /> : null}</td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      Nadie por ahora.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {total > PAGE_SIZE ? (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {total} direcciones · página {page}
              </span>
              <div className="flex gap-2">
                {page > 1 ? <Link href={link({ pagina: String(page - 1) })}>Anterior</Link> : null}
                {page * PAGE_SIZE < total ? <Link href={link({ pagina: String(page + 1) })}>Siguiente</Link> : null}
              </div>
            </div>
          ) : null}
        </section>
        <section className="space-y-3 self-start rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Cargar a mano</h2>
          <p className="text-sm text-muted-foreground">Alguien que pidió la baja por teléfono o WhatsApp, o direcciones que no tienen que recibir promos (proveedores, competencia).</p>
          <AddSuppressions />
          <p className="text-xs text-muted-foreground">
            Las bajas y las quejas de spam no se pueden quitar desde acá: esa persona pidió no recibir más (Ley 25.326). Un rebote sí, si te confirman que la casilla ya funciona.
          </p>
        </section>
      </div>
    </div>
  );
}
