"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { LayoutTemplate, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { HTML_HELP, HtmlImporter, TemplateWarnings } from "@/components/mailing/html-tools";
import type { TemplateWarning } from "@/lib/mailing/html-template";
import { importCampaignHtml, applyTemplateToCampaign } from "@/server/actions/mailing-templates";

/**
 * Contenido de una campaña con HTML propio: desde una plantilla guardada (se
 * copia) o importado solo para esta campaña; después se puede retocar el código.
 */
export function CampaignHtmlContent({
  campaignId,
  html,
  onHtml,
  warnings,
  onImported,
  templates,
}: {
  campaignId: string;
  html: string;
  onHtml: (html: string) => void;
  warnings: TemplateWarning[] | null;
  onImported: (html: string, warnings: TemplateWarning[]) => void;
  templates: Array<{ id: string; name: string }>;
}) {
  const [code, setCode] = useState(html);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [busy, start] = useTransition();

  useEffect(() => setCode(html), [html]);
  useEffect(() => {
    if (code === html) return;
    const timer = setTimeout(() => onHtml(code), 400);
    return () => clearTimeout(timer);
  }, [code, html, onHtml]);

  async function confirmReplace(): Promise<boolean> {
    return !html.trim() || confirmDialog({ message: "¿Reemplazar el HTML actual de la campaña?", confirmLabel: "Reemplazar" });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <LayoutTemplate className="h-4 w-4 text-primary" /> Desde una plantilla guardada
        </p>
        {templates.length ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-label="Plantilla">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              className="shrink-0 whitespace-nowrap"
              disabled={busy || !templateId}
              onClick={async () => {
                if (!(await confirmReplace())) return;
                start(async () => {
                  const result = await applyTemplateToCampaign({ campaignId, templateId });
                  if (!result.ok) return void toast.error(result.error);
                  onImported(result.html, result.warnings);
                  toast.success("Plantilla copiada a la campaña.");
                });
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Usar esta
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay plantillas guardadas.{" "}
            <Link href="/admin/mailing/plantillas" className="font-semibold text-primary underline">
              Importar una
            </Link>{" "}
            o cargá un HTML solo para esta campaña acá abajo.
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <p className="text-sm font-semibold">O un HTML solo para esta campaña</p>
        <p className="text-xs text-muted-foreground">{HTML_HELP}</p>
        <HtmlImporter
          label="Cargar HTML"
          submit={async (data) => {
            if (!(await confirmReplace())) return false;
            data.set("campaignId", campaignId);
            const result = await importCampaignHtml(data);
            if (!result.ok) {
              toast.error(result.error);
              return false;
            }
            onImported(result.html, result.warnings);
            toast.success(`HTML cargado${result.uploaded ? ` · ${result.uploaded} imágenes subidas` : ""}.`);
            return true;
          }}
        />
      </div>

      {html.trim() ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          {warnings ? <TemplateWarnings warnings={warnings} /> : <p className="text-xs text-muted-foreground">Los avisos (peso, imágenes, enlaces) aparecen al guardar.</p>}
          <details>
            <summary className="cursor-pointer text-sm font-semibold">Retocar el código ({Math.round(new Blob([code]).size / 1024)} KB)</summary>
            <Textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} className="mt-2 h-[460px] font-mono text-xs" aria-label="Código HTML de la campaña" />
            <p className="mt-1 text-xs text-muted-foreground">Al guardar se vuelve a limpiar. Los cambios son solo para esta campaña: la plantilla no cambia.</p>
          </details>
        </div>
      ) : null}
    </div>
  );
}
