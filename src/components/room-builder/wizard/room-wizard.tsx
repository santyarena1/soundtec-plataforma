"use client";

/**
 * Asistente para crear un ambiente: relevamiento por pasos (como el Collab
 * Room Builder de Crestron) y, al final, la sala generada con sus equipos.
 */

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from "lucide-react";
import type { BrandGroup, RoomBrief } from "@/services/room-builder/brief";
import { applyBriefToSlots } from "@/services/room-builder/brief";
import { layoutSlotsForTemplate } from "@/services/room-builder/slot-layout";
import {
  AUDIO_USE_OPTIONS,
  CONTROL_OPTIONS,
  SECTORS,
  SPEAKER_STYLE_OPTIONS,
  STEP_LABELS,
  SYSTEM_OPTIONS,
  TIER_OPTIONS,
  VC_OPTIONS,
  initialBrief,
  stepsFor,
  type SectorKey,
  type WizardStep,
} from "./wizard-data";
import {
  AmbienteStep,
  AudioStep,
  ControlStep,
  EspacioStep,
  MarcasStep,
  SistemasStep,
  VideoStep,
  type SpaceState,
  type TemplateOption,
} from "./steps";
import type { BrandOption } from "./ui";

const label = <K extends string>(list: Array<{ key: K; label: string }>, key: K | null | undefined) =>
  list.find((o) => o.key === key)?.label ?? "—";

function defaultDims(t: TemplateOption) {
  const side = Math.sqrt(Math.max(t.areaM2, 4));
  return { widthM: +(t.widthM ?? side * 1.2).toFixed(1), depthM: +(t.depthM ?? side / 1.2).toFixed(1) };
}

