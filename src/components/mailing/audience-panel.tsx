"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Calculator, Database, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { CampaignAudience, RecipientStats } from "@/lib/mailing/audience";
import type { MailContact } from "@/lib/mailing/variables";
import { previewCampaignAudience } from "@/server/actions/mailing";

export type ListOption = {
  id: string;
  name: string;
  kind: "IMPORTED" | "DYNAMIC";
  /** Personas cargadas (importadas) o descripción del filtro (desde la base). */
  detail: string;
  extraFields: string[];
};

type Mode = "off" | "include" | "exclude";

export function AudienceStats({ stats }: { stats: RecipientStats }) {
  const lost = [
    stats.duplicates ? `${stats.duplicates.toLocaleString("es-AR")} repetidos` : "",
    stats.suppressed ? `${stats.suppressed.toLocaleString("es-AR")} dados de baja o rebotados` : "",
    stats.excluded ? `${stats.excluded.toLocaleString("es-AR")} excluidos` : "",
    stats.invalid ? `${stats.invalid.toLocaleString("es-AR")} sin mail válido` : "",
  ].filter(Boolean);
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums">
        {stats.total.toLocaleString("es-AR")} <span className="text-base font-medium text-muted-foreground">{stats.total === 1 ? "persona" : "personas"}</span>
      </p>
      {lost.length ? <p className="text-xs text-muted-foreground">Se sacaron {lost.join(", ")}.</p> : null}
    </div>
  );
}

export function AudiencePanel({
  lists,
  audience,
  onChange,
  onSample,
}: {
  lists: ListOption[];
  audience: CampaignAudience;
  onChange: (audience: CampaignAudience) => void;
  onSample?: (contact: MailContact) => void;
}) {
  const [result, setResult] = useState<{ stats: RecipientStats; missingLists: number; sample: Array<{ email: string; name: string | null; company: string | null }> } | null>(null);
  const [busy, start] = useTransition();

  const modeOf = (id: string): Mode => (audience.include.includes(id) ? "include" : audience.exclude.includes(id) ? "exclude" : "off");
  function setMode(id: string, mode: Mode) {
    const include = audience.include.filter((x) => x !== id);
    const exclude = audience.exclude.filter((x) => x !== id);
    if (mode === "include") include.push(id);
    if (mode === "exclude") exclude.push(id);
    onChange({ include, exclude });
    setResult(null);
  }

  function calculate() {
    start(async () => {
      const res = await previewCampaignAudience(audience);
      if (!res.ok) return void toast.error(res.error);
      setResult({ stats: res.stats, missingLists: res.missingLists, sample: res.sample });
      const first = res.sample.find((s) => s.name) ?? res.sample[0];
      if (first && onSample) onSample({ email: first.email, name: first.name, company: first.company });
    });
  }

  if (!lists.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay listas.{" "}
        <Link href="/admin/mailing/listas" className="font-semibold text-primary underline">
          Armá una desde la base o importá un Excel
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {lists.map((list) => {
          const mode = modeOf(list.id);
          const Icon = list.kind === "DYNAMIC" ? Database : FileSpreadsheet;
          return (
            <li key={list.id} className={cn("flex flex-col gap-2 p-3 sm:flex-row sm:items-center", mode === "include" && "bg-primary/[0.04]", mode === "exclude" && "bg-red-50/60")}>
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{list.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{list.detail}</p>
                </div>
              </div>
              <div role="radiogroup" aria-label={`Uso de ${list.name}`} className="inline-flex shrink-0 rounded-lg border border-border p-0.5 text-xs">
                {(
                  [
                    { key: "off", label: "No" },
                    { key: "include", label: "Sumar" },
                    { key: "exclude", label: "Excluir" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={mode === option.key}
                    onClick={() => setMode(list.id, option.key)}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-medium",
                      mode === option.key ? (option.key === "exclude" ? "bg-red-600 text-white" : option.key === "include" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground") : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Las listas sumadas se juntan sin repetir a nadie; a las excluidas no les llega aunque estén en otra lista. Las bajas, rebotes y quejas se sacan siempre.{" "}
        <Link href="/admin/mailing/listas" className="font-medium text-primary underline">
          Administrar listas
        </Link>
      </p>
      <div className="flex flex-wrap items-center gap-4 rounded-lg bg-secondary/50 p-3">
        <button
          type="button"
          onClick={calculate}
          disabled={busy || !audience.include.length}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:border-primary/40 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4 text-primary" />} Calcular destinatarios
        </button>
        {result ? <AudienceStats stats={result.stats} /> : <p className="text-xs text-muted-foreground">{audience.include.length ? "Calculalo para ver cuántos reciben de verdad." : "Sumá al menos una lista."}</p>}
      </div>
      {result?.missingLists ? <p className="text-xs text-red-700">{result.missingLists} lista(s) elegidas ya no existen.</p> : null}
    </div>
  );
}
