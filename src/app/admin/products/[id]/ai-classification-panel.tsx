"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import {
  suggestClassificationAction,
  applyClassificationSuggestion,
} from "@/server/actions/product-enrichment";

interface SuggestionItem {
  name: string;
  confidence: number;
}

interface Suggestion {
  brand: SuggestionItem | null;
  category: SuggestionItem | null;
  family: SuggestionItem | null;
  rationale?: string;
}

interface Props {
  productId: string;
}

export function AiClassificationPanel({ productId }: Props) {
  const [pending, start] = useTransition();
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const router = useRouter();

  function fetchSuggestion() {
    setError(null);
    setApplied(null);
    start(async () => {
      try {
        const r = await suggestClassificationAction(productId);
        if (!r.ok || !r.suggestion) {
          setError(r.error || "No se pudo obtener sugerencia.");
          return;
        }
        setSuggestion(r.suggestion);
      } catch {
        setError("Error inesperado al solicitar la sugerencia.");
      }
    });
  }

  function apply(kind: "brand" | "category" | "family" | "all") {
    if (!suggestion) return;
    setApplied(null);
    start(async () => {
      try {
        const r = await applyClassificationSuggestion({
          productId,
          brandName: kind === "brand" || kind === "all" ? suggestion.brand?.name ?? null : undefined,
          categoryName: kind === "category" || kind === "all" ? suggestion.category?.name ?? null : undefined,
          familyName: kind === "family" || kind === "all" ? suggestion.family?.name ?? null : undefined,
        });
        if (r.ok) {
          setApplied(
            kind === "all" ? "Marca, categoría y familia aplicadas." : `${kind === "brand" ? "Marca" : kind === "category" ? "Categoría" : "Familia"} aplicada.`
          );
          router.refresh();
        } else {
          setError(r.error || "No se pudo aplicar.");
        }
      } catch {
        setError("Error al aplicar la sugerencia.");
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="heading-3">Sugerencias de clasificación con IA</h2>
            <p className="text-xs text-muted-foreground">
              La IA te sugiere marca, categoría y familia basándose en el nombre y descripción.
              Para revisar muchas asignaciones de categoría o familia en lote, usá{" "}
              <a href="/admin/categories" className="text-accent hover:underline">
                Categorías
              </a>{" "}
              o{" "}
              <a href="/admin/families" className="text-accent hover:underline">
                Familias
              </a>
              .
            </p>
          </div>
          <Button onClick={fetchSuggestion} disabled={pending} size="sm" variant="outline">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Pedir sugerencia
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {applied ? <p className="text-sm text-success">{applied}</p> : null}

        {suggestion ? (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <SuggestionCard
                title="Marca"
                item={suggestion.brand}
                onApply={() => apply("brand")}
                disabled={pending}
              />
              <SuggestionCard
                title="Categoría"
                item={suggestion.category}
                onApply={() => apply("category")}
                disabled={pending}
              />
              <SuggestionCard
                title="Familia"
                item={suggestion.family}
                onApply={() => apply("family")}
                disabled={pending}
              />
            </div>
            {suggestion.brand || suggestion.category || suggestion.family ? (
              <Button onClick={() => apply("all")} disabled={pending} size="sm">
                Aplicar todas las sugerencias
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">La IA no encontró coincidencias en los catálogos actuales.</p>
            )}
            {suggestion.rationale ? (
              <p className="text-[11px] text-muted-foreground">{suggestion.rationale}</p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SuggestionCard({
  title,
  item,
  onApply,
  disabled,
}: {
  title: string;
  item: SuggestionItem | null;
  onApply: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-secondary/40 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</p>
      {item ? (
        <>
          <p className="mt-1 text-sm font-medium">{item.name}</p>
          <p className="text-[11px] text-muted-foreground">Confianza: {Math.round(item.confidence * 100)}%</p>
          <Button onClick={onApply} disabled={disabled} size="sm" variant="ghost" className="mt-2 h-7 text-xs">
            Aplicar
          </Button>
        </>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Sin sugerencia</p>
      )}
    </div>
  );
}
