import Link from "next/link";
import type { AccountRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCuit } from "@/lib/expo/cuit";
import { formatDate } from "@/lib/utils";
import { RequestActions } from "./request-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Solicitudes de cuenta" };

const TABS: Array<{ key: AccountRequestStatus; label: string }> = [
  { key: "PENDING", label: "Pendientes" },
  { key: "APPROVED", label: "Aprobadas" },
  { key: "REJECTED", label: "Rechazadas" },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission("clients.view");
  const params = await searchParams;
  const status = (TABS.find((t) => t.key === params.status)?.key ?? "PENDING") as AccountRequestStatus;
  const [rows, counts] = await Promise.all([
    prisma.accountRequest.findMany({ where: { status }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.accountRequest.groupBy({ by: ["status"], _count: true }),
  ]);
  const countOf = (s: AccountRequestStatus) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Solicitudes de cuenta" description="Pedidos de cuenta de cliente desde el catálogo público y la expo." />
      <div className="flex gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/account-requests?status=${t.key}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${t.key === status ? "border-primary bg-primary/10 font-semibold" : "border-border"}`}>
            {t.label} ({countOf(t.key)})
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No hay solicitudes" description="Cuando alguien pida una cuenta aparece acá." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto]">
                <div className="space-y-1 text-sm">
                  <p className="text-base font-semibold">{r.company} <span className="text-xs font-normal text-muted-foreground">CUIT {formatCuit(r.cuit)}</span></p>
                  <p>{r.fullName} · <a className="underline" href={`mailto:${r.email}`}>{r.email}</a> · {r.phone}</p>
                  <p className="text-muted-foreground">
                    <Badge tone="muted">{r.activity === "Otra" ? r.activityOther : r.activity}</Badge>
                    {r.location ? ` · ${r.location}` : ""}{r.website ? ` · ${r.website}` : ""}
                  </p>
                  {r.comment ? <p className="whitespace-pre-line text-muted-foreground">{r.comment}</p> : null}
                  <p className="text-xs text-muted-foreground">Recibida {formatDate(r.createdAt)}{r.qrId ? " · vino por QR de expo" : ""}</p>
                  {r.status === "REJECTED" && r.rejectionReason ? <p className="text-xs text-destructive">Motivo: {r.rejectionReason}</p> : null}
                </div>
                {r.status === "PENDING" ? <RequestActions id={r.id} phone={r.phone} name={r.fullName} /> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
