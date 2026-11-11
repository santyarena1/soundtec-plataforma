"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { BLOCK_LABELS, isQuestionType, videoEmbedUrl, type BlockConfig, type BlockType } from "@/lib/forms/types";
import { FormRichEditor } from "../form-rich-editor";
import { MediaField } from "./media-field";
import { AgendaEditor, MapLinkField } from "./event-editors";
import type { FormBrandOption } from "@/lib/forms/public";

export type EditableBlock = {
  id: string;
  type: BlockType;
  title: string;
  body: string;
  required: boolean;
  config: BlockConfig;
};

export type BlockPatch = Partial<Pick<EditableBlock, "title" | "body" | "required" | "type">> & { config?: BlockConfig };

const field = "h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary/60";
const label = "mb-1.5 block text-sm font-medium";

/** Tipos entre los que se puede cambiar sin perder la configuración. */
const SWITCHABLE: BlockType[][] = [
  ["short_text", "long_text", "email", "phone", "number", "date"],
  ["single_choice", "multi_choice", "dropdown"],
];

export function BlockEditor({
  formId,
  block,
  brands,
  shared,
  onPatch,
}: {
  formId: string;
  block: EditableBlock;
  brands: FormBrandOption[];
  /** La pantalla tiene varios campos: sin imagen al costado ni botón propio. */
  shared: boolean;
  onPatch: (patch: BlockPatch) => void;
}) {
  const c = block.config;
  const isQuestion = isQuestionType(block.type);
  const setConfig = (patch: BlockConfig) => onPatch({ config: { ...c, ...patch } });
  const switchable = SWITCHABLE.find((group) => group.includes(block.type));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">{BLOCK_LABELS[block.type].label}</span>
        <div className="flex items-center gap-3">
          {switchable ? (
            <select value={block.type} onChange={(e) => onPatch({ type: e.target.value as BlockType })} className="h-9 rounded-md border border-border bg-white px-2 text-sm" aria-label="Cambiar tipo">
              {switchable.map((t) => (
                <option key={t} value={t}>
                  {BLOCK_LABELS[t].label}
                </option>
              ))}
            </select>
          ) : null}
          {isQuestion ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input autoComplete="off" type="checkbox" checked={block.required} onChange={(e) => onPatch({ required: e.target.checked })} className="h-4 w-4 accent-primary" />
              Obligatoria
            </label>
          ) : null}
        </div>
      </div>

      <div>
        <label className={label} htmlFor={`title-${block.id}`}>
          {isQuestion ? "Pregunta" : "Título"}
        </label>
        <input autoComplete="off"
          id={`title-${block.id}`}
          value={block.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder={isQuestion ? "¿Qué querés preguntar?" : "Título de la pantalla (opcional)"}
          className={`${field} h-12 text-base font-semibold`}
        />
      </div>

      <div>
        <span className={label}>{isQuestion ? "Aclaración (opcional)" : "Texto"}</span>
        <FormRichEditor
          key={block.id}
          value={block.body}
          onChange={(html) => onPatch({ body: html })}
          ariaLabel="Texto del bloque"
          placeholder="Podés poner negrita, listas y enlaces."
        />
      </div>

      {/* Campos según el tipo */}
      {["short_text", "long_text", "email", "phone", "number"].includes(block.type) ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Texto de ejemplo dentro del campo</label>
            <input autoComplete="off" value={c.placeholder ?? ""} onChange={(e) => setConfig({ placeholder: e.target.value })} className={field} placeholder="Escribí tu respuesta…" />
          </div>
          {block.type === "long_text" ? (
            <div>
              <label className={label}>Máximo de caracteres</label>
              <input autoComplete="off" type="number" min={1} value={c.maxLength ?? ""} onChange={(e) => setConfig({ maxLength: e.target.value ? Number(e.target.value) : undefined })} className={field} placeholder="5000" />
            </div>
          ) : null}
          {block.type === "number" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={label}>Mínimo</label>
                <input autoComplete="off" type="number" value={c.min ?? ""} onChange={(e) => setConfig({ min: e.target.value === "" ? undefined : Number(e.target.value) })} className={field} />
              </div>
              <div>
                <label className={label}>Máximo</label>
                <input autoComplete="off" type="number" value={c.max ?? ""} onChange={(e) => setConfig({ max: e.target.value === "" ? undefined : Number(e.target.value) })} className={field} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {["single_choice", "multi_choice", "dropdown"].includes(block.type) ? (
        <OptionsEditor options={c.options ?? []} onChange={(options) => setConfig({ options })}>
          {block.type !== "dropdown" ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input autoComplete="off" type="checkbox" checked={Boolean(c.allowOther)} onChange={(e) => setConfig({ allowOther: e.target.checked })} className="h-4 w-4 accent-primary" />
              Sumar «Otra» con texto libre
            </label>
          ) : null}
          {block.type === "multi_choice" ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              Elegir entre
              <input autoComplete="off" type="number" min={0} value={c.minChoices ?? ""} onChange={(e) => setConfig({ minChoices: e.target.value ? Number(e.target.value) : undefined })} className="h-9 w-16 rounded-md border border-border px-2" aria-label="Mínimo de opciones" />
              y
              <input autoComplete="off" type="number" min={0} value={c.maxChoices ?? ""} onChange={(e) => setConfig({ maxChoices: e.target.value ? Number(e.target.value) : undefined })} className="h-9 w-16 rounded-md border border-border px-2" aria-label="Máximo de opciones" />
              opciones (vacío = sin límite)
            </div>
          ) : null}
        </OptionsEditor>
      ) : null}

      {block.type === "brand_choice" ? <BrandPicker brands={brands} config={c} onChange={setConfig} /> : null}

      {block.type === "scale" ? (
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className={label}>Desde</label>
            <input autoComplete="off" type="number" value={c.min ?? 1} onChange={(e) => setConfig({ min: Number(e.target.value) })} className={field} />
          </div>
          <div>
            <label className={label}>Hasta</label>
            <input autoComplete="off" type="number" value={c.max ?? 10} onChange={(e) => setConfig({ max: Number(e.target.value) })} className={field} />
          </div>
          <div>
            <label className={label}>Texto del mínimo</label>
            <input autoComplete="off" value={c.minLabel ?? ""} onChange={(e) => setConfig({ minLabel: e.target.value })} className={field} placeholder="Nada" />
          </div>
          <div>
            <label className={label}>Texto del máximo</label>
            <input autoComplete="off" value={c.maxLabel ?? ""} onChange={(e) => setConfig({ maxLabel: e.target.value })} className={field} placeholder="Mucho" />
          </div>
        </div>
      ) : null}

      {block.type === "image" ? (
        <div className="space-y-4">
          <MediaField formId={formId} label="Imagen" value={c.mediaUrl ?? ""} onChange={(url) => setConfig({ mediaUrl: url })} hint="Se ve grande, como una diapositiva. Ideal 1920 × 1080." />
          <div>
            <label className={label}>Descripción de la imagen (accesibilidad)</label>
            <input autoComplete="off" value={c.mediaAlt ?? ""} onChange={(e) => setConfig({ mediaAlt: e.target.value })} className={field} />
          </div>
        </div>
      ) : null}

      {block.type === "video" ? (
        <div className="space-y-4">
          <div>
            <label className={label}>Enlace de YouTube o Vimeo</label>
            <input autoComplete="off" value={c.videoUrl ?? ""} onChange={(e) => setConfig({ videoUrl: e.target.value })} className={field} placeholder="https://www.youtube.com/watch?v=…" />
            {c.videoUrl && !videoEmbedUrl(c.videoUrl) ? <p className="mt-1 text-xs text-destructive">No reconozco ese enlace: pegá el de YouTube o Vimeo.</p> : null}
          </div>
          {!c.videoUrl ? <MediaField formId={formId} label="…o subí el video" accept="video" value={c.mediaUrl ?? ""} onChange={(url) => setConfig({ mediaUrl: url })} hint="MP4 de hasta 45 MB. Para videos largos conviene YouTube." /> : null}
        </div>
      ) : null}

      {block.type === "map" ? <MapLinkField value={c.mapQuery ?? ""} resolved={c.mapResolved} onChange={(mapQuery) => setConfig({ mapQuery, mapResolved: undefined })} /> : null}

      {block.type === "agenda" ? (
        <div>
          <span className={label}>Horarios</span>
          <AgendaEditor items={c.agenda ?? []} onChange={(agenda) => setConfig({ agenda })} />
        </div>
      ) : null}

      {shared ? null : isQuestion ? (
        <MediaField
          formId={formId}
          label="Imagen al costado de la pregunta (opcional)"
          value={c.sideImageUrl ?? ""}
          onChange={(url) => setConfig({ sideImageUrl: url })}
          hint="En pantallas grandes se ve a la derecha; en el celular, debajo."
        />
      ) : (
        <div className="max-w-xs">
          <label className={label}>Texto del botón</label>
          <input autoComplete="off" value={c.buttonLabel ?? ""} onChange={(e) => setConfig({ buttonLabel: e.target.value })} className={field} placeholder="Continuar" />
        </div>
      )}
    </div>
  );
}

