"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers3, Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/dialog";
import { QUOTE_MODULE_LAYOUTS } from "@/lib/quote-module-layout";
import {
  createCustomQuoteModule,
  insertLibraryModule,
  listQuoteModuleLibrary,
  removeCustomQuoteModule,
  type LibraryModuleRow,
} from "@/server/actions/quote-modules";

export function RemoveCustomModule({ sectionId, issued }: { sectionId: string; issued?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (issued) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 text-[11px] text-muted-foreground"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await removeCustomQuoteModule({ sectionId });
          if (!result.ok) {
            toast.error(result.error || "No se pudo quitar.");
            return;
          }
          toast.success("Módulo extra quitado de esta cotización.");
          router.refresh();
        })
      }
    >
      Quitar de esta COT
    </Button>
  );
}

export function AddCustomModule({ quoteId, issued }: { quoteId: string; issued?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [prompt, setPrompt] = useState("");
  const [layout, setLayout] = useState("text_only");
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [drafts, setDrafts] = useState<LibraryModuleRow[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    start(async () => {
      setDrafts(await listQuoteModuleLibrary());
    });
  }, [open]);

  if (issued) return null;

  function reset() {
    setTitle("");
    setBody("");
    setPrompt("");
    setLayout("text_only");
    setSaveToLibrary(true);
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        Agregar módulo
      </Button>
      <Modal
        open={open}
        onClose={pending ? () => undefined : () => setOpen(false)}
        size="lg"
        icon={<Layers3 className="h-4 w-4" />}
        title="Módulo extra"
        description="No entra solo en las cotizaciones nuevas. Si lo guardás como borrador, lo podés insertar después."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={pending || !title.trim() || (!body.trim() && !prompt.trim())}
              onClick={() =>
                start(async () => {
                  const result = await createCustomQuoteModule({
                    quoteId,
                    title,
                    body,
                    prompt,
                    layout,
                    saveToLibrary,
                  });
                  if (!result.ok) {
                    toast.error(result.error || "No se pudo crear el módulo.");
                    return;
                  }
                  toast.success("Módulo agregado", {
                    description: saveToLibrary
                      ? "Quedó en esta COT y como borrador para las próximas."
                      : "Sólo esta cotización.",
                  });
                  reset();
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Agregar a esta COT
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {drafts.length > 0 ? (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Borradores guardados</p>
              <ul className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border">
                {drafts.map((draft) => (
                  <li key={draft.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{draft.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {draft.imageCount ? `${draft.imageCount} foto${draft.imageCount === 1 ? "" : "s"} · ` : ""}
                        no entra por defecto
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const result = await insertLibraryModule({ quoteId, libraryId: draft.id });
                          if (!result.ok) {
                            toast.error(result.error || "No se pudo insertar.");
                            return;
                          }
                          toast.success(`Insertamos «${draft.title}»`);
                          setOpen(false);
                          router.refresh();
                        })
                      }
                    >
                      Insertar
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div>
            <Label htmlFor="custom-module-title">Título</Label>
            <Input
              id="custom-module-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Alcance de obra, Capacitación, Sala híbrida"
            />
          </div>
          <div>
            <Label htmlFor="custom-module-body">Cuerpo (a mano)</Label>
            <Textarea
              id="custom-module-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escribí el texto, o dejalo vacío y usá el prompt de abajo."
            />
          </div>
          <div>
            <Label htmlFor="custom-module-prompt">
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                O pedíselo a la IA
              </span>
            </Label>
            <Textarea
              id="custom-module-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ej. Explicá la capacitación al personal de mantenimiento, en dos párrafos, sin inventar equipos."
            />
          </div>
          <div>
            <Label htmlFor="custom-module-layout">Cómo se ven las fotos</Label>
            <select
              id="custom-module-layout"
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {QUOTE_MODULE_LAYOUTS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3">
            <input
              type="checkbox"
              checked={saveToLibrary}
              onChange={(e) => setSaveToLibrary(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
            />
            <span className="text-sm">
              Guardar como borrador para otras cotizaciones
              <span className="mt-0.5 block text-xs text-muted-foreground">
                No se agrega solo. En la próxima COT lo insertás si hace falta.
              </span>
            </span>
          </label>
        </div>
      </Modal>
    </>
  );
}
