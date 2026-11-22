"use client";

import { useEffect, useState, useTransition } from "react";
import { useUnsavedValue } from "@/hooks/use-unsaved-changes-guard";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import {
  suggestClassificationAction,
  applyClassificationSuggestion,
  loadAiPrompts,
  saveAiPrompts,
  type ProductClassificationSuggestion,
} from "@/server/actions/product-enrichment";
import { tangoPathLabel } from "@/lib/tango-tree";

interface SuggestionItem {
  name: string;
  confidence: number;
}

type Suggestion = ProductClassificationSuggestion;

interface Props {
  productId: string;
  productName: string;
  brandName: string | null;
}

/**
 * Asistente IA con dos áreas:
 *  - Clasificación: marca del catálogo y rubro del árbol de Tango (equivalencia o IA); nunca crea rubros.
 *  - Editar prompts: prompts de sistema para descripciones (se aplican a TODOS los productos).
 *
 * Las descripciones cortas y largas se editan DENTRO del ProductForm (sección
 * "Descripciones"), no acá — esto evita duplicación de campos.
 */
export function ProductAiAssist({ productId, productName, brandName }: Props) {
  const router = useRouter();

  // ── Clasificación ──
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [classError, setClassError] = useState<string | null>(null);
  const [classApplied, setClassApplied] = useState<string | null>(null);
  const [pendingSuggest, startSuggest] = useTransition();
  const [pendingApply, startApply] = useTransition();

  // ── Prompts ──
  const [shortPrompt, setShortPrompt] = useState("");
  const [longPrompt, setLongPrompt] = useState("");
  const [defaultShortPrompt, setDefaultShortPrompt] = useState("");
  const [defaultLongPrompt, setDefaultLongPrompt] = useState("");
  const [promptsLoaded, setPromptsLoaded] = useState(false);
  const [promptsSaving, setPromptsSaving] = useState(false);
  const [promptsSaved, setPromptsSaved] = useState<string | null>(null);
  const prompts = useUnsavedValue({ shortPrompt, longPrompt }, { ready: promptsLoaded });

  useEffect(() => {
    (async () => {
      try {
        const r = await loadAiPrompts();
        setShortPrompt(r.short);
        setLongPrompt(r.long);
        setDefaultShortPrompt(r.defaults.short);
        setDefaultLongPrompt(r.defaults.long);
      } catch {
        /* ignore */
      } finally {
        setPromptsLoaded(true);
      }
    })();
  }, []);

  function fetchSuggestion() {
    setClassError(null);
    setClassApplied(null);
    startSuggest(async () => {
      try {
        const r = await suggestClassificationAction(productId);
        if (!r.ok || !r.suggestion) {
          setClassError(r.error || "No se pudo obtener sugerencia.");
          return;
        }
        setSuggestion(r.suggestion);
      } catch {
        setClassError("Error inesperado al solicitar la sugerencia.");
      }
    });
  }

  function applyClassification(input: { kind: "brand" | "category" | "all" }) {
    if (!suggestion) return;
    setClassApplied(null);
    setClassError(null);
    startApply(async () => {
      try {
        const payload: Parameters<typeof applyClassificationSuggestion>[0] = { productId };
        // «Aplicar todo» manda solo lo que hay: lo que no se encontró no se toca.
        if ((input.kind === "brand" || input.kind === "all") && suggestion.brand) payload.brandName = suggestion.brand.name;
        if ((input.kind === "category" || input.kind === "all") && suggestion.category) payload.rubroPath = suggestion.category.name;
        if (payload.brandName === undefined && payload.rubroPath === undefined) {
          setClassError("No hay nada para aplicar: no se cambió nada.");
          return;
        }
        const r = await applyClassificationSuggestion(payload);
        if (r.ok) {
          // Dice exactamente qué se aplicó y qué no (nunca «aplicada» si no se encontró).
          setClassApplied([...(r.applied ?? []), ...(r.notApplied ?? [])].join(" "));
          router.refresh();
        } else {
          setClassError(r.error || "No se pudo aplicar.");
        }
      } catch {
        setClassError("Error al aplicar la sugerencia.");
      }
    });
  }

  async function savePrompts() {
    setPromptsSaving(true);
    setPromptsSaved(null);
    try {
      await saveAiPrompts({ short: shortPrompt, long: longPrompt });
      prompts.markSaved();
      setPromptsSaved("Prompts guardados. Se usarán en las próximas generaciones.");
    } catch {
      setPromptsSaved("Error al guardar.");
    } finally {
      setPromptsSaving(false);
    }
  }

  // ── Render ──

  const classificationTab = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Sugiere marca y rubro para <strong className="text-foreground">{productName}</strong>. El rubro sale primero de la
          tabla de Equivalencias (con la categoría del proveedor); si no hay, la IA elige una ruta del árbol de rubros de Tango.
          Nunca crea rubros: si nada encaja, no cambia el rubro y lo avisa.
        </p>
        <Button onClick={fetchSuggestion} disabled={pendingSuggest} size="sm" variant="outline">
          {pendingSuggest ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          )}
          Pedir sugerencia
        </Button>
      </div>

      {classError ? <p className="text-xs text-destructive">{classError}</p> : null}
      {classApplied ? (
        <p className="text-xs text-success flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {classApplied}
        </p>
      ) : null}

      {suggestion ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <SuggestionCard
              title="Marca"
              item={suggestion.brand}
              onApply={() => applyClassification({ kind: "brand" })}
              disabled={pendingApply}
            />
            <SuggestionCard
              title={suggestion.category?.from === "equivalencia" ? "Rubro (por equivalencia)" : "Rubro"}
              item={suggestion.category ? { name: tangoPathLabel(suggestion.category.name), confidence: suggestion.category.confidence } : null}
              emptyText={suggestion.categoryNote || "Sin sugerencia: el rubro no se cambia."}
              onApply={() => applyClassification({ kind: "category" })}
              disabled={pendingApply}
            />
          </div>
          {suggestion.category && suggestion.categoryNote ? (
            <p className="text-[11px] text-muted-foreground">{suggestion.categoryNote}</p>
          ) : null}
          {suggestion.brand || suggestion.category ? (
            <Button
              onClick={() => applyClassification({ kind: "all" })}
              disabled={pendingApply}
              size="sm"
            >
              {pendingApply ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {suggestion.brand && suggestion.category ? "Aplicar marca y rubro sugeridos" : suggestion.brand ? "Aplicar la marca sugerida" : "Aplicar el rubro sugerido"}
            </Button>
          ) : null}
          {suggestion.rationale ? (
            <p className="text-[11px] text-muted-foreground italic">{suggestion.rationale}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Aún no pediste sugerencia. Click en el botón arriba para empezar.
        </p>
      )}
    </div>
  );

  const promptsTab = (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Estos prompts se envían como mensaje de sistema a OpenAI cuando se genera una descripción.
        Si los dejás vacíos, se usa el prompt por defecto. Los cambios afectan a todos los productos
        a partir de la próxima generación.
      </p>
      {!promptsLoaded ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Cargando prompts guardados…
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Prompt — descripción corta
              </label>
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline hover:text-foreground"
                onClick={() => setShortPrompt(defaultShortPrompt)}
              >
                Restaurar default
              </button>
            </div>
            <textarea
              rows={3}
              value={shortPrompt}
              onChange={(e) => setShortPrompt(e.target.value)}
              placeholder={defaultShortPrompt}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">Vacío = usar default.</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Prompt — descripción larga
              </label>
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline hover:text-foreground"
                onClick={() => setLongPrompt(defaultLongPrompt)}
              >
                Restaurar default
              </button>
            </div>
            <textarea
              rows={4}
              value={longPrompt}
              onChange={(e) => setLongPrompt(e.target.value)}
              placeholder={defaultLongPrompt}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">Vacío = usar default.</p>
          </div>

          <div className="flex items-center justify-between">
            {promptsSaved ? (
              <p className="text-xs text-success flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> {promptsSaved}
              </p>
            ) : (
              <span />
            )}
            <Button size="sm" onClick={savePrompts} disabled={promptsSaving}>
              {promptsSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Guardar prompts
            </Button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <Card data-tour="product-ai">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h2 className="text-base font-semibold">Asistente IA</h2>
            {brandName ? <Badge tone="muted">{brandName}</Badge> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Sugiere clasificación y deja editar los prompts. Las descripciones se generan
            arriba en la sección Descripciones del formulario.
          </p>
        </div>
        <Tabs
          tabs={[
            {
              id: "classification",
              label: "Clasificación",
              content: classificationTab,
            },
            {
              id: "prompts",
              label: "Editar prompts",
              content: promptsTab,
            },
          ]}
          defaultTab="classification"
        />
      </CardContent>
    </Card>
  );
}

function SuggestionCard({
  title,
  item,
  emptyText = "Sin sugerencia.",
  onApply,
  disabled,
}: {
  title: string;
  item: SuggestionItem | null;
  emptyText?: string;
  onApply: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-secondary/40 p-3 flex flex-col gap-1.5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</p>
      {item ? (
        <>
          <p className="text-sm font-medium">{item.name}</p>
          <p className="text-[11px] text-muted-foreground">
            Confianza: {Math.round(item.confidence * 100)}%
          </p>
          <Button onClick={onApply} disabled={disabled} size="sm" variant="ghost" className="h-7 text-xs justify-start">
            Aplicar
          </Button>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}
