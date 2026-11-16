"use client";

import { useState, useTransition } from "react";
import { Calculator, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AUDIENCE_SOURCES, type AudienceFilters, type AudienceQuery, type AudienceSource } from "@/lib/mailing/audience";
import type { FilterOptions } from "@/lib/mailing/filter-options";
import { previewQuery, saveDynamicList } from "@/server/actions/mailing-lists";

const EMPTY_FILTERS: AudienceFilters = { segments: [], taxConditions: [], ownerIds: [], provinces: [], status: "active", portalAccess: "any", requestStatuses: [], eventIds: [] };

/** Chips para elegir varios valores (vacío = todos). */
function ChipSelect({ label, options, value, onChange }: { label: string; options: Array<{ value: string; label: string }>; value: string[]; onChange: (value: string[]) => void }) {
  if (!options.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        {label} <span className="font-normal">{value.length ? `· ${value.length} elegidos` : "· todos"}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
              className={cn("rounded-full border px-2.5 py-1 text-xs transition", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40")}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DynamicListForm({
  options,
  initial,
  onSaved,
}: {
  options: FilterOptions;
  initial?: { id: string; name: string; description: string; query: AudienceQuery };
  onSaved?: (id: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [source, setSource] = useState<AudienceSource>(initial?.query.source ?? "clients");
  const [filters, setFilters] = useState<AudienceFilters>(initial?.query.filters ?? EMPTY_FILTERS);
  const [preview, setPreview] = useState<{ total: number; suppressed: number; invalid: number; duplicates: number; sample: Array<{ email: string; name: string | null; company: string | null }> } | null>(null);
  const [busy, start] = useTransition();

  const set = (patch: Partial<AudienceFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPreview(null);
  };
  const query: AudienceQuery = { source, filters };
  const asOptions = (values: string[]) => values.map((v) => ({ value: v, label: v }));
  const clientFilters = source === "clients" || source === "portal_users";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Sale de</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(AUDIENCE_SOURCES) as AudienceSource[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setSource(key);
                setPreview(null);
              }}
              className={cn("rounded-lg border p-3 text-left transition", source === key ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-primary/40")}
            >
              <p className="text-sm font-semibold">{AUDIENCE_SOURCES[key].label}</p>
              <p className="text-xs text-muted-foreground">{AUDIENCE_SOURCES[key].help}</p>
            </button>
          ))}
        </div>
      </div>

      {clientFilters ? (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <ChipSelect label="Rubro" options={asOptions(options.segments)} value={filters.segments} onChange={(segments) => set({ segments })} />
          {source === "clients" ? <ChipSelect label="Condición frente al IVA" options={asOptions(options.taxConditions)} value={filters.taxConditions} onChange={(taxConditions) => set({ taxConditions })} /> : null}
          <ChipSelect label="Responsable comercial" options={options.owners.map((o) => ({ value: o.id, label: o.name }))} value={filters.ownerIds} onChange={(ownerIds) => set({ ownerIds })} />
          <ChipSelect label="Provincia" options={asOptions(options.provinces)} value={filters.provinces} onChange={(provinces) => set({ provinces })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{source === "clients" ? "Clientes" : "Usuarios"}</p>
              <Select value={filters.status} onChange={(e) => set({ status: e.target.value as AudienceFilters["status"] })}>
                <option value="active">Solo activos</option>
                <option value="inactive">Solo inactivos (para reactivar)</option>
                <option value="all">Activos e inactivos</option>
              </Select>
            </div>
            {source === "clients" ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Acceso al portal</p>
                <Select value={filters.portalAccess} onChange={(e) => set({ portalAccess: e.target.value as AudienceFilters["portalAccess"] })}>
                  <option value="any">Con o sin acceso</option>
                  <option value="with">Con usuario en el portal</option>
                  <option value="without">Sin usuario (para invitarlos)</option>
                </Select>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {source === "expo_leads" ? (
        <div className="rounded-lg border border-border p-3">
          <ChipSelect label="Evento" options={options.events.map((e) => ({ value: e.id, label: e.name }))} value={filters.eventIds} onChange={(eventIds) => set({ eventIds })} />
          {!options.events.length ? <p className="text-xs text-muted-foreground">Todos los interesados (stand, QR y asistente de productos).</p> : null}
        </div>
      ) : null}
      {source === "account_requests" ? (
        <div className="rounded-lg border border-border p-3">
          <ChipSelect
            label="Estado de la solicitud"
            options={[
              { value: "PENDING", label: "Pendientes" },
              { value: "APPROVED", label: "Aprobadas" },
              { value: "REJECTED", label: "Rechazadas" },
            ]}
            value={filters.requestStatuses}
            onChange={(requestStatuses) => set({ requestStatuses })}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-secondary/50 p-3">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const result = await previewQuery(query);
              if (!result.ok) return void toast.error(result.error);
              setPreview(result);
            })
          }
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />} Ver cuántos son
        </Button>
        {preview ? (
          <div className="min-w-0 text-sm">
            <p>
              <b className="text-lg tabular-nums">{preview.total.toLocaleString("es-AR")}</b> mails
              {preview.suppressed ? <span className="text-muted-foreground"> · {preview.suppressed} dados de baja o rebotados (no se cuentan)</span> : null}
              {preview.invalid ? <span className="text-muted-foreground"> · {preview.invalid} mal escritos</span> : null}
            </p>
            {preview.sample.length ? <p className="truncate text-xs text-muted-foreground">{preview.sample.map((s) => (s.company ? `${s.email} (${s.company})` : s.email)).join(" · ")}</p> : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Se recalcula en cada envío: si mañana hay un cliente nuevo que cumple el filtro, le llega.</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label required>Nombre de la lista</Label>
          <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Integradores de Córdoba con portal" />
        </div>
        <div className="space-y-1.5">
          <Label>Nota (opcional)</Label>
          <Input value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="Para qué se usa" />
        </div>
        <Button
          disabled={busy || !name.trim()}
          onClick={() =>
            start(async () => {
              const result = await saveDynamicList({ id: initial?.id, name, description, query });
              if (!result.ok) return void toast.error(result.error);
              toast.success(initial ? "Lista actualizada." : "Lista guardada: ya la podés usar en una campaña.");
              if (!initial) {
                setName("");
                setDescription("");
                setPreview(null);
              }
              onSaved?.(result.id);
            })
          }
        >
          <Save className="h-4 w-4" /> {initial ? "Guardar cambios" : "Guardar lista"}
        </Button>
      </div>
    </div>
  );
}
