import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import {
  Package, Users, FileSpreadsheet, Send, Sparkles, LifeBuoy,
} from "lucide-react";

export const metadata = { title: "Admin · Dashboard" };

export default async function AdminDashboardPage() {
  const user = await requireAdmin();

  const [
    totalProducts,
    totalUsers,
    activeRequests,
    pendingFeedback,
    pendingImports,
    openTickets,
    recentRequests,
    recentImports,
  ] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: "CLIENT", isActive: true } }),
    prisma.customerRequest.count({ where: { status: { in: ["SENT", "IN_REVIEW"] } } }),
    prisma.aiContentFeedback.count({ where: { verdict: "HAS_ERRORS" } }),
    prisma.importBatch.count({ where: { status: { in: ["PENDING", "MAPPING", "REVIEWING"] } } }),
    prisma.developerTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.customerRequest.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: { user: { select: { name: true, companyName: true } }, _count: { select: { items: true } } },
    }),
    prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const tones = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  } as const;

  const stats = [
    { label: "Productos activos", value: totalProducts, icon: Package, tone: "primary" as const, href: "/admin/products" },
    { label: "Clientes activos", value: totalUsers, icon: Users, tone: "accent" as const, href: "/admin/users" },
    { label: "Solicitudes a responder", value: activeRequests, icon: Send, tone: "warning" as const, href: "/admin/requests" },
    { label: "Importaciones pendientes", value: pendingImports, icon: FileSpreadsheet, tone: "primary" as const, href: "/admin/imports" },
    { label: "Feedback IA con errores", value: pendingFeedback, icon: Sparkles, tone: "destructive" as const, href: "/admin/ai" },
    { label: "Tickets abiertos", value: openTickets, icon: LifeBuoy, tone: "muted" as const, href: "/admin/tickets" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`Hola, ${(user.name || "Admin").split(" ")[0]}`} description="Vista general del sistema." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="h-full transition-shadow hover:shadow-elevated">
              <CardContent className="flex items-center gap-3 p-5">
                <span className={`flex h-10 w-10 items-center justify-center rounded-md ${tones[s.tone]}`}>
                  <s.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="muted-text">{s.label}</p>
                  <p className="text-2xl font-semibold">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <CardTitle>Últimas solicitudes</CardTitle>
              <Link href="/admin/requests" className="text-sm text-accent hover:underline">
                Ver todas
              </Link>
            </div>
            <ul className="mt-3 divide-y divide-border">
              {recentRequests.length === 0 ? (
                <p className="muted-text py-6 text-center">Sin solicitudes recientes.</p>
              ) : (
                recentRequests.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/admin/requests/${r.id}`}
                      className="flex items-center justify-between py-3 hover:bg-secondary/40"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {r.user.companyName || r.user.name} · #{r.id.slice(-6).toUpperCase()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r._count.items} ítems · {formatDate(r.updatedAt)}
                        </p>
                      </div>
                      <Badge tone="muted">{r.status}</Badge>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <CardTitle>Últimas importaciones</CardTitle>
              <Link href="/admin/imports" className="text-sm text-accent hover:underline">
                Ver todas
              </Link>
            </div>
            <ul className="mt-3 divide-y divide-border">
              {recentImports.length === 0 ? (
                <p className="muted-text py-6 text-center">Sin importaciones aún.</p>
              ) : (
                recentImports.map((i) => (
                  <li key={i.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{i.fileName}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(i.createdAt)}</p>
                    </div>
                    <Badge tone="muted">{i.status}</Badge>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
