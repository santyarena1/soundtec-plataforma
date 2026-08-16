import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createTicket, updateTicket } from "@/server/actions/tickets";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Admin · Tickets" };

const priorityTone = {
  LOW: "muted",
  MEDIUM: "neutral",
  HIGH: "warning",
  URGENT: "destructive",
} as const;

const statusTone = {
  OPEN: "primary",
  IN_PROGRESS: "warning",
  RESOLVED: "success",
  CLOSED: "muted",
} as const;

export default async function AdminTicketsPage() {
  const admin = await requireAdmin();
  const tickets = await prisma.developerTicket.findMany({
    orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    include: { createdBy: { select: { name: true, email: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets al desarrollador"
        description="Reportes de fallas, mejoras o consultas técnicas. Los que salen de Ayuda → Reportar al dev llegan acá con el prefijo [Ayuda] y la URL de la pantalla."
      />

      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3 mb-3">Crear ticket</h2>
          <form action={createTicket} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="title" required>Título</Label>
              <Input id="title" name="title" required placeholder="Ej. Error al filtrar productos por marca" />
            </div>
            <div>
              <Label htmlFor="priority">Prioridad</Label>
              <Select id="priority" name="priority" defaultValue="MEDIUM">
                <option value="LOW">Baja</option>
                <option value="MEDIUM">Media</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="description" required>Descripción</Label>
              <Textarea id="description" name="description" rows={5} required placeholder="Pasos para reproducir, comportamiento esperado, capturas..." />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit">Crear ticket</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {tickets.length === 0 ? (
          <p className="muted-text">Sin tickets abiertos.</p>
        ) : (
          tickets.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.createdBy.name} · {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge tone={priorityTone[t.priority]}>{t.priority}</Badge>
                    <Badge tone={statusTone[t.status]}>{t.status}</Badge>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">{t.description}</p>
                <form action={updateTicket} className="grid gap-2 sm:grid-cols-[160px_1fr_auto] sm:items-end">
                  <input type="hidden" name="id" value={t.id} />
                  <div>
                    <Label htmlFor={`status-${t.id}`}>Estado</Label>
                    <Select id={`status-${t.id}`} name="status" defaultValue={t.status}>
                      <option value="OPEN">Abierto</option>
                      <option value="IN_PROGRESS">En progreso</option>
                      <option value="RESOLVED">Resuelto</option>
                      <option value="CLOSED">Cerrado</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor={`res-${t.id}`}>Nota / resolución</Label>
                    <Input id={`res-${t.id}`} name="resolution" defaultValue={t.resolution || ""} />
                  </div>
                  <Button type="submit" size="sm">Guardar</Button>
                </form>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
