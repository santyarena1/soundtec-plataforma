"use client";

import { Check } from "lucide-react";

export const PROFILE_OPTIONS = [
  { key: "resumido", label: "Corto" },
  { key: "tecnico", label: "Estándar" },
  { key: "premium", label: "Completo" },
] as const;

export const profileLabel = (key: string) => PROFILE_OPTIONS.find((p) => p.key === key)?.label ?? key;

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${
        on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"
      }`}
    >
      {on ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
      {label}
    </button>
  );
}

const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

/** Cuándo sale sola esta versión. Nada marcado en una fila = no importa. */
export function VariantConditions({
  profiles,
  audiences,
  audienceOptions,
  onChange,
}: {
  profiles: string[];
  audiences: string[];
  audienceOptions: { key: string; label: string }[];
  onChange: (next: { profiles: string[]; audiences: string[] }) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
      <p className="text-sm font-medium">¿Cuándo sale esta versión sola?</p>
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">A quién va {audiences.length ? "" : "· cualquiera"}</p>
        <div className="flex flex-wrap gap-1.5">
          {audienceOptions.map((a) => (
            <Chip key={a.key} on={audiences.includes(a.key)} label={a.label} onClick={() => onChange({ profiles, audiences: toggle(audiences, a.key) })} />
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Tipo de presupuesto {profiles.length ? "" : "· cualquiera"}</p>
        <div className="flex flex-wrap gap-1.5">
          {PROFILE_OPTIONS.map((p) => (
            <Chip key={p.key} on={profiles.includes(p.key)} label={p.label} onClick={() => onChange({ audiences, profiles: toggle(profiles, p.key) })} />
          ))}
        </div>
      </div>
      {!profiles.length && !audiences.length ? (
        <p className="text-xs text-warning">Sin condiciones no sale sola: solo se puede elegir a mano en cada cotización.</p>
      ) : null}
    </div>
  );
}
