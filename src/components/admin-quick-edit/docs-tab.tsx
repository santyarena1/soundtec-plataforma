"use client";

import { useState, useTransition } from "react";
import { ExternalLink, FileText, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AccessoriesPanel } from "@/app/admin/products/[id]/accessories-panel";
import { useUnsavedValue } from "@/hooks/use-unsaved-changes-guard";
import { saveQuickEditDocuments } from "@/server/actions/quick-edit";
import type { DocRow } from "@/lib/quick-edit/content";
import { RowTools, SaveBar, SectionHead, moveInList, useFeedback } from "./parts";
import { errorText, useReportDirty, type TabProps } from "./texts-tab";

export function DocsTab({ data, onSaved, onDirty }: TabProps) {
  const p = data.product;
  const [docs, setDocs] = useState<DocRow[]>(p.documents);
  const guard = useUnsavedValue(docs);
  useReportDirty(onDirty, guard.isDirty);
  const [feedback, setFeedback] = useFeedback();
  const [pending, start] = useTransition();
  const update = (i: number, patch: Partial<DocRow>) => setDocs((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function save() {
    setFeedback(null);
    start(async () => {
      try {
        const result = await saveQuickEditDocuments({ productId: p.id, documents: docs });
        if (!result.ok) return setFeedback({ tone: "error", text: result.error });
        guard.markSaved();
        setFeedback({ tone: "ok", text: "Documentos guardados." });
        onSaved();
      } catch (error) {
        setFeedback({ tone: "error", text: errorText(error) });
      }
    });
  }

  return (
    <div className="space-y-8">
      <section>
        <SectionHead title="Documentación" hint="Manuales, fichas técnicas y planos que el cliente descarga desde la ficha. Pegá la dirección del archivo (PDF, imagen…)." />
        {docs.length ? (
          <ul className="space-y-2">
            {docs.map((d, i) => (
              <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-2">
                <FileText className="h-4 w-4 shrink-0 text-accent" />
                <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
                  <Input value={d.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Nombre (ej. Manual de instalación)" className="h-8 text-xs font-medium" aria-label={`Nombre del documento ${i + 1}`} />
                  <Input value={d.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="https://…" className="h-8 font-mono text-[11px]" aria-label={`Dirección del documento ${i + 1}`} />
                </div>
                {/^https?:\/\//i.test(d.url) ? (
                  <a href={d.url} target="_blank" rel="noreferrer noopener" className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground" title="Abrir" aria-label={`Abrir ${d.name || "documento"}`}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                <RowTools index={i} count={docs.length} label={`documento ${i + 1}`} onMove={(a, b) => setDocs((l) => moveInList(l, a, b))} onRemove={() => setDocs((l) => l.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Sin documentos cargados.</p>
        )}
        <Button variant="outline" size="sm" className="mt-2" onClick={() => setDocs((l) => [...l, { name: "", url: "" }])}>
          <Plus className="h-3.5 w-3.5" /> Agregar documento
        </Button>
        <SaveBar dirty={guard.isDirty} pending={pending} feedback={feedback} onSave={save} onDiscard={() => setDocs(p.documents)} label="Guardar documentos" />
      </section>

      <section>
        <SectionHead title="Accesorios e incluidos" hint="Se guardan al momento, con el mismo panel del admin." />
        <AccessoriesPanel productId={p.id} relations={data.relations} />
      </section>
    </div>
  );
}
