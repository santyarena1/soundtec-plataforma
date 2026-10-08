"use client";

/** Piezas visuales del asistente: tarjetas de opción, contador y chips de marca. */

import type { ReactNode } from "react";
import { Check, Minus, Plus } from "lucide-react";

export function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-5">
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
      {subtitle ? <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p> : null}
    </header>
  );
}

export function Section({ title, children, hint }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function OptionCard({
  selected,
  onClick,
  label,
  hint,
  icon,
  multi = false,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  icon?: ReactNode;
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3553]/40 ${
        selected
          ? "border-[#1e3553] bg-[#1e3553]/[0.04] shadow-[0_0_0_1px_#1e3553]"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
      }`}
    >
      {icon ? (
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            selected ? "bg-[#1e3553] text-white" : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
          }`}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-snug text-slate-500">{hint}</span> : null}
      </span>
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border transition ${multi ? "rounded-md" : "rounded-full"} ${
          selected ? "border-[#1e3553] bg-[#1e3553] text-white" : "border-slate-300 bg-white text-transparent"
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

export function NumberStepper({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, n)));
  return (
    <div className="inline-flex items-center rounded-xl border border-slate-300 bg-white">
      <button type="button" onClick={() => set(value - 1)} disabled={value <= min} className="p-2.5 text-slate-600 hover:text-slate-900 disabled:opacity-30" aria-label="Menos">
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums text-slate-900">
        {value}
        {suffix ? <span className="ml-1 text-xs font-normal text-slate-500">{suffix}</span> : null}
      </span>
      <button type="button" onClick={() => set(value + 1)} disabled={value >= max} className="p-2.5 text-slate-600 hover:text-slate-900 disabled:opacity-30" aria-label="Más">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export type BrandOption = { slug: string; name: string; logo: string | null; products: number };

export function BrandChips({
  options,
  selected,
  onToggle,
  onClear,
}: {
  options: BrandOption[];
  selected: string[];
  onToggle: (slug: string) => void;
  onClear: () => void;
}) {
  if (!options.length) return <p className="text-xs text-slate-400">Todavía no hay productos cargados de este tipo.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onClear}
        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
          selected.length === 0 ? "border-[#1e3553] bg-[#1e3553] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
        }`}
      >
        Sin preferencia
      </button>
      {options.map((b) => {
        const on = selected.includes(b.slug);
        return (
          <button
            key={b.slug}
            type="button"
            onClick={() => onToggle(b.slug)}
            aria-pressed={on}
            title={`${b.name} · ${b.products} productos`}
            className={`flex h-12 min-w-[7rem] items-center justify-center rounded-xl border bg-white px-3 transition ${
              on ? "border-[#1e3553] shadow-[0_0_0_1px_#1e3553]" : "border-slate-200 opacity-80 hover:border-slate-300 hover:opacity-100"
            }`}
          >
            {b.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logo} alt={b.name} className="max-h-7 max-w-[6.5rem] object-contain" draggable={false} />
            ) : (
              <span className="text-xs font-semibold text-slate-700">{b.name}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
