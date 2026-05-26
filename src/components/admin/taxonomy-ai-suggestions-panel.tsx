"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Sparkles, Loader2, Check, X, PlusCircle, Zap, Trash2 } from "lucide-react";
import {
  generateTaxonomySuggestions,
  acceptTaxonomySuggestion,
  rejectTaxonomySuggestion,
  acceptAllTaxonomySuggestions,
  generateAndApplyTaxonomySuggestions,
  clearAllTaxonomyData,
} from "@/server/actions/taxonomy-suggestions";
import type { TaxonomySuggestionKind } from "@prisma/client";

export interface TaxonomySuggestionRow {
  id: string;
  suggestedName: string;
  targetId: string | null;
  confidence: number | null;
  rationale: string | null;
  product: { id: string; normalizedName: string; internalSku: string | null };
}

interface Props {
  kind: TaxonomySuggestionKind;
  title: string;
  description: string;
  suggestions: TaxonomySuggestionRow[];
  unassignedCount: number;
}

export function TaxonomyAiSuggestionsPanel({
  kind,
  title,
  description,
  suggestions,
  unassignedCount,
}: Props) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const label = kind === "CATEGORY" ? "categoría" : "familia";
  const labelCap = kind === "CATEGORY" ? "Categoría" : "Familia";
  const labelPlural = kind === "CATEGORY" ? "categorías" : "familias";

  function runGenerate() {
    setMessage(null);
    setError(null);
    start(async () => {
      const r = await generateTaxonomySuggestions(kind);
      if (!r.ok) {
        setError(r.error || "No se pudieron generar sugerencias.");
        return;
      }
      if (r.created === 0) {
        setMessage(
          r.error ||
            `No se generaron sugerencias (${r.skipped} omitidos: ya en cola o sin propuesta de la IA).`
        );
      } else {
        setMessage(
          `IA analizó ${r.created} producto(s): revisá cada fila y confirmá, o usá «Aplicar todo». ${r.skipped > 0 ? `${r.skipped} omitidos.` : ""}`
        );
      }
      router.refresh();
    });
  }

  function runClear() {
    if (
      !window.confirm(
        `¿Borrar TODAS las ${labelPlural} y desasignar todos los productos?\n\nEsto no se puede deshacer.`
      )
    )
      return;
    setMessage(null);
    setError(null);
    start(async () => {
      const r = await clearAllTaxonomyData(kind);
      if (r.ok) {
        setMessage(`Eliminadas ${r.deleted} ${labelPlural}. Los productos quedaron sin asignar.`);
        router.refresh();
      } else {
        setError("No se pudo limpiar.");
      }
    });
  }

  function runGenerateAndApply() {
    if (
      !window.confirm(
        `¿Analizar TODOS los productos sin ${label} y aplicar automáticamente?\n\n` +
          `• Agrupa por categorías amplias (máx. ~20 en total).\n` +
          `• Si coincide con una ${label} existente → se asigna.\n` +
          `• Si no hay match → se crea una ${label} nueva y se asigna.\n\n` +
          `Para catálogos grandes puede tardar varios minutos.`
      )
    ) {
      return;
    }
    setMessage(null);
    setError(null);
    start(async () => {
      const r = await generateAndApplyTaxonomySuggestions(kind);
      if (!r.ok) {
        setError(r.error || "No se pudo completar el proceso.");
        return;
      }
      setMessage(
        `Listo: ${r.applied} producto(s) clasificados (${r.assignedExisting} a ${labelPlural} existentes, ${r.newTaxonomies} ${labelPlural} nuevas creadas).` +
          (r.failed > 0 ? ` ${r.failed} no se pudieron aplicar.` : "")
      );
      router.refresh();
    });
  }

  function runAccept(id: string, createIfMissing: boolean) {
    setError(null);
    start(async () => {
      const r = await acceptTaxonomySuggestion(id, { createIfMissing });
      if (!r.ok) setError(r.error || "No se pudo confirmar.");
      else {
        setMessage(`${labelCap} asignada correctamente.`);
        router.refresh();
      }
    });
  }

  function runReject(id: string) {
    start(async () => {
      await rejectTaxonomySuggestion(id);
      router.refresh();
    });
  }

  function runAcceptAll(createMissing: boolean) {
    setError(null);
    start(async () => {
      const r = await acceptAllTaxonomySuggestions(kind, { createMissing });
      setMessage(
        createMissing
          ? `Aplicadas: ${r.accepted} (${r.assigned} a existentes, ${r.created} ${labelPlural} nuevas). Fallidas: ${r.failed}.`
          : `Asignadas a existentes: ${r.accepted}. Sin aplicar (requieren crear): ${r.failed}.`
      );
      router.refresh();
    });
  }

  const newProposals = suggestions.filter((s) => !s.targetId).length;
  const existingMatches = suggestions.filter((s) => s.targetId).length;

  return (
    <Card className="border-accent/30 bg-gradient-to-br from-card to-accent/5">
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="heading-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              {title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              <li>
                La IA revisa productos <strong>sin {label}</strong> y propone asignarlos a una {label}{" "}
                <strong>existente</strong> si encaja bien.
              </li>
              <li>
                Si no hay match claro, propone una <strong>{label} nueva</strong> para cubrir ese producto (vos
                confirmás antes de crearla, salvo que uses «Aplicar todo»).
              </li>
            </ul>
            <p className="mt-2 text-xs">
              Sin {label}: <strong className="text-foreground">{unassignedCount}</strong>
              {suggestions.length > 0 ? (
                <>
                  {" "}
                  · Pendientes: <strong className="text-foreground">{suggestions.length}</strong>
                  {existingMatches > 0 ? (
                    <span className="text-success"> ({existingMatches} a existentes)</span>
                  ) : null}
                  {newProposals > 0 ? (
                    <span className="text-primary"> ({newProposals} {labelPlural} nuevas propuestas)</span>
                  ) : null}
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <Button onClick={runGenerateAndApply} disabled={pending || unassignedCount === 0} size="sm">
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              Analizar y aplicar todo
            </Button>
            <Button onClick={runGenerate} disabled={pending || unassignedCount === 0} size="sm" variant="outline">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Solo generar sugerencias
            </Button>
            {suggestions.length > 0 ? (
              <div className="flex flex-wrap gap-1 justify-end">
                <Button
                  onClick={() => runAcceptAll(true)}
                  disabled={pending}
                  size="sm"
                  variant="subtle"
                  title={`Asignar y crear ${labelPlural} si faltan`}
                >
                  Aplicar todo
                </Button>
                <Button
                  onClick={() => runAcceptAll(false)}
                  disabled={pending}
                  size="sm"
                  variant="ghost"
                  title="Solo asignar a existentes"
                >
                  Solo existentes
                </Button>
              </div>
            ) : null}
            <Button
              onClick={runClear}
              disabled={pending}
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              title={`Borrar todas las ${labelPlural} y desasignar productos`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpiar todo
            </Button>
          </div>
        </div>

        {message ? <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{message}</p> : null}
        {error ? <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay sugerencias pendientes. Con <strong>{unassignedCount}</strong> producto(s) sin {label}, podés usar
            «Analizar y aplicar todo» o generar sugerencias para revisar una por una.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH>Propuesta de IA</TH>
                <TH>Tipo</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {suggestions.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <Link
                      href={`/admin/products/${s.product.id}`}
                      className="text-sm font-medium hover:text-accent"
                    >
                      {s.product.normalizedName}
                    </Link>
                    {s.product.internalSku ? (
                      <p className="text-[11px] text-muted-foreground">{s.product.internalSku}</p>
                    ) : null}
                  </TD>
                  <TD>
                    <p className="font-medium">{s.suggestedName}</p>
                    {s.confidence != null ? (
                      <p className="text-[11px] text-muted-foreground">
                        Confianza: {Math.round(s.confidence * 100)}%
                      </p>
                    ) : null}
                    {s.rationale ? (
                      <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{s.rationale}</p>
                    ) : null}
                  </TD>
                  <TD>
                    {s.targetId ? (
                      <Badge tone="success">Asignar a existente</Badge>
                    ) : (
                      <Badge tone="primary">Crear {label} nueva</Badge>
                    )}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap justify-end gap-1">
                      {s.targetId ? (
                        <Button
                          size="sm"
                          variant="subtle"
                          disabled={pending}
                          onClick={() => runAccept(s.id, false)}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Confirmar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="subtle"
                          disabled={pending}
                          onClick={() => runAccept(s.id, true)}
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          Crear y asignar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => runReject(s.id)}
                        title="Descartar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
