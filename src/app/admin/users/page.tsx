import Link from "next/link";
import { Prisma, type UserRole } from "@prisma/client";
import { KeyRound, Mail, ShieldCheck, Store, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PRICE_ACCESS_OPTIONS, parsePermissions, permissionsHave, type PriceAccess } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UserFormModal } from "@/components/admin/user-form-modal";
import { CustomRolesManager, type RoleSummary } from "@/components/admin/custom-roles-manager";
import { formatDate } from "@/lib/utils";
import { USER_TYPE_LABEL, loadUserFormOptions } from "@/server/users-ui";
import { ensureSystemRoles } from "@/server/system-roles";

export const metadata = { title: "Admin · Usuarios y roles" };
export const dynamic = "force-dynamic";

type View = "equipo" | "portal" | "roles";
const TEAM: UserRole[] = ["STAFF", "ADMIN", "SUPER_ADMIN"];
const PRICE_LABEL: Record<PriceAccess, string> = { full: "Ve costos", sale: "Solo venta", none: "Sin precios" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export default async function Page({ searchParams }: { searchParams: { q?: string; vista?: string; status?: string; rol?: string } }) {
  const { user: actor, permissions, isAdmin } = await requireStaff(["users.view", "clients.portal_users"]);
  const canManage = permissionsHave(permissions, "users.manage");
  const canPortal = canManage || permissionsHave(permissions, "clients.portal_users");
  const canRoles = permissionsHave(permissions, "roles.manage");
  // Sin «Ver usuarios» (ej. vendedor): solo los accesos al portal de sus propias empresas.
  const seesTeam = permissionsHave(permissions, "users.view");
  const ownClientsOnly = !isAdmin && !permissionsHave(permissions, "clients.view_all");
  const view: View =
    !seesTeam || searchParams.vista === "portal" ? "portal" : searchParams.vista === "roles" && canRoles ? "roles" : "equipo";
  // Si el deploy no llegó a crear el rol Vendedor, se crea acá (idempotente).
  await ensureSystemRoles().catch((e) => console.error("[roles] ensure", e));

  const q = searchParams.q?.trim();
  const search: Prisma.UserWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { client: { companyName: { contains: q, mode: "insensitive" } } },
        ],
      }
    : {};
  const where: Prisma.UserWhereInput = {
    ...search,
    role: view === "portal" ? "CLIENT" : { in: TEAM },
    ...(view === "portal" && ownClientsOnly ? { client: { ownerId: actor.id } } : {}),
    ...(searchParams.rol ? { customRoleId: searchParams.rol } : {}),
    ...(searchParams.status ? { isActive: searchParams.status === "active" } : {}),
  };

  const now = new Date();
  const [users, options, teamActive, portalActive, pendingInvites, tempPasswords, roleRows] = await Promise.all([
    view === "roles"
      ? Promise.resolve([])
      : prisma.user.findMany({
          where,
          orderBy: view === "portal" ? [{ client: { companyName: "asc" } }, { name: "asc" }] : [{ role: "asc" }, { name: "asc" }],
          include: { client: { select: { id: true, companyName: true } }, customRole: { select: { name: true, permissionsJson: true, isActive: true } } },
          take: 500,
        }),
    loadUserFormOptions(),
    prisma.user.count({ where: { role: { in: TEAM }, isActive: true } }),
    prisma.user.count({ where: { role: "CLIENT", isActive: true } }),
    prisma.accountActivationToken.count({ where: { usedAt: null, expiresAt: { gt: now } } }),
    prisma.user.count({ where: { mustChangePassword: true, isActive: true } }),
    prisma.customRole.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], include: { _count: { select: { users: true } } } }),
  ]);

  const roles: RoleSummary[] = roleRows.map((r) => {
    const perms = parsePermissions(r.permissionsJson as unknown);
    return {
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      type: r.baseSystemRole === "CLIENT" ? "CLIENT" : r.baseSystemRole === "STAFF" ? "STAFF" : "LEGACY_ADMIN",
      scopes: perms.scopes,
      priceAccess: perms.priceAccess ?? "none",
      isActive: r.isActive,
      users: r._count.users,
      systemKey: r.key,
    };
  });
  const sellerRole = roleRows.find((r) => r.key === "vendedor");

  const ownClientIds = ownClientsOnly
    ? new Set((await prisma.client.findMany({ where: { ownerId: actor.id }, select: { id: true } })).map((c) => c.id))
    : null;
  const common = { clients: ownClientIds ? options.clients.filter((c) => ownClientIds.has(c.id)) : options.clients, roles: options.roles, isSuper: actor.role === "SUPER_ADMIN", isAdmin: actor.role === "ADMIN" || actor.role === "SUPER_ADMIN" };
  const tabHref = (v: View) => `/admin/users?vista=${v}`;

  const stats = [
    { label: "Equipo activo", value: teamActive, icon: ShieldCheck, href: tabHref("equipo") },
    { label: "Vendedores", value: sellerRole?._count.users ?? 0, icon: Store, href: sellerRole ? `${tabHref("equipo")}&rol=${sellerRole.id}` : tabHref("equipo") },
    { label: "Clientes con acceso al portal", value: portalActive, icon: Users, href: tabHref("portal") },
    { label: "Invitaciones sin usar", value: pendingInvites, icon: Mail, href: tabHref("equipo") },
    { label: "Con clave temporal", value: tempPasswords, icon: KeyRound, href: tabHref("equipo") },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios y roles"
        description="Quién entra a la plataforma: el equipo interno (cada uno con su rol) y las personas de cada empresa cliente."
        actions={
          canManage || canPortal ? (
            <div className="flex flex-wrap gap-2">
              {canManage ? <UserFormModal {...common} kind="staff" triggerLabel="Nuevo usuario del equipo" /> : null}
              {canPortal ? <UserFormModal {...common} kind="portal" triggerLabel="Nuevo acceso de cliente" triggerVariant={canManage ? "outline" : "primary"} /> : null}
            </div>
          ) : null
        }
      />

      {seesTeam ? (
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="h-full transition-shadow hover:shadow-elevated">
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-2xl font-semibold tabular-nums leading-none">{s.value}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{s.label}</span>
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      ) : null}

      {seesTeam ? (
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {(
          [
            ["equipo", "Equipo interno"],
            ["portal", "Clientes del portal"],
            ...(canRoles ? [["roles", `Roles y permisos (${roles.length})`]] : []),
          ] as Array<[View, string]>
        ).map(([v, label]) => (
          <Link
            key={v}
            href={tabHref(v)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      ) : null}

      {view === "roles" ? (
        <Card>
          <CardContent className="p-5">
            <CustomRolesManager roles={roles} />
          </CardContent>
        </Card>
      ) : (
        <>
          <form className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input type="hidden" name="vista" value={view} />
            <Input name="q" defaultValue={q} placeholder={view === "portal" ? "Buscar por persona, email o empresa" : "Buscar por nombre o email"} />
            {view === "equipo" ? (
              <Select name="rol" defaultValue={searchParams.rol ?? ""}>
                <option value="">Todos los roles</option>
                {options.roles
                  .filter((r) => !r.forPortal)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </Select>
            ) : (
              <span />
            )}
            <Select name="status" defaultValue={searchParams.status ?? ""}>
              <option value="">Activos e inactivos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </Select>
            <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Filtrar</button>
          </form>

          {users.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                {view === "portal" ? "No hay accesos de clientes que coincidan." : "No hay usuarios del equipo que coincidan."}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {users.map((u) => {
                const perms = u.customRole?.isActive ? parsePermissions(u.customRole.permissionsJson) : null;
                const price: PriceAccess = u.role === "ADMIN" || u.role === "SUPER_ADMIN" ? "full" : perms?.priceAccess ?? "none";
                return (
                  <Link key={u.id} href={`/admin/users/${u.id}`}>
                    <Card className={`h-full transition-all hover:-translate-y-0.5 hover:shadow-elevated ${u.isActive ? "" : "opacity-60"}`}>
                      <CardContent className="flex gap-3 p-4">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${u.role === "CLIENT" ? "bg-secondary text-foreground" : "bg-primary text-primary-foreground"}`}>
                          {initials(u.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{u.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                          <span className="mt-2 flex flex-wrap gap-1">
                            {u.role === "CLIENT" ? (
                              u.client ? <Badge tone="muted">{u.client.companyName}</Badge> : <Badge tone="warning">sin empresa</Badge>
                            ) : u.role === "STAFF" ? (
                              u.customRole ? <Badge tone="accent">{u.customRole.name}</Badge> : <Badge tone="warning">sin rol</Badge>
                            ) : (
                              <Badge tone="primary">{USER_TYPE_LABEL[u.role]}</Badge>
                            )}
                            {u.role !== "CLIENT" ? (
                              <Badge tone={price === "full" ? "warning" : "muted"} title={PRICE_ACCESS_OPTIONS.find((o) => o.value === price)?.help}>
                                {PRICE_LABEL[price]}
                              </Badge>
                            ) : null}
                            {!u.isActive ? <Badge tone="muted">Inactivo</Badge> : null}
                            {u.mustChangePassword ? <Badge tone="warning">clave temporal</Badge> : null}
                          </span>
                          <span className="mt-2 block text-[11px] text-muted-foreground">
                            {u.lastLoginAt ? `Último acceso ${formatDate(u.lastLoginAt)}` : "Todavía no entró"}
                          </span>
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
