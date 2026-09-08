"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClientActivity } from "@/server/actions/clients";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea, FieldError } from "@/components/ui/input";
export function ActivityForm({
  clientId,
  compact = false,
}: {
  clientId: string;
  compact?: boolean;
}) {
  const [type, setType] = useState("NOTE"),
    [error, setError] = useState<string>(),
    [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null),
    router = useRouter();
  return (
    <form
      ref={ref}
      className="rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createClientActivity(new FormData(e.currentTarget));
          if (!r.ok) {
            setError(r.error);
            return;
          }
          ref.current?.reset();
          setType("NOTE");
          setError(undefined);
          router.refresh();
        });
      }}
    >
      <input type="hidden" name="clientId" value={clientId} />
      <div className={`grid gap-3 ${compact ? "" : "md:grid-cols-4"}`}>
        <div>
          <Label>Tipo</Label>
          <Select name="kind" value={type} onChange={(e) => setType(e.target.value)}>
            {[
              ["NOTE", "Nota"],
              ["CALL", "Llamada"],
              ["MEETING", "Reunión"],
              ["EMAIL", "Email"],
              ["WHATSAPP", "WhatsApp"],
              ["TASK", "Tarea"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label required>Título</Label>
          <Input name="title" required placeholder="¿Qué pasó o qué hay que hacer?" />
        </div>
        {type === "TASK" ? (
          <div>
            <Label>Vencimiento</Label>
            <Input name="dueAt" type="datetime-local" />
          </div>
        ) : null}
        <div className="md:col-span-3">
          <Label>Detalle</Label>
          <Textarea name="body" rows={2} />
        </div>
        <div className="flex items-end">
          <Button className="w-full" type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Agregar actividad"}
          </Button>
        </div>
      </div>
      <FieldError message={error} />
    </form>
  );
}