function OptionsEditor({ options, onChange, children }: { options: string[]; onChange: (options: string[]) => void; children?: React.ReactNode }) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...options];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <span className={label}>Opciones</span>
      <ul className="space-y-2">
        {options.map((option, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-xs font-bold text-muted-foreground">{String.fromCharCode(65 + i)}</span>
            <input autoComplete="off"
              value={option}
              onChange={(e) => onChange(options.map((o, k) => (k === i ? e.target.value : o)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onChange([...options.slice(0, i + 1), "", ...options.slice(i + 1)]);
                }
              }}
              className={field}
              aria-label={`Opción ${i + 1}`}
            />
            <button type="button" onClick={() => move(i, -1)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Subir opción">
              <ArrowUp className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => move(i, 1)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Bajar opción">
              <ArrowDown className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => onChange(options.filter((_, k) => k !== i))} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Quitar opción">
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onChange([...options, `Opción ${options.length + 1}`])} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground">
        <Plus className="h-4 w-4" /> Agregar opción
      </button>
      {children}
    </div>
  );
}

/** Marcas que se muestran como logos para tildar. Sin ninguna marcada, salen todas las del catálogo. */
function BrandPicker({ brands, config, onChange }: { brands: FormBrandOption[]; config: BlockConfig; onChange: (patch: BlockConfig) => void }) {
  const chosen = config.brandIds ?? [];
  const toggle = (id: string) => onChange({ brandIds: chosen.includes(id) ? chosen.filter((b) => b !== id) : [...chosen, id] });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={label}>Marcas a mostrar</span>
        <span className="text-xs text-muted-foreground">
          {chosen.length ? `${chosen.length} elegidas` : `Todas (${brands.length})`} ·{" "}
          <button type="button" onClick={() => onChange({ brandIds: [] })} className="font-medium text-primary hover:underline">
            usar todas
          </button>
        </span>
      </div>
      <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-3">
        {brands.map((b) => {
          const on = chosen.includes(b.id);
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(b.id)}
              className={`flex h-14 items-center gap-2 rounded-md border bg-white px-2 text-left text-xs font-medium transition ${on ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"}`}
            >
              {b.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logoUrl} alt="" className="h-8 w-16 shrink-0 object-contain" loading="lazy" />
              ) : null}
              <span className="min-w-0 truncate">{b.name}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Sin ninguna marcada se muestran todas las marcas visibles del catálogo, con su logo. Las respuestas llegan con el nombre de cada marca.</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        Elegir entre
        <input autoComplete="off" type="number" min={0} value={config.minChoices ?? ""} onChange={(e) => onChange({ minChoices: e.target.value ? Number(e.target.value) : undefined })} className="h-9 w-16 rounded-md border border-border px-2" aria-label="Mínimo de marcas" />
        y
        <input autoComplete="off" type="number" min={0} value={config.maxChoices ?? ""} onChange={(e) => onChange({ maxChoices: e.target.value ? Number(e.target.value) : undefined })} className="h-9 w-16 rounded-md border border-border px-2" aria-label="Máximo de marcas" />
        marcas (vacío = sin límite)
      </div>
    </div>
  );
}
