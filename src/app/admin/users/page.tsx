import Link from "next/link";
import { Prisma, type UserRole } from "@prisma/client";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { permissionsHave } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserFormModal } from "@/components/admin/user-form-modal";
import { formatDate } from "@/lib/utils";
import { USER_TYPE_LABEL, loadUserFormOptions } from "@/server/users-ui";

export const metadata = { title: "Admin · Usuarios" };

const ROLE_FILTERS: Record<string, UserRole[]> = {
  staff: ["STAFF", "ADMIN", "SUPER_ADMIN"],
  portal: ["CLIENT"],
};

export default async function Page({ searchParams }: { searchParams: { q?: string; tipo?: string; status?: string; rol?: string } }) {
  const { user: actor, permissions } = await requireStaff("users.view");
  const canManage = permissionsHave(permissions, "users.manage");
  const q = searchParams.q?.trim();
  const tipo = searchParams.tipo === "portal" || searchParams.tipo === "staff" ? searchParams.tipo : "";
  const where: Prisma.UserWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { client: { companyName: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(tipo ? { role: { in: ROLE_FILTERS[tipo] } } : {}),
    ...(searchParams.rol ? { customRoleId: searchParams.rol } : {}),
    ...(searchParams.status ? { isActive: searchParams.status === "active" } : {}),
  };
  const [users, options] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: { client: { select: { id: true, companyName: true } }, customRole: { select: { name: true } } },
      take: 500,
    }),
    loadUserFormOptions(),
  ]);
  const common = { clients: options.clients, roles: options.roles, isSuper: actor.role === "SUPER_ADMIN", isAdmin: actor.role === "ADMIN" || actor.role === "SUPER_ADMIN" };
  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description="Quién entra a la plataforma: el equipo interno (panel) y las personas de cada cliente (portal)."
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <UserFormModal {...common} kind="staff" triggerLabel="Nuevo usuario del equipo" />
              <UserFormModal {...common} kind="portal" triggerLabel="Nuevo acceso de cliente" triggerVariant="outline" />
            </div>
          ) : null
        }
      />
      <Card>
        <CardContent className="p-4">
          <form className="grid gap-2 sm:grid-cols-5">
            <Input name="q" defaultValue={q} placeholder="Buscar por nombre, email o empresa" className="sm:col-span-2" />
            <Select name="tipo" defaultValue={tipo}>
              <option value="">Equipo y clientes</option>
              <option value="staff">Solo equipo interno</option>
              <option value="portal">Solo clientes del portal</option>
            </Select>
            <Select name="rol" defaultValue={searchParams.rol ?? ""}>
              <option value="">Todos los roles</option>
              {options.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Select name="status" defaultValue={searchParams.status ?? ""}>
                <option value="">Todos</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </Select>
              <button className="rounded-md bg-primary px-4 text-sm text-primary-foreground">Filtrar</button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          {!users.length ? (
            <TableEmpty message="No encontramos usuarios." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Nombre</TH>
                  <TH>Email</TH>
                  <TH>Tipo y rol</TH>
                  <TH>Empresa</TH>
                  <TH>Último acceso</TH>
                  <TH>Estado</TH>
                </TR>
              </THead>
              <TBody>
                {users.map((u) => (
                  <TR key={u.id}>
                    <TD>
                      <Link className="font-medium hover:underline" href={`/admin/users/${u.id}`}>
                        {u.name}
                      </Link>
                    </TD>
                    <TD className="text-sm">{u.email}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={u.role === "CLIENT" ? "muted" : u.role === "STAFF" ? "accent" : "primary"}>{USER_TYPE_LABEL[u.role]}</Badge>
                        {u.customRole && u.role !== "ADMIN" && u.role !== "SUPER_ADMIN" ? <Badge tone="muted">{u.customRole.name}</Badge> : null}
                        {u.role === "STAFF" && !u.customRole ? <Badge tone="warning">sin rol</Badge> : null}
                      </div>
                    </TD>
                    <TD>
                      {u.client ? (
                        <Link className="text-primary hover:underline" href={`/admin/clients/${u.client.id}`}>
                          {u.client.companyName}
                        </Link>
                      ) : u.role === "CLIENT" ? (
                        <Badge tone="warning">sin empresa</Badge>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="text-sm">{u.lastLoginAt ? formatDate(u.lastLoginAt) : "Nunca"}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={u.isActive ? "success" : "muted"}>{u.isActive ? "Activo" : "Inactivo"}</Badge>
                        {u.mustChangePassword ? <Badge tone="warning">clave temporal</Badge> : null}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
