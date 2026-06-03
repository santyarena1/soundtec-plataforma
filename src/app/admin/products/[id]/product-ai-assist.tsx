"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Sparkles, Loader2, Wand2, FileText, Tag, Settings2, CheckCircle2, Plus } from "lucide-react";
import {
  generateProductDescription,
  generateProductShortDescription,
  saveProductDescriptions,
  suggestClassificationAction,
  applyClassificationSuggestion,
  loadAiPrompts,
  saveAiPrompts,
} from "@/server/actions/product-enrichment";

interface SuggestionItem {
  name: string;
  confidence: number;
}

interface Suggestion {
  brand: SuggestionItem | null;
  category: SuggestionItem | null;
  family: SuggestionItem | null;
  proposedNewCategory?: string | null;
  proposedNewFamily?: string | null;
  rationale?: string;
}

interface Props {
  productId: string;
  productName: string;
  brandName: string | null;
  currentShort: string | null;
  currentLong: string | null;
  isAi: boolean;
}

export function ProductAiAssist({
  productId,
  productName,
  brandName,
  currentShort,
  currentLong,
  isAi,
}: Props) {
  const router = useRouter();

  // ── Descripciones ──
  const [genShort, setGenShort] = useState<string | null>(null);
  const [genLong, setGenLong] = useState<string | null>(null);
  const [shortEdited, setShortEdited] = useState<string>(currentShort ?? "");
  const [longEdited, setLongEdited] = useState<string>(currentLong ?? "");
  const [descError, setDescError] = useState<string | null>(null);
  const [descSaved, setDescSaved] = useState<string | null>(null);
  const [pendingShort, startShort] = useTransition();
  const [pendingLong, startLong] = useTransition();
  const [pendingSave, startSave] = useTransition();

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

  function generateShort() {
    setDescError(null);
    setDescSaved(null);
    startShort(async () => {
      const r = await generateProductShortDescription(productId);
      if (!r.ok) {
        setDescError(r.error || "No se pudo generar la descripción corta.");
        return;
      }
      setGenShort(r.description || "");
      setShortEdited(r.description || "");
      setDescSaved("Descripción corta generada y guardada. Podés editarla acá abajo.");
      router.refresh();
    });
  }

  function generateLong() {
    setDescError(null);
    setDescSaved(null);
    startLong(async () => {
      const r = await generateProductDescription(productId);
      if (!r.ok) {
        setDescError(r.error || "No se pudo generar la descripción larga.");
        return;
      }
      setGenLong(r.description || "");
      setLongEdited(r.description || "");
      setDescSaved("Descripción larga generada y guardada. Podés editarla acá abajo.");
      router.refresh();
    });
  }

  function saveEdits() {
    setDescError(null);
    setDescSaved(null);
    startSave(async () => {
      const r = await saveProductDescriptions({
        productId,
        short: shortEdited,
        long: longEdited,
      });
      if (!r.ok) {
        setDescError(r.error || "No se pudieron guardar los cambios.");
        return;
      }
      setDescSaved("Cambios guardados.");
      router.refresh();
    });
  }

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

  function applyClassification(input: {
    kind: "brand" | "category" | "family" | "all" | "proposedCategory" | "proposedFamily";
  }) {
    if (!suggestion) return;
    setClassApplied(null);
    setClassError(null);
    startApply(async () => {
      try {
        const payload: Parameters<typeof applyClassificationSuggestion>[0] = {
          productId,
        };
        if (input.kind === "brand" || input.kind === "all") {
          payload.brandName = suggestion.brand?.name ?? null;
        }
        if (input.kind === "category" || input.kind === "all") {
          payload.categoryName = suggestion.category?.name ?? null;
        }
        if (input.kind === "family" || input.kind === "all") {
          payload.familyName = suggestion.family?.name ?? null;
        }
        if (input.kind === "proposedCategory") {
          payload.categoryName = suggestion.proposedNewCategory ?? null;
          payload.createIfMissing = true;
        }
        if (input.kind === "proposedFamily") {
          payload.familyName = suggestion.proposedNewFamily ?? null;
          payload.createIfMissing = true;
        }
        const r = await applyClassificationSuggestion(payload);
        if (r.ok) {
          const parts: string[] = [];
          if (input.kind === "all") parts.push("Marca, categoría y familia aplicadas.");
          else if (input.kind === "brand") parts.push("Marca aplicada.");
          else if (input.kind === "category") parts.push("Categoría aplicada.");
          else if (input.kind === "family") parts.push("Familia aplicada.");
          else if (input.kind === "proposedCategory")
            parts.push(`Categoría «${suggestion.proposedNewCategory}» creada y aplicada.`);
          else if (input.kind === "proposedFamily")
            parts.push(`Familia «${suggestion.proposedNewFamily}» creada y aplicada.`);
          setClassApplied(parts.join(" "));
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
      setPromptsSaved("Prompts guardados. Se usarán en las próximas generaciones.");
    } catch {
      setPromptsSaved("Error al guardar.");
    } finally {
      setPromptsSaving(false);
    }
  }

  // ── Render ──

  const descriptionsTab = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={generateShort} disabled={pendingShort || pendingLong}>
          {pendingShort ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
          )}
          {currentShort ? "Regenerar corta" : "Generar corta"}
        </Button>
        <Button size="sm" onClick={generateLong} disabled={pendingShort || pendingLong}>
          {pendingLong ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
          )}
          {currentLong ? "Regenerar larga" : "Generar larga"}
        </Button>
        {(isAi || genLong != null) && <Badge tone="accent">Larga generada con IA</Badge>}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Las descripciones se generan con OpenAI y se guardan automáticamente. Podés
        editarlas abajo y guardarlas manualmente — eso pisa el contenido generado.
      </p>

      {descError ? <p className="text-xs text-destructive">{descError}</p> : null}
      {descSaved ? (
        <p className="text-xs text-success flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {descSaved}
        </p>
      ) : null}

      <div className="space-y-2">
        <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Descripción corta {genShort != null ? <Badge tone="accent">Recién generada</Badge> : null}
        </label>
        <textarea
          rows={2}
          value={shortEdited}
          onChange={(e) => setShortEdited(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="Sin descripción corta. Generala arriba o escribila acá."
        />
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Descripción larga {genLong != null ? <Badge tone="accent">Recién generada</Badge> : null}
        </label>
        <textarea
          rows={6}
          value={longEdited}
          onChange={(e) => setLongEdited(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed"
          placeholder="Sin descripción larga. Generala arriba o escribila acá."
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          Lo que escribís en estos campos pisa cualquier cosa anterior al hacer clic en Guardar.
        </p>
        <Button size="sm" onClick={saveEdits} disabled={pendingSave}>
          {pendingSave ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Guardar cambios
        </Button>
      </div>
    </div>
  );

  const classificationTab = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          La IA sugiere marca, categoría y familia para <strong className="text-foreground">{productName}</strong>{" "}
          basándose en el catálogo actual. Si no hay match exacto, propone crear una categoría o familia nueva.
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
              title="Categoría"
              item={suggestion.category}
              proposedNew={suggestion.proposedNewCategory}
              onApply={() => applyClassification({ kind: "category" })}
              onApplyProposed={() => applyClassification({ kind: "proposedCategory" })}
              disabled={pendingApply}
            />
            <SuggestionCard
              title="Familia"
              item={suggestion.family}
              proposedNew={suggestion.proposedNewFamily}
              onApply={() => applyClassification({ kind: "family" })}
              onApplyProposed={() => applyClassification({ kind: "proposedFamily" })}
              disabled={pendingApply}
            />
          </div>
          {suggestion.brand || suggestion.category || suggestion.family ? (
            <Button
              onClick={() => applyClassification({ kind: "all" })}
              disabled={pendingApply}
              size="sm"
            >
              {pendingApply ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Aplicar las 3 sugerencias del catálogo
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
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h2 className="text-base font-semibold">Asistente IA</h2>
            {brandName ? <Badge tone="muted">{brandName}</Badge> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Generá descripciones y clasificá. Todo se guarda automáticamente.
          </p>
        </div>
        <Tabs
          tabs={[
            {
              id: "descriptions",
              label: "Descripciones",
              content: descriptionsTab,
            },
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
          defaultTab="descriptions"
        />
      </CardContent>
    </Card>
  );
}

function SuggestionCard({
  title,
  item,
  proposedNew,
  onApply,
  onApplyProposed,
  disabled,
}: {
  title: string;
  item: SuggestionItem | null;
  proposedNew?: string | null;
  onApply: () => void;
  onApplyProposed?: () => void;
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
            Aplicar del catálogo
          </Button>
        </>
      ) : proposedNew && onApplyProposed ? (
        <>
          <p className="text-xs text-muted-foreground">Sin match en catálogo.</p>
          <div className="rounded-sm bg-accent/10 border border-accent/30 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-accent">Sugerencia nueva</p>
            <p className="text-sm font-medium">{proposedNew}</p>
          </div>
          <Button
            onClick={onApplyProposed}
            disabled={disabled}
            size="sm"
            variant="outline"
            className="h-7 text-xs justify-start"
          >
            <Plus className="mr-1 h-3 w-3" /> Crear y aplicar
          </Button>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Sin sugerencia.</p>
      )}
    </div>
  );
}

// Re-exports para que el page.tsx no tenga que importar todos los iconos por separado.
export const ProductAiAssistIcons = { FileText, Tag, Settings2 };
