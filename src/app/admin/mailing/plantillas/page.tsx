import Link from "next/link";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/utils";
import { MailingNav } from "@/components/mailing/mailing-nav";
import { HtmlThumbnail } from "@/components/mailing/html-tools";
import { getMailingConfig } from "@/lib/mailing/config";
import { TemplateImportPanel, TemplateRowActions } from "./templates-client";

export const metadata = { title: "Admin · Plantillas de mail" };

export default async function MailTemplatesPage() {
  await requireStaff("marketing.manage");
  const [templates, config] = await Promise.all([
    prisma.mailTemplate.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, name: true, description: true, html: true, warnings: true, updatedAt: true } }),
    getMailingConfig(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Plantillas HTML" description="Newsletters armados afuera (en otro programa o por un diseñador) para mandar tal cual, con el remitente, las listas, las bajas y el seguimiento de siempre." />
      <MailingNav active="plantillas" simulate={config.simulate ? { reason: config.simulateReason } : null} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <section className="space-y-3 self-start rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Importar una plantilla</h2>
          <TemplateImportPanel />
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Guardadas</h2>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay plantillas.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {templates.map((t) => {
                const warnings = Array.isArray(t.warnings) ? t.warnings.filter((w) => (w as { code?: string }).code !== "no_unsubscribe").length : 0;
                return (
                  <li key={t.id} className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-sm transition hover:border-primary/30">
                    <Link href={`/admin/mailing/plantillas/${t.id}`} aria-label={`Abrir ${t.name}`}>
                      <HtmlThumbnail html={t.html} />
                    </Link>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/mailing/plantillas/${t.id}`} className="block truncate font-semibold hover:underline">
                          {t.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {Math.round(Buffer.byteLength(t.html, "utf8") / 1024)} KB · {formatDate(t.updatedAt)}
                          {warnings ? ` · ${warnings} aviso${warnings === 1 ? "" : "s"}` : ""}
                        </p>
                        {t.description ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p> : null}
                      </div>
                      <TemplateRowActions id={t.id} name={t.name} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
