import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { updateUserFull } from "@/server/actions/user-role-management";

function textoRol(role: string) {
  if (role === "SUPER_ADMIN") return "Super administrador";
  if (role === "ADMIN") return "Administrador";
  return "Usuario de portal";
}

export const metadata = { title: "Admin · Usuario" };

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const [user, customRoles, clients] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        customRole: true,
        client: { select: { id: true, companyName: true, isActive: true } },
      },
    }),
    prisma.customRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
  ]);

  if (!user) notFound();

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="text-sm text-muted-foreground hover:text-foreground">
        ← Volver a usuarios
      </Link>

      <PageHeader
        title={user.name}
        description={`${user.email} · acceso al sistema`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={user.role === "CLIENT" ? "muted" : "primary"}>{textoRol(user.role)}</Badge>
            {user.customRole ? <Badge tone="accent">{user.customRole.name}</Badge> : null}
            {user.isActive ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>}
          </div>
        }
      />

      {user.role === "CLIENT" && user.client ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium">Cliente comercial vinculado</p>
              <p className="text-sm text-muted-foreground">{user.client.companyName}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Precios, visibilidad, cuenta corriente y solicitudes se gestionan en la ficha del cliente.
              </p>
            </div>
            <Link
              href={`/admin/clients/${user.client.id}`}
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Ir a ficha del cliente
            </Link>
          </CardContent>
        </Card>
      ) : user.role === "CLIENT" ? (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Este usuario de portal no tiene un cliente comercial asignado. Asignalo abajo o creá un cliente en{" "}
            <Link href="/admin/clients" className="text-accent hover:underline">
              Clientes
            </Link>
            .
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="heading-3">Datos de acceso</h2>
          <form action={updateUserFull} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={user.id} />
            <div>
              <Label htmlFor="userName" required>Nombre</Label>
              <Input id="userName" name="name" defaultValue={user.name} required />
            </div>
            <div>
              <Label htmlFor="userEmail" required>Email (login)</Label>
              <Input id="userEmail" name="email" type="email" defaultValue={user.email} required />
            </div>
            <div>
              <Label htmlFor="userRole">Tipo de usuario</Label>
              <Select id="userRole" name="role" defaultValue={user.role}>
                <option value="CLIENT">Usuario de portal (cliente)</option>
                <option value="ADMIN">Administrador</option>
                <option value="SUPER_ADMIN">Super administrador</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="userCustomRole">Rol personalizado</Label>
              <Select id="userCustomRole" name="customRoleId" defaultValue={user.customRoleId || ""}>
                <option value="">Ninguno</option>
                {customRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
                <Label htmlFor="clientId">Cliente comercial (empresa)</Label>
                <Select id="clientId" name="clientId" defaultValue={user.clientId || ""}>
                  <option value="">— Seleccionar cliente —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Obligatorio para usuarios de portal. Primero creá el cliente en{" "}
                  <Link href="/admin/clients" className="text-accent hover:underline">
                    Clientes
                  </Link>
                  .
                </p>
              </div>
            <div>
              <Label htmlFor="userCompany">Empresa (texto en perfil)</Label>
              <Input id="userCompany" name="companyName" defaultValue={user.companyName || ""} />
            </div>
            <div>
              <Label htmlFor="userPhone">Teléfono</Label>
              <Input id="userPhone" name="phone" defaultValue={user.phone || ""} />
            </div>
            <div>
              <Label htmlFor="quoteSignName">Firma en cotizaciones (nombre)</Label>
              <Input id="quoteSignName" name="quoteSignName" defaultValue={user.quoteSignName || ""} placeholder={user.name} />
            </div>
            <div>
              <Label htmlFor="quoteSignTitle">Firma en cotizaciones (cargo)</Label>
              <Input id="quoteSignTitle" name="quoteSignTitle" defaultValue={user.quoteSignTitle || ""} placeholder="Gerente comercial" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="userPassword">Nueva contraseña</Label>
              <Input id="userPassword" name="password" type="password" placeholder="Dejar vacío para no cambiar" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={user.isActive} />
              Usuario activo
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit">Guardar usuario</Button>
            </div>
          </form>
          {user.lastLoginAt ? (
            <p className="text-xs text-muted-foreground">Último ingreso: {formatDate(user.lastLoginAt)}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
