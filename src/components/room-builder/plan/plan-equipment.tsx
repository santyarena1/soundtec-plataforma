"use client";

/**
 * Equipos del proyecto desde un plano: si se preinstalan o se arman a mano,
 * qué sistemas lleva cada ambiente, marcas preferidas y el resumen de lo que
 * se va a instalar en cada uno (calculado igual que al generarlo).
 */

import { Hand, ListChecks, Sparkles } from "lucide-react";
import type { BrandGroup, BriefControl, BriefSystem } from "@/services/room-builder/brief";
import type { PlannedEquipment } from "@/services/room-builder/plan-brief";
import { BRAND_GROUP_LABELS, SYSTEM_OPTIONS, brandGroupsFor } from "../wizard/wizard-data";
import { BrandChips, OptionCard, type BrandOption } from "../wizard/ui";

export type EquipMode = "auto" | "manual";

/** Sistemas que dependen de tener un control en la obra. */
const NEEDS_CONTROL = new Set<BriefSystem>(["control", "lighting", "shades"]);

export function EquipChoice({ value, onChange }: { value: EquipMode | null; onChange: (m: EquipMode) => void }) {
  return (
    <div className="space-y-2">
      <OptionCard
        selected={value === "auto"}
        onClick={() => onChange("auto")}
        icon={<Sparkles className="h-4 w-4" />}
        label="Preinstalar equipos"
        hint="Cada ambiente sale con sus equipos del catálogo según lo que lleva, tus marcas y el nivel. Después los podés cambiar."
      />
      <OptionCard
        selected={value === "manual"}
        onClick={() => onChange("manual")}
        icon={<Hand className="h-4 w-4" />}
        label="Armar a mano"
        hint="Se crean las salas 3D con su plano, paredes y muebles, sin equipos. Los agregás vos en cada una."
      />
    </div>
  );
}

/** Qué lleva un ambiente: audio, video, videoconferencia, control… */
export function RoomSystemsChips({ systems, control, onChange }: { systems: BriefSystem[]; control: BriefControl; onChange: (next: BriefSystem[]) => void }) {
  const options = SYSTEM_OPTIONS.filter((o) => control !== "none" || !NEEDS_CONTROL.has(o.key));
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = systems.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            title={o.hint}
            aria-pressed={on}
            onClick={(e) => {
              e.stopPropagation();
              const next = on ? systems.filter((s) => s !== o.key) : [...systems, o.key];
              if (next.length) onChange(next);
            }}
            className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold transition ${on ? "border-[#1e3553] bg-[#1e3553] text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Marcas preferidas por grupo (las de los sistemas que lleva la obra). */
export function PlanBrands({
  systems,
  control,
  brands,
  options,
  onChange,
}: {
  systems: BriefSystem[];
  control: BriefControl;
  brands: Partial<Record<BrandGroup, string[]>>;
  options: Partial<Record<BrandGroup, BrandOption[]>> | null;
  onChange: (next: Partial<Record<BrandGroup, string[]>>) => void;
}) {
  const groups = brandGroupsFor(systems, control);
  if (!options) return <p className="text-xs text-slate-500">Cargando marcas…</p>;
  if (!groups.length) return null;
  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const selected = brands[g] ?? [];
        return (
          <div key={g} className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-600">{BRAND_GROUP_LABELS[g]}</p>
            <BrandChips
              options={options[g] ?? []}
              selected={selected}
              onToggle={(slug) => onChange({ ...brands, [g]: selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug] })}
              onClear={() => onChange({ ...brands, [g]: [] })}
            />
          </div>
        );
      })}
    </div>
  );
}

export type RoomInstall = { id: string; name: string; color: string; items: PlannedEquipment[] | null };

/** Lo que se va a instalar en cada ambiente, antes de generar. */
export function InstallSummary({ rooms, centralNote }: { rooms: RoomInstall[]; centralNote: string | null }) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <ListChecks className="h-3.5 w-3.5" /> Qué se va a instalar
      </p>
      {centralNote ? <p className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">{centralNote}</p> : null}
      <ul className="max-h-[38vh] space-y-1.5 overflow-y-auto pr-1">
        {rooms.map((r) => (
          <li key={r.id} className="rounded-lg border border-slate-200 px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
              {r.name}
            </p>
            {r.items ? (
              r.items.length ? (
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{r.items.map((it) => `${it.label}${it.qty > 1 ? ` ×${it.qty}` : ""}`).join(" · ")}</p>
              ) : (
                <p className="mt-0.5 text-[11px] text-slate-500">Sin equipos propios (los resuelve el equipamiento central).</p>
              )
            ) : (
              <p className="mt-0.5 text-[11px] text-amber-700">Falta la escala para calcular cantidades.</p>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[10.5px] text-slate-500">Tipos y cantidades. Los modelos se eligen del catálogo con tus marcas y el nivel; los cambiás después en cada sala.</p>
    </div>
  );
}
