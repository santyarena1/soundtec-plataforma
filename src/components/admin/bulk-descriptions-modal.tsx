"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, X } from "lucide-react";
import { previewBulkDescriptions, saveBulkDescriptions, type DescriptionType } from "@/server/actions/product-enrichment";

interface Props {
  selectedIds: string[];
  onClose: () => void;
}

type Step = "choose" | "generating" | "review";

interface ResultRow {
  id: string;
  name: string;
  short: string | null;
  long: string | null;
  error?: string;
}

export function BulkDescriptionsModal({ selectedIds, onClose }: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [type, setType] = useState<DescriptionType>("long");
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [edited, setEdited] = useState<Record<string, { short?: string; long?: string }>>({});
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function generate() {
    setStep("generating");
    start(async () => {
      const r = await previewBulkDescriptions(selectedIds, type);
      setRows(r.results);
      const initial: Record<string, { short?: string; long?: string }> = {};
      for (const row of r.results) {
        initial[row.id] = { short: row.short ?? undefined, long: row.long ?? undefined };
      }
      setEdited(initial);
      setStep("review");
    });
  }

  function save() {
    start(async () => {
      const items = Object.entries(edited).map(([id, v]) => ({ id, short: v.short, long: v.long }));
      const r = await saveBulkDescriptions(items);
      setSaveMsg(`Guardados: ${r.saved} productos.`);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h2 className="font-semibold">Generar descripciones con IA</h2>
            <span className="text-sm text-muted-foreground">· {selectedIds.length} producto(s)</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === "choose" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Elegí qué tipo de descripción generar para los {selectedIds.length} productos seleccionados.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(["short", "long", "both"] as DescriptionType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`rounded-lg border p-4 text-left transition-colors ${type === t ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-muted-foreground"}`}
                  >
                    <p className="font-medium text-sm">
                      {t === "short" ? "Descripción corta" : t === "long" ? "Descripción larga" : "Ambas"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t === "short" ? "1-2 oraciones, resumen del producto" : t === "long" ? "4-7 oraciones, detalles técnicos" : "Corta + larga"}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "generating" && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">Generando descripciones…</p>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              {saveMsg ? (
                <p className="rounded-md bg-success/10 px-4 py-2 text-sm text-success">{saveMsg}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Revisá y editá las descripciones antes de guardar.</p>
              )}
              {rows.map((row) => (
                <div key={row.id} className="rounded-lg border border-border p-4 space-y-2">
                  <p className="text-sm font-medium truncate">{row.name}</p>
                  {row.error ? (
                    <p className="text-xs text-destructive">{row.error}</p>
                  ) : (
                    <>
                      {(type === "short" || type === "both") && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">Descripción corta</p>
                          <textarea
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                            rows={2}
                            value={edited[row.id]?.short ?? ""}
                            onChange={(e) => setEdited((s) => ({ ...s, [row.id]: { ...s[row.id], short: e.target.value } }))}
                          />
                        </div>
                      )}
                      {(type === "long" || type === "both") && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">Descripción larga</p>
                          <textarea
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                            rows={4}
                            value={edited[row.id]?.long ?? ""}
                            onChange={(e) => setEdited((s) => ({ ...s, [row.id]: { ...s[row.id], long: e.target.value } }))}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          {step === "choose" && (
            <Button onClick={generate} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generar
            </Button>
          )}
          {step === "review" && !saveMsg && (
            <Button onClick={save} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar todo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
