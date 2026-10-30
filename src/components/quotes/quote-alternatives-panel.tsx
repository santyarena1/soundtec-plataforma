"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import {
  createQuoteAlternative,
  deleteQuoteAlternative,
  moveQuoteAlternative,
  updateQuoteAlternative,
} from "@/server/actions/quote-alternatives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { formatUsd } from "@/lib/utils";

export interface AlternativeTab {
  id: string;
  name: string;
  purpose: string | null;
  /** Productos de su planilla (sin los ocultos del PDF). */
  count: number;
  /** Total neto de su planilla. */
  amount: number;
}

/**
 * Alternativas: propuestas distintas para el mismo cliente, cada una con su
 * propia planilla y su total (el cliente elige una). Con una sola, la pantalla
 * es la planilla de siempre y acá solo se ofrece sumar otra.
 */
export function QuoteAlternativesPanel({
  quoteId,
  alternatives,
  activeId,
  readOnly,
}: {
  quoteId: string;
  alternatives: AlternativeTab[];
  activeId: string | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const active = alternatives.find((a) => a.id === activeId) ?? alternatives[0] ?? null;
  const multiple = alternatives.length > 1;
  const hrefFor = (id: string) => `/admin/quotes/${quoteId}?paso=4&alt=${id}`;

  function create(copyFromId: string | null) {
    start(async () => {
      const result = await createQuoteAlternative({ quoteId, copyFromId });
      if (!result.ok || !result.alternativeId) return void toast.error(result.error || "No se pudo crear la alternativa.");
      toast.success(copyFromId ? "Alternativa duplicada: cambiá lo que difiere." : "Alternativa creada: cargale sus productos.");
      router.push(hrefFor(result.alternativeId));
      router.refresh();
    });
  }

  function save(field: "name" | "purpose", value: string, previous: string) {
    if (!active || value.trim() === previous.trim()) return;
    start(async () => {
      const result = await updateQuoteAlternative({ alternativeId: active.id, [field]: value });
      if (!result.ok) toast.error(result.error || "No se pudo guardar.");
      else router.refresh();
    });
  }

  async function remove() {
    if (!active) return;
    const ok = await confirmDialog({
      message:
        active.count > 0
          ? `¿Borrar «${active.name}»? Se borran sus ${active.count} producto${active.count === 1 ? "" : "s"} y sus ambientes. Las otras alternativas no se tocan.`
          : `¿Borrar «${active.name}»?`,
      tone: "danger",
      confirmLabel: "Borrar alternativa",
    });
    if (!ok) return;
    start(async () => {
      const result = await deleteQuoteAlternative({ alternativeId: active.id });
      if (!result.ok) return void toast.error(result.error || "No se pudo borrar.");
      toast.success("Alternativa borrada.");
      router.push(result.alternativeId ? hrefFor(result.alternativeId) : `/admin/quotes/${quoteId}?paso=4`);
      router.refresh();
    });
  }

  function move(direction: "left" | "right") {
    if (!active) return;
    start(async () => {
      const result = await moveQuoteAlternative({ alternativeId: active.id, direction });
      if (!result.ok) toast.error(result.error || "No se pudo mover.");
      else router.refresh();
    });
  }

  if (!multiple) {
    if (readOnly || !active) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">¿Le ofrecés más de una opción al cliente?</span> Cada alternativa tiene su
          propia planilla y su total, y en el PDF salen una debajo de la otra.
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => create(active.id)}>
            <Copy className="h-3.5 w-3.5" />
            Duplicar como alternativa
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => create(null)}>
            <Plus className="h-3.5 w-3.5" />
            Alternativa vacía
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-end gap-1 border-b border-border px-3 pt-3" role="tablist" aria-label="Alternativas">
        {alternatives.map((alt) => {
          const selected = alt.id === active?.id;
          return (
            <a
              key={alt.id}
              href={hrefFor(alt.id)}
              role="tab"
              aria-selected={selected}
              onClick={(e) => {
                e.preventDefault();
                router.push(hrefFor(alt.id), { scroll: false });
              }}
              className={`-mb-px rounded-t-md border px-4 py-2 text-sm transition-colors ${
                selected
                  ? "border-border border-b-card bg-card font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
              }`}
            >
              <span className="block">{alt.name}</span>
              <span className="block text-xs font-normal tabular-nums text-muted-foreground">
                {alt.count} ítem{alt.count === 1 ? "" : "s"} · {formatUsd(alt.amount)}
              </span>
            </a>
          );
        })}
        {!readOnly ? (
          <div className="mb-1.5 ml-auto flex gap-1">
            <Button type="button" size="sm" variant="outline" disabled={pending || !active} onClick={() => active && create(active.id)}>
              <Copy className="h-3.5 w-3.5" />
              Duplicar esta
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => create(null)}>
              <Plus className="h-3.5 w-3.5" />
              Alternativa
            </Button>
          </div>
        ) : null}
      </div>

      <p className="px-4 pt-3 text-xs text-muted-foreground">
        Cada pestaña es una propuesta completa con su planilla y su total; el cliente elige una. Lo que agregues abajo entra en{" "}
        <span className="font-medium text-foreground">{active?.name}</span>.
      </p>
      {active ? (
        <div className="grid gap-3 px-4 pb-4 pt-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`alt-name-${active.id}`}>
              Nombre
            </label>
            <Input
              key={`name-${active.id}-${active.name}`}
              id={`alt-name-${active.id}`}
              defaultValue={active.name}
              disabled={readOnly}
              className="mt-1"
              onBlur={(e) => save("name", e.target.value, active.name)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`alt-purpose-${active.id}`}>
              Qué la diferencia (sale en el PDF debajo del nombre)
            </label>
            <Input
              key={`purpose-${active.id}-${active.purpose ?? ""}`}
              id={`alt-purpose-${active.id}`}
              defaultValue={active.purpose ?? ""}
              disabled={readOnly}
              placeholder="Ej.: misma cobertura con parlantes de mayor potencia"
              className="mt-1"
              onBlur={(e) => save("purpose", e.target.value, active.purpose ?? "")}
            />
          </div>
          {!readOnly ? (
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="ghost" title="Mover a la izquierda" aria-label="Mover a la izquierda" disabled={pending || alternatives[0]?.id === active.id} onClick={() => move("left")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button type="button" size="sm" variant="ghost" title="Mover a la derecha" aria-label="Mover a la derecha" disabled={pending || alternatives[alternatives.length - 1]?.id === active.id} onClick={() => move("right")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => void remove()}>
                <Trash2 className="h-3.5 w-3.5" />
                Borrar
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
