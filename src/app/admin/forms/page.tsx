import Link from "next/link";
import { ClipboardList, MessageSquareText } from "lucide-react";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { CreateFormButton, FormRowActions } from "./forms-list-actions";

export const metadata = { title: "Admin · Formularios" };

const STATUS: Record<string, { label: string; tone: "success" | "muted" | "warning" }> = {
  OPEN: { label: "Abierto", tone: "success" },
  DRAFT: { label: "Borrador", tone: "warning" },
  CLOSED: { label: "Cerrado", tone: "muted" },
};

export default async function FormsPage() {
  await requireStaff("forms.manage");
  const forms = await prisma.form.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      token: true,
      status: true,
      closesAt: true,
      updatedAt: true,
      _count: { select: { responses: true, blocks: true } },
      responses: { orderBy: { submittedAt: "desc" }, take: 1, select: { submittedAt: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Formularios"
        description="Formularios para eventos, inscripciones y encuestas. Se comparten con un enlace único: quien no lo tiene no puede entrar."
        actions={<CreateFormButton />}
      />

      {forms.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-5 w-5" />}
          title="Todavía no hay formularios"
          description="Creá uno, armá las preguntas y compartí el enlace. Las respuestas llegan acá ordenadas."
          action={<CreateFormButton />}
        />
      ) : (
        <ul className="grid gap-3">
          {forms.map((form) => {
            const expired = form.closesAt != null && form.closesAt.getTime() < Date.now();
            const status = expired && form.status === "OPEN" ? { label: "Vencido", tone: "muted" as const } : STATUS[form.status];
            return (
              <li key={form.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/forms/${form.id}`} className="truncate text-base font-semibold hover:underline">
                      {form.title}
                    </Link>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {form._count.blocks} bloque{form._count.blocks === 1 ? "" : "s"} · editado {formatDate(form.updatedAt)}
                    {form.closesAt ? ` · cierra ${formatDate(form.closesAt)}` : ""}
                    {form.responses[0] ? ` · última respuesta ${formatDate(form.responses[0].submittedAt)}` : ""}
                  </p>
                </div>
                <Link
                  href={`/admin/forms/${form.id}/respuestas`}
                  className="inline-flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-sm font-semibold tabular-nums hover:bg-secondary"
                >
                  <MessageSquareText className="h-4 w-4 text-primary" />
                  {form._count.responses} respuesta{form._count.responses === 1 ? "" : "s"}
                </Link>
                <FormRowActions formId={form.id} token={form.token} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
