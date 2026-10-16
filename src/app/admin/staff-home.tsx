import Link from "next/link";
import { Box, Building2, FileSpreadsheet, ListChecks, Package, UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { permissionsHave, type Permissions } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CatalogModeButton } from "@/components/catalog-mode/catalog-mode-controls";

/**
 * Inicio del panel para el equipo interno (vendedores, etc.): atajos a lo que
 * su rol permite y sus propios números. Sin costos ni datos de toda la empresa.
 */
export async function StaffHome({ user, permissions }: { user: CurrentUser; permissions: Permissions }) {
  const can = (s: Parameters<typeof permissionsHave>[1]) => permissionsHave(permissions, s);
  const [quotesOpen, quotesIssued, myClients, requestsToAnswer, myAltas] = await Promise.all([
    can("quotes.view_own") ? prisma.quote.count({ where: { ownerId: user.id, status: { in: ["DRAFT", "IN_REVIEW", "READY"] } } }) : 0,
    can("quotes.view_own") ? prisma.quote.count({ where: { ownerId: user.id, status: "ISSUED" } }) : 0,
    can("clients.view") || can("clients.view_all") ? prisma.client.count({ where: { ownerId: user.id, isActive: true } }) : 0,
    can("requests.view") ? prisma.customerRequest.count({ where: { status: { in: ["SENT", "IN_REVIEW"] } } }) : 0,
    can("account_requests.create") ? prisma.accountRequest.count({ where: { requestedById: user.id, status: "PENDING" } }) : 0,
  ]);

  const shortcuts = [
    can("quotes.create") && { href: "/admin/quotes/quick", label: "Cotización rápida", help: "Armá y mandá una cotización en minutos.", icon: FileSpreadsheet },
    { href: "/portal/products", label: "Catálogo de venta", help: "Productos con precio de venta.", icon: Package },
    can("clients.create") && { href: "/admin/clients?nuevo=1", label: "Nuevo cliente", help: "Empresa, contactos y datos.", icon: Building2 },
    can("account_requests.create") && { href: "/admin/account-requests?nueva=1", label: "Pedir alta de empresa", help: "Un admin la aprueba y le da acceso al portal.", icon: UserPlus },
    can("room_builder.use") && { href: "/admin/room-builder", label: "Room Builder", help: "Diseñar salas y proyectos.", icon: Box },
    can("requests.view") && { href: "/admin/requests", label: "Pedidos de clientes", help: "Responder pedidos del portal.", icon: ListChecks },
  ].filter(Boolean) as Array<{ href: string; label: string; help: string; icon: typeof Package }>;

  const stats = [
    can("quotes.view_own") && { label: "Cotizaciones abiertas", value: quotesOpen, href: "/admin/quotes" },
    can("quotes.view_own") && { label: "Cotizaciones emitidas", value: quotesIssued, href: "/admin/quotes" },
    (can("clients.view") || can("clients.view_all")) && { label: "Mis clientes", value: myClients, href: "/admin/clients" },
    can("requests.view") && { label: "Pedidos a responder", value: requestsToAnswer, href: "/admin/requests" },
    can("account_requests.create") && { label: "Altas esperando aprobación", value: myAltas, href: "/admin/account-requests" },
  ].filter(Boolean) as Array<{ label: string; value: number; href: string }>;

  return (
    <div className="space-y-6">
      <PageHeader title={`Hola, ${(user.name || "").split(" ")[0] || "equipo"}`} description="Tus atajos y tus números." />

      {can("catalog_mode.use") ? (
        <Card className="border-[#1e3553]/20">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">¿Estás con un cliente?</p>
              <p className="text-sm text-muted-foreground">
                Abrí el catálogo sin ningún precio para mostrarle productos. Para salir te pide tu clave.
              </p>
            </div>
            <div className="sm:w-64">
              <CatalogModeButton />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {stats.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((s) => (
            <Link key={s.label} href={s.href}>
              <Card className="h-full transition-shadow hover:shadow-elevated">
                <CardContent className="p-4">
                  <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-elevated">
              <CardContent className="flex items-start gap-3 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-medium">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.help}</span>
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
