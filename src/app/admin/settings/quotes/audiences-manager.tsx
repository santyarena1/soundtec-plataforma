"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { archiveQuoteAudience, createQuoteAudience, updateQuoteAudience } from "@/server/actions/quote-audiences";

type Audience = { key: string; label: string; focus: string | null };
type Draft = { label: string; focus: string };

/** Crear, renombrar y quitar las opciones de «A quién va». */
export function AudiencesManager({ audiences }: { audiences: Audience[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(audiences.length === 0 ? "nuevo" : null);
  const [draft, setDraft] = useState<Draft>({ label: "", focus: "" });

  function open(a?: Audience) {
    setEditing(a?.key ?? "nuevo");
    setDraft({ label: a?.label ?? "", focus: a?.focus ?? "" });
  }

  function save() {
    start(async () => {
      const input = { label: draft.label, focus: draft.focus.trim() || null };
      const r = editing === "nuevo" ? await createQuoteAudience(input) : await updateQuoteAudience(editing!, input);
      if (!r.ok) return void toast.error(r.error || "No se pudo guardar.");
      toast.success(editing === "nuevo" ? "Agregado: ya se puede elegir en las cotizaciones." : "Guardado.");
      setEditing(null);
      router.refresh();
    });
  }

  async function remove(a: Audience) {
    const ok = await confirmDialog({
      title: "Quitar",
      message: `¿Quitar «${a.label}»? Deja de aparecer para elegir. Las cotizaciones y los textos que ya lo usan no cambian.`,
      confirmLabel: "Quitar",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const r = await archiveQuoteAudience(a.key);
      if (!r.ok) return void toast.error(r.error || "No se pudo quitar.");
      toast.success("Quitado.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {audiences.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {audiences.map((a) => (
            <li key={a.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="font-medium">{a.label}</p>
                {a.focus ? <p className="text-xs text-muted-foreground">{a.focus}</p> : null}
              </div>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => open(a)}>Editar</Button>
                <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => void remove(a)}>Quitar</Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay ninguno.</p>
      )}

      {editing ? (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div>
            <Label htmlFor="aud-label">Nombre</Label>
            <Input id="aud-label" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Ej. Hotelería y gastronomía" />
          </div>
          <div>
            <Label htmlFor="aud-focus">Cómo es este cliente (opcional)</Label>
            <Textarea
              id="aud-focus"
              rows={2}
              value={draft.focus}
              onChange={(e) => setDraft({ ...draft, focus: e.target.value })}
              placeholder="Ej. hoteles y restaurantes: música funcional por zonas, equipos que no se vean, lo opera el personal del lugar"
            />
            <p className="mt-1 text-xs text-muted-foreground">La IA lo usa para escribir la versión de cada texto para este público.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={save} disabled={pending || draft.label.trim().length < 2}>
              {editing === "nuevo" ? "Agregar" : "Guardar"}
            </Button>
            {audiences.length ? (
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>Cancelar</Button>
            ) : null}
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => open()}>
          <Plus className="h-4 w-4" /> Agregar
        </Button>
      )}
    </div>
  );
}
