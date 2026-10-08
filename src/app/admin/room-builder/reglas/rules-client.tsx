"use client";

/**
 * Reglas del Room Builder (editables):
 * - Integraciones: cómo se controla cada marca/línea desde Crestron Home o programado.
 * - Especificaciones: canales, watts y ohms de amplificadores, reproductores y switches.
 */

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Pencil, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import {
  CONTROL_PLATFORMS,
  INTEGRATION_METHODS,
  METHOD_LABELS,
  PLATFORM_LABELS,
  type IntegrationRule,
} from "@/services/room-builder/integrations";
import type { SystemSpec } from "@/services/room-builder/system-specs";
import { deleteIntegrationRule, resetSystemSpec, saveIntegrationRule, saveSystemSpec, type RuleInput } from "@/server/actions/room-builder-rules";

export type SpecRow = { productId: string; name: string; brand: string; imageUrl: string | null; spec: SystemSpec };
type Brand = { slug: string; name: string };

const input = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-[#1e3553] focus:outline-none focus:ring-2 focus:ring-[#1e3553]/15";

const emptyRule = (): RuleInput => ({
  brandSlug: "",
  productMatch: null,
  platform: "crestron-home",
  method: "driver-ip",
  requirement: null,
  needsNetwork: true,
  verified: true,
  notes: null,
});

function RuleForm({ initial, brands, onDone }: { initial: RuleInput; brands: Brand[]; onDone: () => void }) {
  const [rule, setRule] = useState<RuleInput>(initial);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<RuleInput>) => setRule((r) => ({ ...r, ...patch }));
  function save() {
    startTransition(async () => {
      const res = await saveIntegrationRule(rule);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Regla guardada");
      onDone();
    });
  }
  return (
    <div className="grid gap-3 rounded-xl border border-[#1e3553]/30 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="block text-xs font-semibold text-slate-700">
        Marca
        <select value={rule.brandSlug} onChange={(e) => set({ brandSlug: e.target.value })} className={`${input} mt-1`}>
          <option value="">Elegí…</option>
          {brands.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold text-slate-700">
        Solo modelos que contengan (opcional)
        <input value={rule.productMatch ?? ""} onChange={(e) => set({ productMatch: e.target.value || null })} placeholder="Ej. Connect" className={`${input} mt-1`} />
      </label>
      <label className="block text-xs font-semibold text-slate-700">
        Sistema de control
        <select value={rule.platform} onChange={(e) => set({ platform: e.target.value as RuleInput["platform"] })} className={`${input} mt-1`}>
          {CONTROL_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold text-slate-700">
        Cómo se integra
        <select value={rule.method} onChange={(e) => set({ method: e.target.value as RuleInput["method"] })} className={`${input} mt-1`}>
          {INTEGRATION_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold text-slate-700 sm:col-span-2">
        Qué hace falta
        <input value={rule.requirement ?? ""} onChange={(e) => set({ requirement: e.target.value || null })} placeholder="Ej. Driver certificado, módulo, cable RS-232" className={`${input} mt-1`} />
      </label>
      <label className="block text-xs font-semibold text-slate-700 sm:col-span-2">
        Notas
        <input value={rule.notes ?? ""} onChange={(e) => set({ notes: e.target.value || null })} className={`${input} mt-1`} />
      </label>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={rule.needsNetwork} onChange={(e) => set({ needsNetwork: e.target.checked })} className="h-4 w-4 accent-[#1e3553]" />
          Necesita red
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={rule.verified} onChange={(e) => set({ verified: e.target.checked })} className="h-4 w-4 accent-[#1e3553]" />
          Confirmada
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onDone} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200">
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending || !rule.brandSlug}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e3553] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function IntegrationsTab({ rules, brands }: { rules: IntegrationRule[]; brands: Brand[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const brandName = useMemo(() => new Map(brands.map((b) => [b.slug, b.name])), [brands]);

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteIntegrationRule(id);
      if (!res.ok) toast.error(res.error);
      else toast.success("Regla borrada");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-slate-600">
          El Room Builder usa estas reglas para decir cómo se controla cada equipo y qué hace falta. Las precargadas están marcadas <b>a confirmar</b>.
        </p>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e3553] px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> Nueva regla
        </button>
      </div>
      {editing === "new" ? <RuleForm initial={emptyRule()} brands={brands} onDone={() => setEditing(null)} /> : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Marca / modelos</th>
              <th className="px-3 py-2">Sistema</th>
              <th className="px-3 py-2">Cómo</th>
              <th className="hidden px-3 py-2 md:table-cell">Qué hace falta</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rules.map((r) =>
              editing === r.id ? (
                <tr key={r.id}>
                  <td colSpan={6} className="p-3">
                    <RuleForm initial={{ ...r, id: r.id }} brands={brands} onDone={() => setEditing(null)} />
                  </td>
                </tr>
              ) : (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-slate-900">{brandName.get(r.brandSlug) ?? r.brandSlug}</p>
                    <p className="text-xs text-slate-500">{r.productMatch ? `Modelos con “${r.productMatch}”` : "Toda la marca"}</p>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">{PLATFORM_LABELS[r.platform]}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${r.method === "none" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
                      {METHOD_LABELS[r.method]}
                    </span>
                  </td>
                  <td className="hidden max-w-sm px-3 py-2.5 text-xs text-slate-600 md:table-cell">{r.requirement}</td>
                  <td className="px-3 py-2.5">
                    {r.verified ? (
                      <span className="text-xs font-semibold text-emerald-700">Confirmada</span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700">A confirmar</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <button type="button" onClick={() => setEditing(r.id ?? null)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" disabled={pending} onClick={() => r.id && remove(r.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Borrar">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<SystemSpec["kind"], string> = {
  amplifier: "Amplificador",
  speaker: "Parlante",
  streamer: "Reproductor de red",
  processor: "Procesador",
  display: "Pantalla",
  switch: "Switch",
  other: "Otro",
};

function SpecEditor({ row, onDone }: { row: SpecRow; onDone: () => void }) {
  const [spec, setSpec] = useState(row.spec);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<SystemSpec>) => setSpec((s) => ({ ...s, ...patch }));
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
  function save() {
    startTransition(async () => {
      const res = await saveSystemSpec({
        productId: row.productId,
        kind: spec.kind,
        channels: spec.channels,
        wattsPerChannel: spec.wattsPerChannel,
        minOhms: spec.minOhms,
        nominalOhms: spec.nominalOhms,
        highImpedance: spec.highImpedance,
        streaming: spec.streaming,
        networked: spec.networked,
        notes: null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Especificación guardada");
      onDone();
    });
  }
  return (
    <div className="flex flex-wrap items-end gap-2 bg-slate-50 p-3">
      <label className="text-[11px] font-semibold text-slate-600">
        Tipo
        <select value={spec.kind} onChange={(e) => set({ kind: e.target.value as SystemSpec["kind"] })} className={`${input} mt-0.5 w-40`}>
          {Object.entries(KIND_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[11px] font-semibold text-slate-600">
        Canales
        <input type="number" min={1} value={spec.channels ?? ""} onChange={(e) => set({ channels: numOrNull(e.target.value) })} className={`${input} mt-0.5 w-20`} />
      </label>
      <label className="text-[11px] font-semibold text-slate-600">
        W por canal
        <input type="number" min={1} value={spec.wattsPerChannel ?? ""} onChange={(e) => set({ wattsPerChannel: numOrNull(e.target.value) })} className={`${input} mt-0.5 w-24`} />
      </label>
      <label className="text-[11px] font-semibold text-slate-600">
        Ω mínimo
        <input type="number" min={1} step={0.5} value={spec.minOhms ?? ""} onChange={(e) => set({ minOhms: numOrNull(e.target.value) })} className={`${input} mt-0.5 w-20`} />
      </label>
      {(
        [
          ["networked", "En red"],
          ["streaming", "Streaming"],
          ["highImpedance", "70/100 V"],
        ] as const
      ).map(([key, lbl]) => (
        <label key={key} className="flex items-center gap-1.5 pb-2 text-xs text-slate-700">
          <input type="checkbox" checked={spec[key]} onChange={(e) => set({ [key]: e.target.checked })} className="h-4 w-4 accent-[#1e3553]" />
          {lbl}
        </label>
      ))}
      <div className="ml-auto flex gap-1.5 pb-0.5">
        <button type="button" onClick={onDone} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200" title="Cancelar">
          <X className="h-4 w-4" />
        </button>
        <button type="button" onClick={save} disabled={pending} className="inline-flex items-center gap-1 rounded-lg bg-[#1e3553] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
        </button>
      </div>
    </div>
  );
}

function SpecsTab({ specs }: { specs: SpecRow[] }) {
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rows = specs.filter(
    (r) =>
      (!onlyMissing || (r.spec.kind === "amplifier" && r.spec.channels == null)) &&
      `${r.brand} ${r.name}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const missing = specs.filter((r) => r.spec.kind === "amplifier" && r.spec.channels == null).length;

  function reset(productId: string) {
    startTransition(async () => {
      const res = await resetSystemSpec(productId);
      if (!res.ok) toast.error(res.error);
      else toast.success("Volvió al dato automático");
    });
  }

  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-slate-600">
        Con estos datos el Room Builder calcula cuántos canales hacen falta. <b>Auto</b> = leído del nombre del producto (verificar); al guardar pasa a{" "}
        <b>Manual</b> y gana siempre.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar marca o modelo…" className={`${input} pl-8`} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="h-4 w-4 accent-[#1e3553]" />
          Solo amplificadores sin canales ({missing})
        </label>
      </div>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {rows.map((r) => (
          <div key={r.productId}>
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded border border-slate-100 bg-white">
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageUrl} alt="" className="h-full w-full object-contain" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{r.brand}</p>
                <p className="truncate text-sm font-medium text-slate-900">{r.name}</p>
              </div>
              <div className="hidden text-xs text-slate-600 sm:block">
                {KIND_LABEL[r.spec.kind]}
                {r.spec.channels ? ` · ${r.spec.channels} canales` : r.spec.kind === "amplifier" ? " · canales sin cargar" : ""}
                {r.spec.wattsPerChannel ? ` · ${r.spec.wattsPerChannel} W` : ""}
                {r.spec.streaming ? " · streaming" : ""}
              </div>
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${r.spec.source === "manual" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {r.spec.source === "manual" ? "Manual" : "Auto"}
              </span>
              <button type="button" onClick={() => setEditing(editing === r.productId ? null : r.productId)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Editar">
                <Pencil className="h-4 w-4" />
              </button>
              {r.spec.source === "manual" ? (
                <button type="button" disabled={pending} onClick={() => reset(r.productId)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Volver al dato automático">
                  <RotateCcw className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            {editing === r.productId ? <SpecEditor row={r} onDone={() => setEditing(null)} /> : null}
          </div>
        ))}
        {rows.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">Nada para mostrar con ese filtro.</p> : null}
      </div>
    </div>
  );
}

export function RulesClient({ rules, brands, specs }: { rules: IntegrationRule[]; brands: Brand[]; specs: SpecRow[] }) {
  const [tab, setTab] = useState<"integraciones" | "specs">("integraciones");
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header>
        <Link href="/admin/room-builder" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Room Builder
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Reglas del Room Builder</h1>
        <p className="mt-1 text-sm text-slate-500">Lo que el motor de sistema usa para calcular amplificación e integración con el control.</p>
      </header>
      <nav className="flex gap-1 border-b border-slate-200">
        {(
          [
            ["integraciones", "Integraciones con control"],
            ["specs", "Especificaciones de equipos"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === key ? "border-[#1e3553] text-[#1e3553]" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "integraciones" ? <IntegrationsTab rules={rules} brands={brands} /> : <SpecsTab specs={specs} />}
    </div>
  );
}
