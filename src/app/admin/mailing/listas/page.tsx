import Link from "next/link";
import { Database, FileSpreadsheet } from "lucide-react";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/utils";
import { MailingNav } from "@/components/mailing/mailing-nav";
import { getMailingConfig } from "@/lib/mailing/config";
import { AUDIENCE_SOURCES, readAudienceQuery } from "@/lib/mailing/audience";
import { loadFilterOptions } from "@/lib/mailing/filter-options";
import { ListsManager } from "./lists-manager";
import { ListRowActions } from "./list-row-actions";

export const metadata = { title: "Admin · Listas de mails" };

export default async function MailingListsPage() {
  await requireStaff("marketing.manage");
  const [lists, config, options] = await Promise.all([
    prisma.mailingList.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, name: true, kind: true, query: true, description: true, updatedAt: true, _count: { select: { members: true } } } }),
    getMailingConfig(),
    loadFilterOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Listas" description="A quién le pueden llegar las campañas. Las listas desde la base se recalculan en cada envío (suman a los clientes nuevos); las importadas son una foto del Excel." />
      <MailingNav active="listas" simulate={config.simulate ? { reason: config.simulateReason } : null} />

      <ListsManager options={options} importTargets={lists.filter((l) => l.kind === "IMPORTED").map((l) => ({ id: l.id, name: l.name }))} />

      <section className="space-y-3">
        <h2 className="font-semibold">Listas guardadas</h2>
        {lists.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay listas.</p>
        ) : (
          <ul className="grid gap-2">
            {lists.map((list) => {
              const query = list.kind === "DYNAMIC" ? readAudienceQuery(list.query) : null;
              const Icon = list.kind === "DYNAMIC" ? Database : FileSpreadsheet;
              return (
                <li key={list.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
                  <Icon className="hidden h-5 w-5 shrink-0 text-primary sm:block" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/mailing/listas/${list.id}`} className="font-semibold hover:underline">
                      {list.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {query ? `Desde la base · ${AUDIENCE_SOURCES[query.source].label}` : `Importada · ${list._count.members.toLocaleString("es-AR")} personas`}
                      {list.description ? ` · ${list.description}` : ""} · {formatDate(list.updatedAt)}
                    </p>
                  </div>
                  <ListRowActions id={list.id} name={list.name} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
