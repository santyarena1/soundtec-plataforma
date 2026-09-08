import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserFormModal } from "@/components/admin/user-form-modal";
import { UserActions } from "@/components/admin/user-actions";
import { formatDate } from "@/lib/utils";
export const metadata = { title: "Admin · Usuario" };
const label: Record<string, string> = {
  CLIENT: "Cliente del portal",
  ADMIN: "Administrador",
  SUPER_ADMIN: "Super admin",
};
export default async function Page({ params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  const [user, clients, roles] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.id },
      include: {
        client: { select: { id: true, companyName: true } },
        customRole: { select: { name: true } },
        _count: { select: { requests: true, ownedQuotes: true } },
      },
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
  if (!user) notFound();
  const canDelete =
    user._count.requests === 0 && user._count.ownedQuotes === 0 && user.id !== admin.id;
  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="text-sm text-muted-foreground">
        ← Volver a usuarios
      </Link>
      <PageHeader
        title={user.name}
        description={user.email}
        actions={
          <UserFormModal
            user={user}
            clients={clients.map((x) => ({ id: x.id, name: x.companyName }))}
            roles={roles}
            isSuper={admin.role === "SUPER_ADMIN"}
            triggerLabel="Editar usuario"
          />
        }
      />
      <div className="flex gap-2">
        <Badge tone={user.role === "CLIENT" ? "muted" : "primary"}>{label[user.role]}</Badge>
        <Badge tone={user.isActive ? "success" : "muted"}>
          {user.isActive ? "Activo" : "Inactivo"}
        </Badge>
        {user.customRole ? <Badge tone="accent">{user.customRole.name}</Badge> : null}
      </div>
      {user.role === "CLIENT" ? (
        <Card>
          <CardContent className="p-5">
            {user.client ? (
              <>
                <p className="font-medium">Cliente vinculado</p>
                <Link
                  className="text-primary hover:underline"
                  href={`/admin/clients/${user.client.id}`}
                >
                  {user.client.companyName}
                </Link>
              </>
            ) : (
              <p className="text-warning">
                Este usuario no tiene un cliente vinculado. Editalo para asignarlo.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Teléfono</p>
            <p>{user.phone || "No informado"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Último acceso</p>
            <p>{user.lastLoginAt ? formatDate(user.lastLoginAt) : "Nunca ingresó"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Firma en cotizaciones</p>
            <p>{user.quoteSignName || user.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cargo en la firma</p>
            <p>{user.quoteSignTitle || "No informado"}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="font-semibold">Acciones de acceso</h2>
          <UserActions id={user.id} isActive={user.isActive} canDelete={canDelete} />
          {!canDelete && user.id !== admin.id ? (
            <p className="text-sm text-muted-foreground">
              No se puede eliminar porque tiene pedidos o cotizaciones. Podés desactivarlo para
              conservar el historial.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