export function RoomWizard() {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [brands, setBrands] = useState<Partial<Record<BrandGroup, BrandOption[]>> | null>(null);
  const [space, setSpace] = useState<SpaceState>({ sector: null, templateKey: "", name: "", unitCount: 1, widthM: 5, depthM: 4, heightM: 2.7 });
  const [brief, setBrief] = useState<RoomBrief>(() => initialBrief("residential", ""));
  const [step, setStep] = useState<WizardStep>("ambiente");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    fetch("/api/admin/room-builder/templates")
      .then((r) => r.json())
      .then((j) => j.ok && setTemplates(j.templates))
      .catch(() => toast.error("No se pudieron cargar los ambientes"));
    fetch("/api/admin/room-builder/brands")
      .then((r) => r.json())
      .then((j) => setBrands(j.ok ? j.brands : {}))
      .catch(() => setBrands({}));
  }, []);

  const template = templates.find((t) => t.key === space.templateKey) ?? null;
  const steps = stepsFor(brief);
  const index = Math.max(0, steps.indexOf(step));
  const areaM2 = space.widthM * space.depthM;

  /** Lo que se va a generar, en vivo. */
  const preview = useMemo(() => {
    if (!template) return [];
    const dims = { widthM: space.widthM, depthM: space.depthM, heightM: space.heightM };
    try {
      return applyBriefToSlots(layoutSlotsForTemplate(template.key, dims.widthM, dims.depthM, dims.heightM), brief, dims);
    } catch {
      return [];
    }
  }, [template, brief, space.widthM, space.depthM, space.heightM]);

  const update = (patch: Partial<RoomBrief>) => setBrief((b) => ({ ...b, ...patch }));
  const onSpace = (patch: Partial<SpaceState>) => setSpace((s) => ({ ...s, ...patch }));

  function onSector(sector: SectorKey) {
    setSpace((s) => ({ ...s, sector, templateKey: "" }));
  }

  function onTemplate(t: TemplateOption) {
    setSpace((s) => ({ ...s, templateKey: t.key, name: s.name || t.name, ...defaultDims(t) }));
    // Respuestas típicas del ambiente como punto de partida, conservando las marcas.
    setBrief((b) => ({ ...initialBrief(t.category, t.key), brands: b.brands, tier: b.tier }));
  }

  const canNext = step !== "ambiente" || Boolean(space.templateKey && space.name.trim());
  const go = (dir: 1 | -1) => setStep(steps[Math.min(steps.length - 1, Math.max(0, index + dir))]);

  function generate() {
    if (!template) return;
    startTransition(async () => {
      const res = await fetch("/api/admin/room-builder/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "space",
          name: space.name.trim() || template.name,
          templateKey: template.key,
          unitCount: space.unitCount,
          widthM: space.widthM,
          depthM: space.depthM,
          heightM: space.heightM,
          areaM2,
          brief,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok || !json.project?.id) {
        toast.error(json?.error || "No se pudo generar el ambiente");
        return;
      }
      toast.success("Ambiente generado con productos sugeridos");
      window.location.href = `/admin/room-builder/${json.project.id}`;
    });
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:flex-row">
      <aside className="shrink-0 lg:w-56">
        <Link href="/admin/room-builder" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Room Builder
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">Nuevo ambiente</h1>
        <ol className="mt-4 flex gap-1 overflow-x-auto lg:flex-col">
          {steps.map((s, i) => {
            const done = i < index;
            const current = s === step;
            const reachable = i <= index || (space.templateKey && space.name.trim());
            return (
              <li key={s}>
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => setStep(s)}
                  className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-sm transition disabled:opacity-40 ${
                    current ? "bg-[#1e3553] font-semibold text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      current ? "bg-white text-[#1e3553]" : done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  {STEP_LABELS[s]}
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          {step === "ambiente" ? <AmbienteStep space={space} templates={templates} onSector={onSector} onTemplate={onTemplate} onSpace={onSpace} /> : null}
          {step === "sistemas" ? <SistemasStep brief={brief} update={update} /> : null}
          {step === "control" ? <ControlStep brief={brief} update={update} /> : null}
          {step === "audio" ? <AudioStep brief={brief} update={update} areaM2={areaM2} /> : null}
          {step === "video" ? <VideoStep brief={brief} update={update} /> : null}
          {step === "marcas" ? <MarcasStep brief={brief} update={update} brands={brands} /> : null}
          {step === "espacio" ? <EspacioStep brief={brief} update={update} space={space} onSpace={onSpace} /> : null}
          {step === "resumen" ? <Resumen brief={brief} space={space} preview={preview} /> : null}

          <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={index === 0}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:invisible"
            >
              <ArrowLeft className="h-4 w-4" /> Atrás
            </button>
            {step === "resumen" ? (
              <button
                type="button"
                onClick={generate}
                disabled={pending || !template}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1e3553] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#162a44] disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generar ambiente
              </button>
            ) : (
              <button
                type="button"
                onClick={() => go(1)}
                disabled={!canNext}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#1e3553] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#162a44] disabled:opacity-40"
              >
                Siguiente <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </main>

      <aside className="shrink-0 lg:w-72">
        <div className="sticky top-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Se va a generar</p>
          {template ? (
            <>
              <p className="mt-1 text-sm font-semibold text-slate-900">{template.name}</p>
              <p className="text-xs text-slate-500">
                {space.widthM} × {space.depthM} m · {areaM2.toFixed(0)} m²{space.unitCount > 1 ? ` · ×${space.unitCount}` : ""}
              </p>
              <ul className="mt-3 space-y-1.5">
                {preview.map((s) => (
                  <li key={s.key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-slate-700">{s.label}</span>
                    <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 font-semibold tabular-nums text-slate-900 shadow-sm">×{s.defaultQty}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Los productos se eligen solos según tus respuestas. Después podés cambiarlos, agregar y mover equipos.
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Elegí un ambiente para ver qué equipos lleva.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Resumen({ brief, space, preview }: { brief: RoomBrief; space: SpaceState; preview: Array<{ key: string; label: string; defaultQty: number }> }) {
  const rows: Array<[string, string]> = [
    ["Tipo de proyecto", label(SECTORS, space.sector)],
    ["Sistemas", brief.systems.map((s) => label(SYSTEM_OPTIONS, s)).join(", ")],
  ];
  if (brief.systems.includes("control")) rows.push(["Control", label(CONTROL_OPTIONS, brief.control)]);
  if (brief.systems.includes("vc")) rows.push(["Videoconferencia", label(VC_OPTIONS, brief.vcPlatform)]);
  if (brief.audio && brief.systems.includes("audio")) {
    rows.push([
      "Audio",
      `${label(SPEAKER_STYLE_OPTIONS, brief.audio.speakerStyle)} · ${label(AUDIO_USE_OPTIONS, brief.audio.use)} · ${brief.audio.zones} zona${
        brief.audio.zones > 1 ? "s" : ""
      }${brief.audio.streaming ? " · streaming" : ""}`,
    ]);
  }
  const brandCount = Object.values(brief.brands).reduce((n, l) => n + (l?.length ?? 0), 0);
  rows.push(["Marcas", brandCount ? `${brandCount} elegidas` : "Sin preferencia"]);
  rows.push(["Nivel", label(TIER_OPTIONS, brief.tier)]);
  return (
    <div>
      <header className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">Revisá y generá</h2>
        <p className="mt-1 text-sm text-slate-500">Armamos la sala 3D, ubicamos los equipos y elegimos productos del catálogo.</p>
      </header>
      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
            <dt className="w-40 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
            <dd className="text-sm text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 text-sm font-semibold text-slate-800">Equipos</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {preview.map((s) => (
          <span key={s.key} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
            {s.defaultQty} × {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
