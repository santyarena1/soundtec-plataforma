import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { upsertUser, toggleUserActive } from "@/server/actions/admin-catalog";
import { formatDate } from "@/lib/utils";
import { ShieldCheck, UserPlus } from "lucide-react";

export const metadata = { title: "Admin · Usuarios" };

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: "Super administrador",
  ADMIN: "Administrador",
  CLIENT: "Usuario de portal",
};

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const [users, customRoles, clients] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "desc" }],
      include: {
        customRole: { select: { id: true, name: true, isActive: true } },
        client: { select: { id: true, companyName: true } },
      },
    }),
    prisma.customRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
  ]);

  const isSuper = admin.role === "SUPER_ADMIN";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios del sistema"
        description="Personas que ingresan a la plataforma (admin, empleados, usuarios de portal). Las empresas clientes se gestionan en Clientes."
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/clients" variant="outline">
              Gestionar clientes
            </ButtonLink>
            <ButtonLink href="/admin/users/roles" variant="outline">
              <ShieldCheck className="h-4 w-4" /> Roles personalizados
            </ButtonLink>
          </div>
        }
      />

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="heading-3">Crear usuario de acceso</h2>
              <p className="text-xs text-muted-foreground">
                Para un usuario de portal, primero creá el cliente comercial y vinculalo acá.
              </p>
            </div>
            <UserPlus className="h-5 w-5 text-muted-foreground" />
          </div>
          <form action={upsertUser} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name" required>Nombre</Label>
              <Input id="name" name="name" required />
            </div>
            <div>
              <Label htmlFor="email" required>Email (login)</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div>
              <Label htmlFor="role">Tipo de usuario</Label>
              <Select id="role" name="role" defaultValue="CLIENT">
                <option value="CLIENT">Usuario de portal</option>
                <option value="ADMIN">Administrador</option>
                {isSuper ? <option value="SUPER_ADMIN">Super administrador</option> : null}
              </Select>
            </div>
            <div>
              <Label htmlFor="clientId">Cliente comercial (si es portal)</Label>
              <Select id="clientId" name="clientId" defaultValue="">
                <option value="">— Sin cliente —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="customRoleId">Rol personalizado</Label>
              <Select id="customRoleId" name="customRoleId" defaultValue="">
                <option value="">Ninguno</option>
                {customRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" name="phone" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="password">Contraseña inicial</Label>
              <Input id="password" name="password" type="password" placeholder="Mínimo 8 caracteres" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked />
              Usuario activo
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit">Crear usuario</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <TableEmpty />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Usuario</TH>
                  <TH>Tipo</TH>
                  <TH>Cliente vinculado</TH>
                  <TH>Rol personalizado</TH>
                  <TH>Último ingreso</TH>
                  <TH>Estado</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {users.map((u) => (
                  <TR key={u.id}>
                    <TD>
                      <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">
                        {u.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </TD>
                    <TD>
                      <Badge tone={u.role === "CLIENT" ? "muted" : "primary"}>{roleLabel[u.role] || u.role}</Badge>
                    </TD>
                    <TD>
                      {u.client ? (
                        <Link href={`/admin/clients/${u.client.id}`} className="text-sm text-accent hover:underline">
                          {u.client.companyName}
                        </Link>
                      ) : u.role === "CLIENT" ? (
                        <span className="text-xs text-destructive">Sin asignar</span>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>{u.customRole?.name || "—"}</TD>
                    <TD className="text-sm text-muted-foreground">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : "Nunca"}
                    </TD>
                    <TD>{u.isActive ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>}</TD>
                    <TD className="text-right">
                      <form action={toggleUserActive} className="inline">
                        <input type="hidden" name="id" value={u.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          {u.isActive ? "Desactivar" : "Activar"}
                        </Button>
                      </form>
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
