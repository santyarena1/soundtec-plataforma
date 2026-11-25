"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Plus, Sparkles, Wand2 } from "lucide-react";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUnsavedValue } from "@/hooks/use-unsaved-changes-guard";
import { saveQuickEditContent, saveQuickEditTexts, type QuickEditData } from "@/server/actions/quick-edit";
import type { SpecRow } from "@/lib/quick-edit/content";
import { draftQuickEditLongDescription, draftQuickEditShortDescription, type AiDraftResult } from "@/server/actions/quick-edit-ai";
import { CharCount, RowTools, SaveBar, SectionHead, moveInList, useFeedback } from "./parts";

interface TabProps {
  data: QuickEditData;
  onSaved: () => void;
  onDirty: (dirty: boolean) => void;
}

function useReportDirty(onDirty: (dirty: boolean) => void, ...flags: boolean[]) {
  const dirty = flags.some(Boolean);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
}

const errorText = (error: unknown) => (error instanceof Error && error.message ? error.message : "No se pudo guardar. Probá de nuevo.");

export function TextsTab({ data, onSaved, onDirty }: TabProps) {
  const p = data.product;
  const [texts, setTexts] = useState({ name: p.name, short: p.shortDescription, long: p.longDescription });
  const [features, setFeatures] = useState<string[]>(p.keyFeatures);
  const [inSpanish, setInSpanish] = useState(p.featuresInSpanish);
  const [specs, setSpecs] = useState<SpecRow[]>(p.specifications);
  const textsGuard = useUnsavedValue(texts);
  const contentGuard = useUnsavedValue({ features, inSpanish, specs });
  useReportDirty(onDirty, textsGuard.isDirty, contentGuard.isDirty);
  const [textsFeedback, setTextsFeedback] = useFeedback();
  const [contentFeedback, setContentFeedback] = useFeedback();
  const [savingTexts, startTexts] = useTransition();
  const [savingContent, startContent] = useTransition();
  // IA: el texto generado va al campo para revisarlo; se guarda recién con «Guardar textos».
  const [aiBusy, setAiBusy] = useState<"short" | "long" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFresh, setAiFresh] = useState<{ short: boolean; long: boolean }>({ short: false, long: false });
  const [longFromAi, setLongFromAi] = useState(false);

  async function generate(field: "short" | "long") {
    setAiError(null);
    setAiBusy(field);
    try {
      const input = { productId: p.id, name: texts.name, shortDescription: texts.short, longDescription: texts.long };
      const result: AiDraftResult = field === "short" ? await draftQuickEditShortDescription(input) : await draftQuickEditLongDescription(input);
      if (!result.ok) return setAiError(result.error);
      setTexts((t) => ({ ...t, [field]: result.text }));
      setAiFresh((f) => ({ ...f, [field]: true }));
      if (field === "long") setLongFromAi(true);
    } catch {
      setAiError("No se pudo hablar con la IA. Probá de nuevo.");
    } finally {
      setAiBusy(null);
    }
  }

  function saveTexts() {
    setTextsFeedback(null);
    startTexts(async () => {
      try {
        const result = await saveQuickEditTexts({ productId: p.id, name: texts.name, shortDescription: texts.short, longDescription: texts.long, longFromAi });
        if (!result.ok) return setTextsFeedback({ tone: "error", text: result.error });
        textsGuard.markSaved();
        const markedAi = longFromAi && !!texts.long.trim();
        setAiFresh({ short: false, long: false });
        setLongFromAi(false);
        setTextsFeedback({ tone: "ok", text: result.notice ?? (markedAi ? "Textos guardados. La descripción larga queda marcada como generada con IA." : "Textos guardados. La ficha ya muestra los nuevos.") });
        onSaved();
      } catch (error) {
        setTextsFeedback({ tone: "error", text: errorText(error) });
      }
    });
  }

  function saveContent() {
    setContentFeedback(null);
    startContent(async () => {
      try {
        const result = await saveQuickEditContent({ productId: p.id, keyFeatures: features, featuresInSpanish: inSpanish, specifications: specs });
        if (!result.ok) return setContentFeedback({ tone: "error", text: result.error });
        const cleanFeatures = features.map((f) => f.trim()).filter(Boolean);
        const cleanSpecs = specs.filter((s) => s.label.trim() || s.value.trim());
        setFeatures(cleanFeatures);
        setSpecs(cleanSpecs);
        contentGuard.markSaved({ features: cleanFeatures, inSpanish, specs: cleanSpecs });
        setContentFeedback({ tone: "ok", text: "Características y especificaciones guardadas." });
        onSaved();
      } catch (error) {
        setContentFeedback({ tone: "error", text: errorText(error) });
      }
    });
  }

  const updateSpec = (i: number, patch: Partial<SpecRow>) => setSpecs((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-8">
      <section id="qe-textos">
        <SectionHead title="Título y descripciones" hint="Lo que ve el cliente arriba de todo y en la «Descripción técnica»." />
        <div className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="qe-name">Nombre visible</Label>
              <CharCount value={texts.name} max={280} />
            </div>
            <Input id="qe-name" value={texts.name} onChange={(e) => setTexts({ ...texts, name: e.target.value })} className="text-base font-medium" />
          </div>
          <dl className="grid grid-cols-3 gap-2 rounded-md border border-dashed border-border bg-secondary/30 px-3 py-2 text-xs">
            <div className="min-w-0">
              <dt className="text-muted-foreground">Modelo</dt>
              <dd className="truncate font-mono">{p.modelNumber || "—"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">SKU proveedor</dt>
              <dd className="truncate font-mono">{p.supplierSku || "—"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Código Tango</dt>
              <dd className="truncate font-mono">{p.internalSku || "—"}</dd>
            </div>
            <p className="col-span-3 text-[11px] text-muted-foreground">Solo lectura: los códigos se cambian en el admin completo.</p>
          </dl>
          <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="qe-short">Descripción corta{aiFresh.short ? <AiMark /> : null}</Label>
              <span className="flex items-center gap-2">
                <AiButton busy={aiBusy === "short"} disabled={aiBusy !== null || savingTexts} filled={!!texts.short.trim()} onClick={() => void generate("short")} what="descripción corta" />
                <CharCount value={texts.short} max={500} />
              </span>
            </div>
            <Textarea id="qe-short" rows={3} value={texts.short} onChange={(e) => setTexts({ ...texts, short: e.target.value })} placeholder="Una o dos líneas: qué es y para qué sirve." />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="qe-long">Descripción larga{aiFresh.long ? <AiMark /> : null}</Label>
              <span className="flex items-center gap-2">
                <AiButton busy={aiBusy === "long"} disabled={aiBusy !== null || savingTexts} filled={!!texts.long.trim()} onClick={() => void generate("long")} what="descripción larga" />
                <CharCount value={texts.long} max={20000} />
              </span>
            </div>
            <Textarea id="qe-long" rows={10} value={texts.long} onChange={(e) => setTexts({ ...texts, long: e.target.value })} className="font-[450] leading-relaxed" />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Cada renglón se muestra como un párrafo.
              {longFromAi ? " Generada con IA: revisala antes de guardar. Al guardar, la ficha muestra el cartel «Descripción generada con IA»." : p.aiGenerated ? " Esta descripción figura como generada con IA." : ""}
            </p>
            {aiError ? (
              <p role="alert" className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {aiError}
              </p>
            ) : null}
          </div>
        </div>
        <SaveBar
          dirty={textsGuard.isDirty}
          pending={savingTexts}
          feedback={textsFeedback}
          onSave={saveTexts}
          onDiscard={() => {
            setTexts({ name: p.name, short: p.shortDescription, long: p.longDescription });
            setAiFresh({ short: false, long: false });
            setLongFromAi(false);
          }}
          label="Guardar textos"
        />
      </section>

      <section id="qe-specs">
        <SectionHead title="Características destacadas" hint="Viñetas de la ficha. Se le muestran al cliente solo si la ficha está en castellano." />
        <ul className="space-y-1.5">
          {features.map((f, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
              <Input value={f} onChange={(e) => setFeatures((list) => list.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Característica ${i + 1}`} />
              <RowTools index={i} count={features.length} label={`característica ${i + 1}`} onMove={(a, b) => setFeatures((l) => moveInList(l, a, b))} onRemove={() => setFeatures((l) => l.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setFeatures((l) => [...l, ""])}>
            <Plus className="h-3.5 w-3.5" /> Agregar característica
          </Button>
          <label className="inline-flex items-center gap-2 text-xs">
            <input type="checkbox" checked={inSpanish} onChange={(e) => setInSpanish(e.target.checked)} className="h-4 w-4 accent-primary" />
            Está en castellano: mostrarlas al cliente
          </label>
        </div>

        <div className="mt-6">
          <SectionHead title="Especificaciones" hint="Tabla rótulo / valor. El grupo es opcional (Audio, Alimentación…) y ordena la tabla en secciones." />
          {specs.length ? (
            <div className="overflow-hidden rounded-md border border-border">
              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-1.5 border-b border-border bg-secondary/50 px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>Grupo</span>
                <span>Rótulo</span>
                <span>Valor</span>
                <span className="w-[5.25rem]" />
              </div>
              <ul className="divide-y divide-border">
                {specs.map((s, i) => (
                  <li key={i} className="grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1.3fr)_auto] items-center gap-1.5 px-2 py-1.5">
                    <Input value={s.group} onChange={(e) => updateSpec(i, { group: e.target.value })} className="h-8 text-xs" aria-label={`Grupo de la especificación ${i + 1}`} />
                    <Input value={s.label} onChange={(e) => updateSpec(i, { label: e.target.value })} className="h-8 text-xs font-medium" aria-label={`Rótulo de la especificación ${i + 1}`} />
                    <Input value={s.value} onChange={(e) => updateSpec(i, { value: e.target.value })} className="h-8 text-xs" aria-label={`Valor de la especificación ${i + 1}`} />
                    <RowTools index={i} count={specs.length} label={`especificación ${i + 1}`} onMove={(a, b) => setSpecs((l) => moveInList(l, a, b))} onRemove={() => setSpecs((l) => l.filter((_, j) => j !== i))} />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Sin especificaciones cargadas.</p>
          )}
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setSpecs((l) => [...l, { group: l[l.length - 1]?.group ?? "", label: "", value: "" }])}>
            <Plus className="h-3.5 w-3.5" /> Agregar especificación
          </Button>
        </div>
        <SaveBar
          dirty={contentGuard.isDirty}
          pending={savingContent}
          feedback={contentFeedback}
          onSave={saveContent}
          onDiscard={() => {
            setFeatures(p.keyFeatures);
            setInSpanish(p.featuresInSpanish);
            setSpecs(p.specifications);
          }}
          label="Guardar características y especificaciones"
        />
      </section>
    </div>
  );
}

function AiMark() {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 align-middle text-[10px] font-medium text-accent">
      <Sparkles className="h-3 w-3" /> Recién generada, sin guardar
    </span>
  );
}

function AiButton({ busy, disabled, filled, onClick, what }: { busy: boolean; disabled: boolean; filled: boolean; onClick: () => void; what: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${filled ? "Regenerar" : "Generar"} la ${what} con IA: queda en el campo para revisarla antes de guardar`}
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-accent/30 bg-accent/[0.06] px-2.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/15 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
      {busy ? "Generando…" : filled ? "Regenerar con IA" : "Generar con IA"}
    </button>
  );
}

export { useReportDirty, errorText };
export type { TabProps };
