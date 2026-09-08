"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { completeClientActivity, deleteClientActivity } from "@/server/actions/clients";
type Item = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  dueAt: Date | string | null;
  doneAt: Date | string | null;
  createdAt: Date | string;
  referenceType: string | null;
  referenceId: string | null;
  createdBy: { name: string } | null;
};
const labels: Record<string, string> = {
  NOTE: "Nota",
  CALL: "Llamada",
  MEETING: "Reunión",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  TASK: "Tarea",
  SYSTEM: "Sistema",
};
export function ActivityTimeline({ clientId, items }: { clientId: string; items: Item[] }) {
  const [pending, start] = useTransition(),
    router = useRouter();
  function act(fn: (f: FormData) => Promise<unknown>, id: string) {
    const f = new FormData();
    f.set("id", id);
    f.set("clientId", clientId);
    start(async () => {
      await fn(f);
      router.refresh();
    });
  }
  if (!items.length)
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Todavía no hay actividad registrada.
      </p>
    );
  return (
    <ol className="space-y-3">
      {items.map((x) => {
        const overdue = x.kind === "TASK" && !x.doneAt && x.dueAt && new Date(x.dueAt) < new Date();
        return (
          <li
            key={x.id}
            className={`rounded-lg border p-4 ${overdue ? "border-warning/50 bg-warning/5" : "bg-card"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={x.kind === "SYSTEM" ? "muted" : x.kind === "TASK" ? "warning" : "primary"}
                  >
                    {labels[x.kind] || x.kind}
                  </Badge>
                  <p className={x.doneAt ? "line-through text-muted-foreground" : "font-medium"}>
                    {x.title}
                  </p>
                </div>
                {x.body ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{x.body}</p>
                ) : null}
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(x.createdAt).toLocaleString("es-AR")}
                  {x.createdBy ? ` · ${x.createdBy.name}` : ""}
                  {x.dueAt ? ` · vence ${new Date(x.dueAt).toLocaleString("es-AR")}` : ""}
                </p>
              </div>
              {x.kind !== "SYSTEM" ? (
                <div className="flex">
                  {x.kind === "TASK" ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={pending}
                      title="Completar"
                      onClick={() => act(completeClientActivity, x.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={pending}
                    title="Eliminar"
                    onClick={() => act(deleteClientActivity, x.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
