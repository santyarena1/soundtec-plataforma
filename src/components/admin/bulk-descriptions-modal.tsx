"use client";

import { useState, useTransition } from "react";
import { confirmDiscard, useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { stableSerialize } from "@/lib/unsaved-guard/core";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, X } from "lucide-react";
import { previewBulkDescriptions, saveBulkDescriptions, type BulkDescriptionSummary, type DescriptionType } from "@/server/actions/product-enrichment";

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
  noData?: boolean;
}

function summaryText(s: BulkDescriptionSummary): string {
  const parts = [`${s.generated} generada${s.generated === 1 ? "" : "s"}`, `${s.noData} sin datos`];
  if (s.failed) parts.push(`${s.failed} con error`);
  return parts.join(" · ");
}

export function BulkDescriptionsModal({ selectedIds, onClose }: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [type, setType] = useState<DescriptionType>("long");
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [edited, setEdited] = useState<Record<string, { short?: string; long?: string }>>({});
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState<BulkDescriptionSummary | null>(null);
  const [pending, start] = useTransition();
  // Lo generado por la IA no está guardado hasta «Guardar todo».
  const [savedEdited, setSavedEdited] = useState<string | null>(null);
  const isDirty = step === "review" && rows.length > 0 && stableSerialize(edited) !== savedEdited;
  useUnsavedChangesGuard(isDirty, "Las descripciones generadas todavía no se guardaron. Si salís ahora, se pierden.");
  const close = async () => {
    if (await confirmDiscard(isDirty, "Las descripciones generadas todavía no se guardaron. ¿Descartarlas?")) onClose();
  };

  function generate() {
    setStep("generating");
    start(async () => {
      const r = await previewBulkDescriptions(selectedIds, type);
      setRows(r.results);
      setSummary(r.summary);
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
      // Las filas sin datos o con error no tienen nada que guardar.
      const items = Object.entries(edited)
        .filter(([, v]) => (v.short ?? "").trim() || (v.long ?? "").trim())
        .map(([id, v]) => ({ id, short: v.short, long: v.long }));
      const r = await saveBulkDescriptions(items);
      setSavedEdited(stableSerialize(Object.fromEntries(items.map(({ id, short, long }) => [id, { short, long }]))));
      setSaveMsg(`Guardados: ${r.saved} productos.${r.noData ? ` ${r.noData} sin guardar: el texto era una respuesta de «sin datos» de la IA.` : ""}`);
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
          <button onClick={close} className="text-muted-foreground hover:text-foreground">
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
              {summary ? (
                <p className="rounded-md border border-border bg-muted/40 px-4 py-2 text-sm">
                  <span className="font-medium">Resumen:</span> {summaryText(summary)}
                  {summary.noData ? (
                    <span className="block text-xs text-muted-foreground">
                      «Sin datos»: la IA no encontró información de esos modelos y no se propone texto. Completá la descripción corta o las especificaciones y probá de nuevo.
                    </span>
                  ) : null}
                </p>
              ) : null}
              {saveMsg ? (
                <p className="rounded-md bg-success/10 px-4 py-2 text-sm text-success">{saveMsg}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Revisá y editá las descripciones antes de guardar.</p>
              )}
              {rows.map((row) => (
                <div key={row.id} className="rounded-lg border border-border p-4 space-y-2">
                  <p className="text-sm font-medium truncate">{row.name}</p>
                  {row.error ? (
                    <p className={row.noData ? "text-xs text-warning" : "text-xs text-destructive"}>
                      {row.noData ? "Sin datos · " : ""}
                      {row.error}
                    </p>
                  ) : null}
                  {/* Con «Ambas», si una salió bien se muestra solo esa; la que no tenía datos no se propone. */}
                  {!row.error || row.short || row.long ? (
                    <>
                      {(type === "short" || type === "both") && (!row.error || row.short) && (
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
                      {(type === "long" || type === "both") && (!row.error || row.long) && (
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
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={close}>Cerrar</Button>
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
