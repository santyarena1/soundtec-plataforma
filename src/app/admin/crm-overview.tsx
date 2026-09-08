import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

const STALE_DAYS = 90;
const TAKE = 6;

const KIND_LABEL: Record<string, string> = {
  NOTE: "Nota",
  CALL: "Llamada",
  MEETING: "Reunión",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  SYSTEM: "Sistema",
  TASK: "Tarea",
};

/**
 * Resumen del CRM para el dashboard: lo que hay que hacer y lo último que
 * pasó con los clientes, sin tener que entrar al módulo.
 */
export async function CrmOverview() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_DAYS * 86_400_000);
  const [activeClients, staleClients, tasks, activity] = await Promise.all([
    prisma.client.count({ where: { isActive: true } }),
    prisma.client.count({
      where: { isActive: true, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: staleBefore } }] },
    }),
    prisma.clientActivity.findMany({
      where: { kind: "TASK", doneAt: null },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: TAKE,
      include: { client: { select: { id: true, companyName: true } } },
    }),
    prisma.clientActivity.findMany({
      where: { kind: { not: "TASK" } },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      include: {
        client: { select: { id: true, companyName: true } },
        createdBy: { select: { name: true } },
      },
    }),
  ]);

  return (
    <Card className="border-primary/15" data-tour="dash-crm">
      <CardContent className="p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>CRM · Clientes</CardTitle>
            <p className="muted-text mt-1">
              {activeClients} clientes activos · {staleClients} sin actividad en {STALE_DAYS} días ·{" "}
              {tasks.length} tarea{tasks.length === 1 ? "" : "s"} pendiente{tasks.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/clients"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Ver clientes
            </Link>
            <Link
              href="/admin/clients?inactive=90"
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary"
            >
              Sin actividad
            </Link>
            <Link
              href="/admin/users"
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary"
            >
              Usuarios
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold">Tareas pendientes</p>
            <ul className="mt-2 divide-y divide-border">
              {tasks.length === 0 ? (
                <li className="muted-text py-4">
                  No hay tareas pendientes. Se cargan desde la ficha de cada cliente, pestaña Actividad.
                </li>
              ) : (
                tasks.map((task) => (
                  <li key={task.id} className="py-2.5">
                    <Link
                      href={`/admin/clients/${task.clientId}?tab=activity`}
                      className="flex items-center justify-between gap-3 hover:text-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <p className="text-xs text-muted-foreground">{task.client.companyName}</p>
                      </div>
                      <Badge tone={task.dueAt && task.dueAt < now ? "destructive" : "warning"}>
                        {task.dueAt ? formatDate(task.dueAt) : "Sin fecha"}
                      </Badge>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Última actividad</p>
            <ul className="mt-2 divide-y divide-border">
              {activity.length === 0 ? (
                <li className="muted-text py-4">Todavía no hay actividad registrada.</li>
              ) : (
                activity.map((item) => (
                  <li key={item.id} className="py-2.5">
                    <Link
                      href={`/admin/clients/${item.clientId}?tab=activity`}
                      className="flex items-center justify-between gap-3 hover:text-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.client.companyName}
                          {item.createdBy?.name ? ` · ${item.createdBy.name}` : ""} · {formatDate(item.createdAt)}
                        </p>
                      </div>
                      <Badge tone="muted">{KIND_LABEL[item.kind] ?? item.kind}</Badge>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
