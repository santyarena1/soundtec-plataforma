"use client";

import { useState, useCallback } from "react";
import { Sparkles, Check, X, Loader2, ChevronRight, AlertCircle, PlayCircle } from "lucide-react";
import { applyNcmSuggestion } from "@/server/actions/ncm-suggestions";
import { useRouter } from "next/navigation";

interface Product {
  id: string;
  normalizedName: string;
  internalSku: string | null;
  tariffPosition: string | null;
}

interface Suggestion {
  position: string;
  confidence: number;
  reasoning: string;
  dieNumber?: number | null;
}

type RowState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "suggested"; suggestion: Suggestion; query: string }
  | { status: "confirmed"; position: string }
  | { status: "rejected" }
  | { status: "error"; message: string };

function ConfidenceBadge({ value }: { value: number }) {
  if (value >= 0.75)
    return <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">Alta</span>;
  if (value >= 0.5)
    return <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">Media</span>;
  return <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">Baja</span>;
}

export function AiSuggestionsClient({ products }: { products: Product[] }) {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(products.map((p) => [p.id, { status: "idle" }]))
  );
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);

  const setState = useCallback((id: string, state: RowState) => {
    setStates((prev) => ({ ...prev, [id]: state }));
  }, []);

  async function suggestOne(productId: string) {
    setState(productId, { status: "loading" });
    try {
      const res = await fetch("/api/admin/ncm-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json() as { suggestion?: Suggestion | null; query?: string; reason?: string };
      if (!res.ok) throw new Error("Error del servidor");
      if (!data.suggestion) {
        setState(productId, { status: "error", message: `Sin resultados en PCRAM para "${data.query ?? "?"}"` });
        return;
      }
      setState(productId, { status: "suggested", suggestion: data.suggestion, query: data.query ?? "" });
    } catch (e) {
      setState(productId, { status: "error", message: e instanceof Error ? e.message : "Error desconocido" });
    }
  }

  async function confirmOne(productId: string, suggestion: Suggestion) {
    setState(productId, { status: "loading" });
    const result = await applyNcmSuggestion(productId, suggestion.position, suggestion.dieNumber ?? null);
    if (result.ok) {
      setState(productId, { status: "confirmed", position: suggestion.position });
      router.refresh();
    } else {
      setState(productId, { status: "error", message: result.error ?? "Error al guardar" });
    }
  }

  async function runBatch() {
    setBatchRunning(true);
    setBatchProgress(0);
    const pending = products.filter((p) => {
      const s = states[p.id];
      return s?.status === "idle" || s?.status === "error";
    });
    for (let i = 0; i < pending.length; i++) {
      await suggestOne(pending[i].id);
      setBatchProgress(i + 1);
      // Small delay to avoid hammering PCRAM
      if (i < pending.length - 1) await new Promise((r) => setTimeout(r, 600));
    }
    setBatchRunning(false);
  }

  const pendingCount = products.filter((p) => {
    const s = states[p.id];
    return s?.status === "idle" || s?.status === "error";
  }).length;
  const confirmedCount = Object.values(states).filter((s) => s.status === "confirmed").length;

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-16 text-center">
        <Check className="mx-auto mb-3 h-8 w-8 text-green-500" />
        <p className="text-sm font-medium">Todos los productos tienen posición arancelaria asignada</p>
        <p className="mt-1 text-xs text-muted-foreground">No hay productos pendientes de clasificar</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
        <div>
          <p className="text-sm font-semibold">
            {products.length} producto{products.length !== 1 ? "s" : ""} sin posición NCM
          </p>
          <p className="text-xs text-muted-foreground">
            La IA busca en PCRAM y selecciona la posición más adecuada · Vos confirmás o rechazás cada sugerencia
          </p>
        </div>
        <div className="flex items-center gap-3">
          {confirmedCount > 0 && (
            <span className="text-xs text-green-600 font-medium">{confirmedCount} confirmados</span>
          )}
          {batchRunning ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {batchProgress}/{pendingCount}
            </div>
          ) : (
            <button
              type="button"
              onClick={runBatch}
              disabled={pendingCount === 0}
              className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-40"
            >
              <PlayCircle className="h-4 w-4" />
              Sugerir todos ({pendingCount})
            </button>
          )}
        </div>
      </div>

      {/* Product rows */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5">Producto</th>
              <th className="px-4 py-2.5">Sugerencia IA</th>
              <th className="px-4 py-2.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.map((product) => {
              const state = states[product.id] ?? { status: "idle" };
              return (
                <tr key={product.id} className={state.status === "confirmed" ? "bg-green-50/40 dark:bg-green-950/20" : "hover:bg-muted/20"}>
                  {/* Product info */}
                  <td className="px-4 py-3 max-w-xs">
                    <p className="text-sm font-medium leading-tight">{product.normalizedName}</p>
                    {product.internalSku && (
                      <p className="text-xs text-muted-foreground">{product.internalSku}</p>
                    )}
                  </td>

                  {/* Suggestion cell */}
                  <td className="px-4 py-3">
                    {state.status === "idle" && (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                    {state.status === "loading" && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Consultando PCRAM + IA…
                      </div>
                    )}
                    {state.status === "suggested" && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold">{state.suggestion.position}</span>
                          <ConfidenceBadge value={state.suggestion.confidence} />
                          {state.suggestion.dieNumber != null && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                              DIE {state.suggestion.dieNumber}%
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug max-w-sm">{state.suggestion.reasoning}</p>
                        <p className="text-[10px] text-muted-foreground/50">búsqueda: &ldquo;{state.query}&rdquo;</p>
                      </div>
                    )}
                    {state.status === "confirmed" && (
                      <div className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-green-500" />
                        <span className="font-mono text-xs font-semibold text-green-700 dark:text-green-400">{state.position}</span>
                        <span className="text-xs text-muted-foreground">confirmado</span>
                      </div>
                    )}
                    {state.status === "rejected" && (
                      <span className="text-xs text-muted-foreground">Rechazado — podés volver a intentar</span>
                    )}
                    {state.status === "error" && (
                      <div className="flex items-center gap-1.5 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {state.message}
                      </div>
                    )}
                  </td>

                  {/* Actions cell */}
                  <td className="px-4 py-3 text-right">
                    {(state.status === "idle" || state.status === "rejected" || state.status === "error") && (
                      <button
                        type="button"
                        onClick={() => suggestOne(product.id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                        Sugerir
                      </button>
                    )}
                    {state.status === "loading" && (
                      <span className="text-xs text-muted-foreground">…</span>
                    )}
                    {state.status === "suggested" && (
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => setState(product.id, { status: "rejected" })}
                          title="Rechazar"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmOne(product.id, state.suggestion)}
                          className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Confirmar
                        </button>
                      </div>
                    )}
                    {state.status === "confirmed" && (
                      <a
                        href={`/admin/products/${product.id}`}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Ver producto <ChevronRight className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Al confirmar se guarda la posición NCM y el DIE% en el producto. Podés editar luego desde la ficha del producto.
      </p>
    </div>
  );
}
