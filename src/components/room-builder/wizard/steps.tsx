"use client";

/** Contenido de cada paso del asistente de nuevo ambiente. */

import Link from "next/link";
import {
  Blinds,
  ScanLine,
  Building2,
  CalendarDays,
  GraduationCap,
  Home,
  Hotel,
  Lightbulb,
  Monitor,
  MonitorPlay,
  SlidersHorizontal,
  Speaker,
  Store,
  Video,
} from "lucide-react";
import type { ReactNode } from "react";
import type { BrandGroup, BriefSystem, RoomBrief } from "@/services/room-builder/brief";
import { suggestSpeakerCount } from "@/services/room-builder/brief";
import {
  AUDIO_USE_OPTIONS,
  BRAND_GROUP_LABELS,
  CONTROL_OPTIONS,
  DISPLAY_SIZES,
  SECTORS,
  SPEAKER_STYLE_OPTIONS,
  SYSTEM_OPTIONS,
  TIER_OPTIONS,
  VC_OPTIONS,
  brandGroupsFor,
  type SectorKey,
} from "./wizard-data";
import { BrandChips, NumberStepper, OptionCard, Section, StepHeader, type BrandOption } from "./ui";

export type TemplateOption = { key: string; name: string; category: string; areaM2: number; description: string; widthM?: number; depthM?: number };

export type SpaceState = {
  sector: SectorKey | null;
  templateKey: string;
  name: string;
  unitCount: number;
  widthM: number;
  depthM: number;
  heightM: number;
};

type Update = (patch: Partial<RoomBrief>) => void;

const SECTOR_ICON: Record<SectorKey, ReactNode> = {
  residencial: <Home className="h-5 w-5" />,
  hoteleria: <Hotel className="h-5 w-5" />,
  corporativo: <Building2 className="h-5 w-5" />,
  educacion: <GraduationCap className="h-5 w-5" />,
  eventos: <CalendarDays className="h-5 w-5" />,
  comercial: <Store className="h-5 w-5" />,
};

const SYSTEM_ICON: Record<BriefSystem, ReactNode> = {
  audio: <Speaker className="h-5 w-5" />,
  video: <Monitor className="h-5 w-5" />,
  vc: <Video className="h-5 w-5" />,
  control: <SlidersHorizontal className="h-5 w-5" />,
  lighting: <Lightbulb className="h-5 w-5" />,
  shades: <Blinds className="h-5 w-5" />,
  signage: <MonitorPlay className="h-5 w-5" />,
};

