import Link from "next/link";
import type { AccountRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { permissionsHave } from "@/lib/permissions";
import { StaffRequestForm } from "./staff-request-form";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cuitVariants, formatCuit, normalizeCuit } from "@/lib/expo/cuit";
import { formatDate } from "@/lib/utils";
import { portalUserStatus } from "@/lib/clients/portal-status";
import { RegenerateLinkAction, RequestActions } from "./request-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Solicitudes de alta" };

const TABS: Array<{ key: AccountRequestStatus; label: string }> = [
  { key: "PENDING", label: "Pendientes" },
  { key: "APPROVED", label: "Aprobadas" },
  { key: "REJECTED", label: "Rechazadas" },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; nueva?: string }> }) {
  const { user, permissions } = await requireStaff(["account_requests.create", "account_requests.review"]);
  const canReview = permissionsHave(permissions, "account_requests.review");
  const canCreate = permissionsHave(permissions, "account_requests.create");
  const canCreateClient = permissionsHave(permissions, "clients.create");
  const params = await searchParams;
  const status = (TABS.find((t) => t.key === params.status)?.key ?? "PENDING") as AccountRequestStatus;
  // Quien no aprueba ve solo las solicitudes que pidió.
  const mine = canReview ? {} : { requestedById: user.id };
  const [rows, counts] = await Promise.all([
    prisma.accountRequest.findMany({ where: { ...mine, status }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.accountRequest.groupBy({ by: ["status"], where: mine, _count: true }),
  ]);
  const requesters = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.flatMap((r) => (r.requestedById ? [r.requestedById] : [])))] } },
    select: { id: true, name: true },
  });
  const requesterName = new Map(requesters.map((u) => [u.id, u.name]));
  const countOf = (s: AccountRequestStatus) => counts.find((c) => c.status === s)?._count ?? 0;
  // Pendientes cuyo CUIT ya es de un cliente: al aprobar se vinculan a ese cliente.
  const pendingCuits = status === "PENDING" ? [...new Set(rows.flatMap((r) => cuitVariants(r.cuit)))] : [];
  const existingClients = pendingCuits.length
    ? await prisma.client.findMany({ where: { taxId: { in: pendingCuits } }, select: { taxId: true, companyName: true } })
    : [];
  const clientByCuit = new Map(existingClients.map((c) => [normalizeCuit(c.taxId ?? ""), c.companyName]));
  // Pendientes con un mail que ya tiene usuario: al aprobar fallaría.
  const takenEmails =
    status === "PENDING" && rows.length
      ? new Set((await prisma.user.findMany({ where: { email: { in: rows.map((r) => r.email) } }, select: { email: true } })).map((u) => u.email))
      : new Set<string>();
  // Aprobadas: si la persona ya creó su clave o sigue con el link pendiente.
  const createdUsers =
    status === "APPROVED" && rows.length
      ? await prisma.user.findMany({
          where: { id: { in: rows.flatMap((r) => (r.createdUserId ? [r.createdUserId] : [])) } },
          select: {
            id: true,
            isActive: true,
            lastLoginAt: true,
            mustChangePassword: true,
            activationTokens: { where: { usedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { expiresAt: true } },
          },
        })
      : [];
  const statusByUser = new Map(createdUsers.map((u) => [u.id, portalUserStatus({ ...u, pendingToken: u.activationTokens[0] ?? null })]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Solicitudes de alta"
        description={
          canReview
            ? "Empresas que piden cuenta desde la web, la expo o un vendedor. Al aprobar se crea el cliente y la persona recibe el link para crear su clave."
            : "Altas de empresas que pediste. Las aprueba un administrador."
        }
      />
      {canCreateClient ? (
        <p className="text-sm text-muted-foreground">
          ¿El cliente ya está confirmado? Cargalo directo desde{" "}
          <Link href="/admin/clients/nuevo" className="font-medium text-primary hover:underline">
            Nuevo cliente
          </Link>{" "}
          y le das el acceso en el mismo paso.
        </p>
      ) : null}
      {canCreate ? <StaffRequestForm defaultOpen={Boolean(params.nueva)} /> : null}
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
                  <p className="text-base font-semibold">
                    {r.company} <span className="text-xs font-normal text-muted-foreground">CUIT {formatCuit(r.cuit)}</span>
                    {r.status === "PENDING" && takenEmails.has(r.email) ? (
                      <Badge tone="destructive" className="ml-2" title="No se puede aprobar: ese mail ya tiene usuario. Rechazala o dale acceso desde la ficha del cliente.">
                        El mail ya tiene usuario
                      </Badge>
                    ) : null}
                    {r.status === "PENDING" && clientByCuit.has(normalizeCuit(r.cuit)) ? (
                      <Badge tone="warning" className="ml-2" title={`Cliente existente: ${clientByCuit.get(normalizeCuit(r.cuit))}`}>Ya es cliente</Badge>
                    ) : null}
                  </p>
                  <p>{r.fullName} · <a className="underline" href={`mailto:${r.email}`}>{r.email}</a> · {r.phone}</p>
                  <p className="text-muted-foreground">
                    <Badge tone="muted">{r.activity === "Otra" ? r.activityOther : r.activity}</Badge>
                    {r.location ? ` · ${r.location}` : ""}{r.website ? ` · ${r.website}` : ""}
                  </p>
                  {r.comment ? <p className="whitespace-pre-line text-muted-foreground">{r.comment}</p> : null}
                  <p className="text-xs text-muted-foreground">
                    Recibida {formatDate(r.createdAt)}
                    {r.qrId ? " · vino por QR de expo" : ""}
                    {r.origin === "staff" ? ` · pedida por ${requesterName.get(r.requestedById ?? "") ?? "el equipo"}` : ""}
                  </p>
                  {r.origin === "staff" && (r.proposedDiscountPercent != null || r.staffNote) ? (
                    <div className="rounded-md bg-secondary/50 p-2 text-xs">
                      {r.proposedDiscountPercent != null ? <p>Descuento propuesto: <strong>{Number(r.proposedDiscountPercent)} %</strong></p> : null}
                      {r.staffNote ? <p className="whitespace-pre-line text-muted-foreground">{r.staffNote}</p> : null}
                    </div>
                  ) : null}
                  {r.status === "REJECTED" && r.rejectionReason ? <p className="text-xs text-destructive">Motivo: {r.rejectionReason}</p> : null}
                </div>
                {r.status === "PENDING" && canReview ? (
                  <RequestActions id={r.id} phone={r.phone} name={r.fullName} proposedDiscount={r.proposedDiscountPercent != null ? Number(r.proposedDiscountPercent) : null} />
                ) : null}
                {r.status === "PENDING" && !canReview ? <Badge tone="warning">Esperando aprobación</Badge> : null}
                {r.status === "APPROVED" ? (
                  <div className="flex flex-col items-start gap-2 md:items-end">
                    {r.createdUserId && statusByUser.get(r.createdUserId) ? (
                      <Badge tone={statusByUser.get(r.createdUserId)!.tone} title={statusByUser.get(r.createdUserId)!.hint}>
                        {statusByUser.get(r.createdUserId)!.state === "invited" ? "Esperando que cree su clave" : statusByUser.get(r.createdUserId)!.label}
                      </Badge>
                    ) : null}
                    {r.createdClientId ? (
                      <Link href={`/admin/clients/${r.createdClientId}`} className="text-xs font-medium text-primary hover:underline">
                        Ver ficha del cliente
                      </Link>
                    ) : null}
                    {r.createdUserId && canReview && ["invited", "invite_expired"].includes(statusByUser.get(r.createdUserId)?.state ?? "") ? (
                      <RegenerateLinkAction id={r.id} phone={r.phone} name={r.fullName} />
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
