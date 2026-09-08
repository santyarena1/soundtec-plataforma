import Link from "next/link";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserFormModal } from "@/components/admin/user-form-modal";
import { formatDate } from "@/lib/utils";
export const metadata = { title: "Admin · Usuarios" };
const label: Record<string, string> = {
  CLIENT: "Cliente del portal",
  ADMIN: "Administrador",
  SUPER_ADMIN: "Super admin",
};
export default async function Page({
  searchParams,
}: {
  searchParams: { q?: string; role?: string; status?: string };
}) {
  const admin = await requireAdmin();
  const q = searchParams.q?.trim();
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
    ...(searchParams.role ? { role: searchParams.role as "CLIENT" | "ADMIN" | "SUPER_ADMIN" } : {}),
    ...(searchParams.status ? { isActive: searchParams.status === "active" } : {}),
  };
  const [users, clients, roles] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: { client: { select: { id: true, companyName: true } } },
    }),
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
    prisma.customRole.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description="Personas que ingresan a la plataforma y sus accesos."
        actions={
          <UserFormModal
            clients={clients.map((x) => ({ id: x.id, name: x.companyName }))}
            roles={roles}
            isSuper={admin.role === "SUPER_ADMIN"}
          />
        }
      />
      <Card>
        <CardContent className="p-4">
          <form className="grid gap-2 sm:grid-cols-4">
            <Input name="q" defaultValue={q} placeholder="Buscar por nombre, email o cliente" />
            <Select name="role" defaultValue={searchParams.role || ""}>
              <option value="">Todos los roles</option>
              <option value="CLIENT">Clientes del portal</option>
              <option value="ADMIN">Administradores</option>
              {admin.role === "SUPER_ADMIN" ? (
                <option value="SUPER_ADMIN">Super admins</option>
              ) : null}
            </Select>
            <Select name="status" defaultValue={searchParams.status || ""}>
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </Select>
            <button className="rounded-md bg-primary px-4 text-sm text-primary-foreground">
              Aplicar filtros
            </button>
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
                  <TH>Rol</TH>
                  <TH>Cliente</TH>
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
                    <TD>{u.email}</TD>
                    <TD>
                      <Badge tone={u.role === "CLIENT" ? "muted" : "primary"}>
                        {label[u.role]}
                      </Badge>
                    </TD>
                    <TD>
                      {u.client ? (
                        <Link
                          className="text-primary hover:underline"
                          href={`/admin/clients/${u.client.id}`}
                        >
                          {u.client.companyName}
                        </Link>
                      ) : u.role === "CLIENT" ? (
                        <Badge tone="warning">— sin cliente —</Badge>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>{u.lastLoginAt ? formatDate(u.lastLoginAt) : "Nunca"}</TD>
                    <TD>
                      <Badge tone={u.isActive ? "success" : "muted"}>
                        {u.isActive ? "Activo" : "Inactivo"}
                      </Badge>
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
