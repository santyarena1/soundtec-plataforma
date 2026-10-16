import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PERMISSION_GROUPS, PRICE_ACCESS_OPTIONS, parsePermissions, permissionsHave, resolveEffectivePermissions } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserFormModal } from "@/components/admin/user-form-modal";
import { UserActions } from "@/components/admin/user-actions";
import { formatDate } from "@/lib/utils";
import { USER_TYPE_LABEL, loadUserFormOptions } from "@/server/users-ui";

export const metadata = { title: "Admin · Usuario" };

export default async function Page({ params }: { params: { id: string } }) {
  const { user: actor, permissions: actorPerms, isAdmin } = await requireStaff(["users.view", "clients.portal_users"]);
  const seesTeam = permissionsHave(actorPerms, "users.view");
  const [user, options, pendingInvite] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.id },
      include: {
        client: { select: { id: true, companyName: true } },
        customRole: { select: { id: true, name: true, permissionsJson: true, isActive: true } },
        _count: { select: { requests: true, ownedQuotes: true, ownedClients: true } },
      },
    }),
    loadUserFormOptions(),
    prisma.accountActivationToken.findFirst({ where: { userId: params.id, usedAt: null, expiresAt: { gt: new Date() } }, select: { expiresAt: true } }),
  ]);
  if (!user) notFound();
  // Sin «Ver usuarios» (ej. vendedor): solo accesos al portal de empresas a su cargo.
  const ownsClient = isAdmin || permissionsHave(actorPerms, "clients.view_all") || (user.clientId ? (await prisma.client.findUnique({ where: { id: user.clientId }, select: { ownerId: true } }))?.ownerId === actor.id : false);
  if (!seesTeam && (user.role !== "CLIENT" || !ownsClient)) redirect("/admin/users");

  const canManageThis =
    (permissionsHave(actorPerms, "users.manage") &&
      (actor.role === "SUPER_ADMIN" || (actor.role === "ADMIN" ? user.role !== "SUPER_ADMIN" : user.role === "STAFF" || user.role === "CLIENT"))) ||
    (permissionsHave(actorPerms, "clients.portal_users") && user.role === "CLIENT" && ownsClient);
  const canDelete = canManageThis && !user._count.requests && !user._count.ownedQuotes && !user._count.ownedClients && user.id !== actor.id;
  const effective = resolveEffectivePermissions({
    baseRole: user.role,
    customPermissions: user.customRole?.isActive ? parsePermissions(user.customRole.permissionsJson) : null,
  });
  const priceLabel = PRICE_ACCESS_OPTIONS.find((o) => o.value === (effective.fullAccess ? "full" : effective.priceAccess ?? "none"))?.label;

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="text-sm text-muted-foreground">
        ← Volver a usuarios
      </Link>
      <PageHeader
        title={user.name}
        description={user.email}
        actions={
          canManageThis ? (
            <UserFormModal
              user={user}
              clients={options.clients}
              roles={options.roles}
              isSuper={actor.role === "SUPER_ADMIN"}
              isAdmin={actor.role === "ADMIN" || actor.role === "SUPER_ADMIN"}
              triggerLabel="Editar usuario"
            />
          ) : null
        }
      />
      <div className="flex flex-wrap gap-2">
        <Badge tone={user.role === "CLIENT" ? "muted" : "primary"}>{USER_TYPE_LABEL[user.role]}</Badge>
        {user.customRole && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN" ? <Badge tone="accent">{user.customRole.name}</Badge> : null}
        <Badge tone={user.isActive ? "success" : "muted"}>{user.isActive ? "Activo" : "Inactivo"}</Badge>
        {user.mustChangePassword ? <Badge tone="warning">Clave temporal: la cambia al entrar</Badge> : null}
        {pendingInvite ? <Badge tone="warning">Invitación pendiente (vence {formatDate(pendingInvite.expiresAt)})</Badge> : null}
      </div>

      {user.role === "CLIENT" ? (
        <Card>
          <CardContent className="p-5">
            {user.client ? (
              <>
                <p className="text-xs text-muted-foreground">Empresa</p>
                <Link className="font-medium text-primary hover:underline" href={`/admin/clients/${user.client.id}`}>
                  {user.client.companyName}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">Los precios y descuentos que ve salen de las condiciones comerciales de la empresa.</p>
              </>
            ) : (
              <p className="text-warning">Este usuario no tiene empresa vinculada. Editalo para asignarla.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Teléfono" value={user.phone || "No informado"} />
          <Info label="Último acceso" value={user.lastLoginAt ? formatDate(user.lastLoginAt) : "Nunca ingresó"} />
          <Info label="Clave cambiada" value={user.passwordChangedAt ? formatDate(user.passwordChangedAt) : "—"} />
          <Info label="Alta" value={formatDate(user.createdAt)} />
          {user.role !== "CLIENT" ? (
            <>
              <Info label="Firma en cotizaciones" value={user.quoteSignName || user.name} />
              <Info label="Cargo en la firma" value={user.quoteSignTitle || "No informado"} />
              <Info label="Cotizaciones" value={String(user._count.ownedQuotes)} />
              <Info label="Clientes a cargo" value={String(user._count.ownedClients)} />
            </>
          ) : null}
        </CardContent>
      </Card>

      {user.role === "STAFF" ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Qué puede hacer</h2>
              <Link href="/admin/settings/roles" className="text-xs text-primary hover:underline">
                Editar el rol {user.customRole?.name ?? ""}
              </Link>
            </div>
            {!user.customRole ? <p className="text-sm text-warning">No tiene rol: solo ve el inicio del panel. Asignale uno.</p> : null}
            <p className="text-sm">
              <span className="text-muted-foreground">Precios:</span> <span className="font-medium">{priceLabel}</span>
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PERMISSION_GROUPS.filter((g) => !g.portal).map((g) => {
                const allowed = g.items.filter((i) => permissionsHave(effective, i.scope));
                if (!allowed.length) return null;
                return (
                  <div key={g.title}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>
                    <ul className="mt-1 space-y-0.5 text-sm">
                      {allowed.map((i) => (
                        <li key={i.scope}>· {i.label}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="font-semibold">Acceso</h2>
          <UserActions id={user.id} email={user.email} name={user.name} isActive={user.isActive} canDelete={canDelete} canManage={canManageThis} />
          {canManageThis && !canDelete && user.id !== actor.id ? (
            <p className="text-sm text-muted-foreground">No se puede eliminar porque tiene pedidos, cotizaciones o clientes a cargo. Desactivalo para conservar el historial.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p>{value}</p>
    </div>
  );
}
