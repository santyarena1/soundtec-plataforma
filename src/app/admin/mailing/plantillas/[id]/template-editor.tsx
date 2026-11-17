"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { EmailPreview } from "@/components/mailing/email-preview";
import { TemplateWarnings } from "@/components/mailing/html-tools";
import type { TemplateWarning } from "@/lib/mailing/html-template";
import type { CampaignFooter } from "@/lib/mailing/template";
import { saveTemplate } from "@/server/actions/mailing-templates";
import { TemplateRowActions } from "../templates-client";

const SAMPLE = { email: "martin@ejemplo.com", name: "Martín Pereyra", company: "Estudio Acústico Sur" };

/** Código de la plantilla con vista previa en vivo (el saneo final lo hace el servidor al guardar). */
export function TemplateEditor({ template, footer }: { template: { id: string; name: string; description: string; html: string; warnings: TemplateWarning[] }; footer: CampaignFooter }) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [html, setHtml] = useState(template.html);
  const [preview, setPreview] = useState(template.html);
  const [warnings, setWarnings] = useState(template.warnings);
  const [saved, setSaved] = useState({ name: template.name, description: template.description, html: template.html });
  const [busy, start] = useTransition();
  const dirty = name !== saved.name || description !== saved.description || html !== saved.html;

  // La vista previa sigue al código con un respiro (no se redibuja en cada tecla).
  useEffect(() => {
    const timer = setTimeout(() => setPreview(html), 400);
    return () => clearTimeout(timer);
  }, [html]);

  function save() {
    start(async () => {
      const result = await saveTemplate({ id: template.id, name, description, html });
      if (!result.ok) return void toast.error(result.error);
      setHtml(result.html);
      setWarnings(result.warnings);
      setSaved({ name, description, html: result.html });
      toast.success(result.html !== html ? "Guardada. Se limpió el código y se subieron las imágenes incrustadas." : "Plantilla guardada.");
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="text-base font-semibold" />
          </div>
          <div className="space-y-1">
            <Label>Descripción</Label>
            <Input value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button disabled={busy || !dirty} onClick={save}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {dirty ? "Guardar" : "Guardado"}
          </Button>
          <TemplateRowActions id={template.id} name={template.name} afterDelete="list" />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="font-semibold">Avisos</h2>
            <TemplateWarnings warnings={warnings} />
            {dirty ? <p className="text-xs text-muted-foreground">Los avisos se recalculan al guardar.</p> : null}
          </section>
          <section className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Código</h2>
              <p className="text-xs text-muted-foreground">{Math.round(new Blob([html]).size / 1024)} KB</p>
            </div>
            <Textarea value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false} className="h-[640px] font-mono text-xs leading-relaxed" aria-label="Código HTML de la plantilla" />
            <p className="text-xs text-muted-foreground">Variables: {"{{nombre}}"}, {"{{empresa}}"}, {"{{nombre|colega}}"}, columnas del Excel y {"{{baja}}"} (por ejemplo {'<a href="{{baja}}">Darme de baja</a>'}).</p>
          </section>
        </div>
        <div className="xl:sticky xl:top-4 xl:self-start">
          <EmailPreview subject={name} preheader="" blocks={[]} footer={footer} contact={SAMPLE} customHtml={preview} />
        </div>
      </div>
    </div>
  );
}