export function AmbienteStep({
  space,
  templates,
  onSector,
  onTemplate,
  onSpace,
}: {
  space: SpaceState;
  templates: TemplateOption[];
  onSector: (s: SectorKey) => void;
  onTemplate: (t: TemplateOption) => void;
  onSpace: (patch: Partial<SpaceState>) => void;
}) {
  const sector = SECTORS.find((s) => s.key === space.sector);
  const options = sector ? templates.filter((t) => sector.categories.includes(t.category)) : [];
  return (
    <div className="space-y-7">
      <StepHeader title="¿Qué ambiente vamos a diseñar?" subtitle="Elegí el tipo de proyecto y el ambiente. Después te preguntamos qué lleva." />
      <Link
        href="/admin/room-builder/plano"
        className="flex items-center gap-3 rounded-xl border border-[#1e3553]/20 bg-[#1e3553]/[0.04] px-4 py-3 text-sm text-slate-700 transition hover:border-[#1e3553]/50"
      >
        <ScanLine className="h-5 w-5 shrink-0 text-[#1e3553]" />
        <span>
          <b className="text-slate-900">¿Tenés el plano?</b> Subilo y detectamos el proyecto completo con todos sus ambientes y medidas.
        </span>
      </Link>
      <Section title="Tipo de proyecto">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {SECTORS.map((s) => (
            <OptionCard key={s.key} selected={space.sector === s.key} onClick={() => onSector(s.key)} label={s.label} hint={s.hint} icon={SECTOR_ICON[s.key]} />
          ))}
        </div>
      </Section>
      {sector ? (
        <Section title="Ambiente">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {options.map((t) => (
              <OptionCard
                key={t.key}
                selected={space.templateKey === t.key}
                onClick={() => onTemplate(t)}
                label={t.name}
                hint={`${t.description} · ~${Math.round(t.areaM2)} m²`}
              />
            ))}
          </div>
        </Section>
      ) : null}
      {space.templateKey ? (
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Nombre</span>
            <input
              value={space.name}
              onChange={(e) => onSpace({ name: e.target.value })}
              placeholder="Ej. Living casa Pérez"
              maxLength={200}
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#1e3553] focus:outline-none focus:ring-2 focus:ring-[#1e3553]/15"
            />
          </label>
          <div>
            <span className="text-sm font-semibold text-slate-800">Cantidad de ambientes iguales</span>
            <div className="mt-1.5">
              <NumberStepper value={space.unitCount} min={1} max={500} onChange={(n) => onSpace({ unitCount: n })} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SistemasStep({ brief, update }: { brief: RoomBrief; update: Update }) {
  const toggle = (key: BriefSystem) => {
    const on = brief.systems.includes(key);
    const systems = on ? brief.systems.filter((s) => s !== key) : [...brief.systems, key];
    if (!systems.length) return;
    const patch: Partial<RoomBrief> = { systems };
    if (key === "control" && on) patch.control = "none";
    if (key === "control" && !on && brief.control === "none") patch.control = "crestron-home";
    if (key === "vc" && !on) patch.vcPlatform = brief.vcPlatform ?? "teams";
    update(patch);
  };
  const audioOnly = brief.systems.length === 1 && brief.systems[0] === "audio";
  return (
    <div className="space-y-5">
      <StepHeader title="¿Qué sistemas lleva?" subtitle="Marcá todo lo que tiene que resolver el ambiente. Lo que no marques no se agrega." />
      <div className="grid gap-2.5 sm:grid-cols-2">
        {SYSTEM_OPTIONS.map((o) => (
          <OptionCard key={o.key} multi selected={brief.systems.includes(o.key)} onClick={() => toggle(o.key)} label={o.label} hint={o.hint} icon={SYSTEM_ICON[o.key]} />
        ))}
      </div>
      {audioOnly ? <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">Proyecto solo de audio: armamos parlantes y amplificación, sin control centralizado.</p> : null}
      {(brief.systems.includes("lighting") || brief.systems.includes("shades")) && !brief.systems.includes("control") ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Iluminación y cortinas se manejan desde un sistema de control. Marcá también Control para incluirlo.</p>
      ) : null}
    </div>
  );
}

export function ControlStep({ brief, update }: { brief: RoomBrief; update: Update }) {
  return (
    <div className="space-y-7">
      <StepHeader title="Control y plataforma" subtitle="Con qué se va a manejar el ambiente." />
      {brief.systems.includes("control") ? (
        <Section title="Sistema de control">
          <div className="grid gap-2.5">
            {CONTROL_OPTIONS.map((o) => (
              <OptionCard key={o.key} selected={brief.control === o.key} onClick={() => update({ control: o.key })} label={o.label} hint={o.hint} />
            ))}
          </div>
        </Section>
      ) : null}
      {brief.systems.includes("vc") ? (
        <Section title="Plataforma de videoconferencia">
          <div className="grid gap-2.5 sm:grid-cols-3">
            {VC_OPTIONS.map((o) => (
              <OptionCard key={o.key} selected={brief.vcPlatform === o.key} onClick={() => update({ vcPlatform: o.key })} label={o.label} hint={o.hint} />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

export function AudioStep({ brief, update, areaM2 }: { brief: RoomBrief; update: Update; areaM2: number }) {
  const audio = brief.audio ?? { speakerStyle: "ceiling" as const, use: "music" as const, zones: 1, speakers: null, streaming: false };
  const set = (patch: Partial<typeof audio>) => update({ audio: { ...audio, ...patch } });
  const suggested = suggestSpeakerCount(areaM2, audio.use, audio.zones);
  return (
    <div className="space-y-7">
      <StepHeader title="Audio" subtitle="Con esto elegimos parlantes, cantidad y la amplificación que hace falta." />
      <Section title="Tipo de parlantes">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {SPEAKER_STYLE_OPTIONS.map((o) => (
            <OptionCard key={o.key} selected={audio.speakerStyle === o.key} onClick={() => set({ speakerStyle: o.key })} label={o.label} hint={o.hint} />
          ))}
        </div>
      </Section>
      <Section title="Uso principal">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIO_USE_OPTIONS.map((o) => (
            <OptionCard key={o.key} selected={audio.use === o.key} onClick={() => set({ use: o.key })} label={o.label} hint={o.hint} />
          ))}
        </div>
      </Section>
      <div className="grid gap-6 sm:grid-cols-2">
        <Section title="Zonas" hint="Áreas con volumen y música independientes.">
          <NumberStepper value={audio.zones} min={1} max={24} onChange={(n) => set({ zones: n })} />
        </Section>
        <Section title="Cantidad de parlantes" hint={`Sugerido para ${Math.round(areaM2)} m²: ${suggested}`}>
          <div className="flex flex-wrap items-center gap-3">
            <NumberStepper value={audio.speakers ?? suggested} min={1} max={48} onChange={(n) => set({ speakers: n })} />
            {audio.speakers != null ? (
              <button type="button" onClick={() => set({ speakers: null })} className="text-xs font-semibold text-[#1e3553] underline">
                Usar sugerido
              </button>
            ) : (
              <span className="text-xs text-slate-500">Automático</span>
            )}
          </div>
        </Section>
      </div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
        <input type="checkbox" checked={audio.streaming} onChange={(e) => set({ streaming: e.target.checked })} className="h-4 w-4 accent-[#1e3553]" />
        <span>
          <span className="block text-sm font-semibold text-slate-900">Música por streaming</span>
          <span className="block text-xs text-slate-500">Spotify, AirPlay, radios. Suma un reproductor de red si el amplificador no lo trae.</span>
        </span>
      </label>
    </div>
  );
}

export function VideoStep({ brief, update }: { brief: RoomBrief; update: Update }) {
  const video = brief.video ?? { displays: 1, sizeIn: null };
  const set = (patch: Partial<typeof video>) => update({ video: { ...video, ...patch } });
  return (
    <div className="space-y-7">
      <StepHeader title="Video" subtitle="Pantallas del ambiente." />
      <Section title="Cantidad de pantallas">
        <NumberStepper value={video.displays} min={1} max={12} onChange={(n) => set({ displays: n })} />
      </Section>
      <Section title="Tamaño" hint="Automático: lo calculamos según la distancia de visión.">
        <div className="flex flex-wrap gap-2">
          {[null, ...DISPLAY_SIZES].map((size) => (
            <button
              key={size ?? "auto"}
              type="button"
              onClick={() => set({ sizeIn: size })}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                video.sizeIn === size ? "border-[#1e3553] bg-[#1e3553] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              {size ? `${size}"` : "Automático"}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

export function MarcasStep({
  brief,
  update,
  brands,
}: {
  brief: RoomBrief;
  update: Update;
  brands: Partial<Record<BrandGroup, BrandOption[]>> | null;
}) {
  const groups = brandGroupsFor(brief.systems, brief.control);
  const setGroup = (g: BrandGroup, list: string[]) => update({ brands: { ...brief.brands, [g]: list } });
  return (
    <div className="space-y-7">
      <StepHeader title="Marcas" subtitle="Elegí las marcas con las que querés trabajar. Se priorizan al elegir productos; si no hay algo de esa marca, te sugerimos otras." />
      {!brands ? <p className="text-sm text-slate-500">Cargando marcas…</p> : null}
      {brands
        ? groups.map((g) => {
            const selected = brief.brands[g] ?? [];
            return (
              <Section key={g} title={BRAND_GROUP_LABELS[g]}>
                <BrandChips
                  options={brands[g] ?? []}
                  selected={selected}
                  onToggle={(slug) => setGroup(g, selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug])}
                  onClear={() => setGroup(g, [])}
                />
              </Section>
            );
          })
        : null}
    </div>
  );
}

export function EspacioStep({
  brief,
  update,
  space,
  onSpace,
}: {
  brief: RoomBrief;
  update: Update;
  space: SpaceState;
  onSpace: (patch: Partial<SpaceState>) => void;
}) {
  const field = (key: "widthM" | "depthM" | "heightM", label: string, min: number) => (
    <label className="block">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      <div className="relative mt-1.5">
        <input
          type="number"
          min={min}
          step={0.1}
          value={space[key]}
          onChange={(e) => onSpace({ [key]: Number(e.target.value) || min })}
          className="w-full rounded-xl border border-slate-300 py-2.5 pl-3 pr-8 text-sm tabular-nums focus:border-[#1e3553] focus:outline-none focus:ring-2 focus:ring-[#1e3553]/15"
        />
        <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-slate-400">m</span>
      </div>
    </label>
  );
  return (
    <div className="space-y-7">
      <StepHeader title="Espacio y nivel" subtitle="Medidas del ambiente (después podés ajustarlas o subir un plano) y el nivel del proyecto." />
      <div className="grid gap-4 sm:grid-cols-3">
        {field("widthM", "Ancho", 1.5)}
        {field("depthM", "Fondo", 1.5)}
        {field("heightM", "Alto del techo", 2.2)}
      </div>
      <p className="text-xs text-slate-500">Superficie: {(space.widthM * space.depthM).toFixed(1)} m²</p>
      <Section title="Nivel">
        <div className="grid gap-2.5 sm:grid-cols-3">
          {TIER_OPTIONS.map((o) => (
            <OptionCard key={o.key} selected={brief.tier === o.key} onClick={() => update({ tier: o.key })} label={o.label} hint={o.hint} />
          ))}
        </div>
      </Section>
      <label className="block">
        <span className="text-sm font-semibold text-slate-800">Notas para el proyecto (opcional)</span>
        <textarea
          value={brief.notes ?? ""}
          onChange={(e) => update({ notes: e.target.value || null })}
          rows={3}
          maxLength={1000}
          placeholder="Ej. el cliente quiere todo embutido; ya tiene una TV de 75”"
          className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#1e3553] focus:outline-none focus:ring-2 focus:ring-[#1e3553]/15"
        />
      </label>
    </div>
  );
}
