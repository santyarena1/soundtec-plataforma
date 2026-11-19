import Link from "next/link";
import { Database, FileSpreadsheet, LifeBuoy, Package, RefreshCw, Send, Sparkles, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { buildViewer } from "@/server/dashboard/viewer";
import { StaffHome, ShortcutGrid, staffShortcuts, type Shortcut } from "./staff-home";
import { DashboardBlocks } from "./_dashboard/dashboard-blocks";

export const metadata = { title: "Admin · Dashboard" };

export default async function AdminDashboardPage({ searchParams }: { searchParams?: { sinPermiso?: string } }) {
  const { user, isAdmin, permissions } = await requireStaff();
  const viewer = buildViewer(user, permissions, isAdmin);
  const denied = searchParams?.sinPermiso ? (
    <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
      No tenés permiso para entrar a esa pantalla. Si lo necesitás, pedíselo a un administrador.
    </p>
  ) : null;

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      {denied}
      {/* Accesos directos: los mismos de siempre. El equipo ve los de su rol; el admin, además, los del sistema. */}
      {isAdmin ? <AdminShortcuts firstName={viewer.firstName} shortcuts={staffShortcuts(permissions)} /> : <StaffHome user={user} permissions={permissions} />}
      <DashboardBlocks viewer={viewer} />
    </div>
  );
}

const TONES = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
} as const;

/** Inicio del admin: los atajos y los números del sistema que ya tenía, más los atajos del equipo. */
async function AdminShortcuts({ firstName, shortcuts }: { firstName: string; shortcuts: Shortcut[] }) {
  const [totalProducts, catalogProducts, totalUsers, activeRequests, pendingFeedback, pendingImports, openTickets] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    // Lo que ven los visitantes (catálogo, pantalla del stand, login): solo marcas activas y visibles.
    prisma.product.count({ where: { isActive: true, brand: { is: { isActive: true, hiddenFromCatalog: false } } } }),
    prisma.user.count({ where: { role: "CLIENT", isActive: true } }),
    prisma.customerRequest.count({ where: { status: { in: ["SENT", "IN_REVIEW"] } } }),
    prisma.aiContentFeedback.count({ where: { verdict: "HAS_ERRORS" } }),
    prisma.importBatch.count({ where: { status: { in: ["PENDING", "MAPPING", "REVIEWING"] } } }),
    prisma.developerTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
  ]);

  const stats = [
    { label: "Productos activos", value: totalProducts, hint: `${catalogProducts.toLocaleString("es-AR")} visibles en el catálogo`, icon: Package, tone: "primary" as const, href: "/admin/products" },
    { label: "Usuarios del portal", value: totalUsers, icon: Users, tone: "accent" as const, href: "/admin/users" },
    { label: "Pedidos a responder", value: activeRequests, icon: Send, tone: "warning" as const, href: "/admin/requests" },
    { label: "Importaciones pendientes", value: pendingImports, icon: FileSpreadsheet, tone: "primary" as const, href: "/admin/imports" },
    { label: "Feedback IA con errores", value: pendingFeedback, icon: Sparkles, tone: "destructive" as const, href: "/admin/feedback" },
    { label: "Tickets abiertos", value: openTickets, icon: LifeBuoy, tone: "muted" as const, href: "/admin/tickets" },
  ];

  // Equivalentes de sistema para el admin (además de los del equipo).
  const adminShortcuts: Shortcut[] = [
    ...shortcuts,
    { href: "/admin/sync", label: "Sincronizaciones", help: "Crestron, Sonance y SoundTube: estado y corridas.", icon: RefreshCw },
    { href: "/admin/imports", label: "Importar lista de precios", help: "Excel de proveedores: mapear y revisar.", icon: Database },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Hola, ${firstName === "equipo" ? "Admin" : firstName}`}
        description="Lo pendiente primero; después clientes, ventas, catálogo y marketing."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/assistant"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-4 text-sm font-medium text-accent hover:bg-accent/15"
            >
              <Sparkles className="h-4 w-4" />
              Asistente de productos
            </Link>
            <Link href="/admin/quotes/quick" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
              Cotización rápida
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6" data-tour="dash-stats">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-card transition-shadow hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${TONES[s.tone]}`}>
              <s.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-semibold leading-tight tabular-nums">{s.value.toLocaleString("es-AR")}</span>
              <span className="block truncate text-xs text-muted-foreground" title={s.hint}>
                {s.label}
              </span>
            </span>
          </Link>
        ))}
      </div>

      <ShortcutGrid shortcuts={adminShortcuts} className="lg:grid-cols-4" />
    </div>
  );
}
