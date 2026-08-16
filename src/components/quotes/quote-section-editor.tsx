"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuoteBody } from "@/components/quotes/quote-body";
import { RichTextEditor } from "@/components/quotes/rich-text-editor";
import { saveQuoteSectionBody } from "@/server/actions/quotes";
import { toEditorHtml } from "@/lib/quote-richtext";

export function QuoteSectionEditor({
  sectionId,
  title,
  body,
  issued,
}: {
  sectionId: string;
  title: string;
  body: string;
  issued: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [current, setCurrent] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setCurrent(body);
  }, [body]);

  function begin() {
    setError(null);
    setDraft(toEditorHtml(current));
    setEditing(true);
  }

  function save() {
    start(async () => {
      const result = await saveQuoteSectionBody({ sectionId, body: draft });
      if (!result.ok) {
        setError(result.error || "No se pudo guardar.");
        return;
      }
      setCurrent(draft);
      setEditing(false);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-end">
        {!issued && !editing ? (
          <Button type="button" size="sm" variant="outline" onClick={begin} aria-label={`Editar ${title}`}>
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Editar texto
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-2">
          <RichTextEditor value={draft} onChange={setDraft} ariaLabel={`Texto de ${title}`} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
              Guardar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
              <X className="mr-1 h-3.5 w-3.5" />
              Cancelar
            </Button>
            <span className="text-[11px] text-muted-foreground">Sólo esta cotización. La plantilla maestra no cambia.</span>
          </div>
        </div>
      ) : current.trim() ? (
        <div className="rounded-md border border-border/70 bg-white px-3 py-2 text-sm">
          <QuoteBody body={current} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sin texto todavía.</p>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
