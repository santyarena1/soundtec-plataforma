"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  CircleDot,
  Copy,
  CopyPlus,
  ExternalLink,
  Eye,
  Flag,
  Hash,
  Image as ImageIcon,
  ListChecks,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Tags,
  ThumbsUp,
  Trash2,
  Type,
  Video,
} from "lucide-react";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { BLOCK_LABELS, CONTENT_TYPES, QUESTION_TYPES, isQuestionType, type BlockType, type FormSettings } from "@/lib/forms/types";
import {
  addFormBlock,
  deleteFormBlock,
  duplicateFormBlock,
  regenerateFormToken,
  reorderFormBlocks,
  setFormStatus,
  updateForm,
  updateFormBlock,
} from "@/server/actions/forms";
import { FormRichEditor } from "../form-rich-editor";
import { BlockEditor, type BlockPatch, type EditableBlock } from "./block-editor";
import { MediaField } from "./media-field";
import type { FormBrandOption } from "@/lib/forms/public";

const ICONS: Record<BlockType, typeof Type> = {
  short_text: Type,
  long_text: AlignLeft,
  email: Mail,
  phone: Phone,
  number: Hash,
  date: CalendarDays,
  single_choice: CircleDot,
  multi_choice: ListChecks,
  dropdown: ChevronDown,
  yes_no: ThumbsUp,
  scale: SlidersHorizontal,
  consent: CheckSquare,
  brand_choice: Tags,
  statement: MessageSquareText,
  image: ImageIcon,
  video: Video,
  map: MapPin,
};

type Status = "DRAFT" | "OPEN" | "CLOSED";
type Selected = "welcome" | "end" | string;

export function FormBuilder({
  form,
  initialBlocks,
  responseCount,
  brands,
}: {
  form: { id: string; title: string; token: string; status: Status; closesAt: string | null; settings: FormSettings };
  initialBlocks: EditableBlock[];
  responseCount: number;
  /** Marcas del catálogo, para los bloques «Marcas». */
  brands: FormBrandOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [title, setTitle] = useState(form.title);
  const [settings, setSettings] = useState<FormSettings>(form.settings);
  const [selected, setSelected] = useState<Selected>(initialBlocks[0]?.id ?? "welcome");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [addOpen, setAddOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const dragId = useRef<string | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);
  // Cuando el servidor devuelve otra estructura (agregar, borrar, ordenar), se toma esa.
  useEffect(() => setBlocks(initialBlocks), [initialBlocks]);

  // Guardado automático: cambios por bloque y de la configuración, agrupados.
  const pendingBlocks = useRef(new Map<string, BlockPatch>());
  const pendingSettings = useRef<FormSettings | null>(null);
  const timer = useRef<number | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const blockPatches = [...pendingBlocks.current.entries()];
    const settingsPatch = pendingSettings.current;
    pendingBlocks.current.clear();
    pendingSettings.current = null;
    if (!blockPatches.length && !settingsPatch) return;
    setSaving("saving");
    const results = await Promise.all([
      ...blockPatches.map(([blockId, patch]) => updateFormBlock({ blockId, ...patch })),
      ...(settingsPatch ? [updateForm({ formId: form.id, settings: settingsPatch })] : []),
    ]);
    const failed = results.find((r) => !r.ok);
    if (failed && !failed.ok) {
      toast.error(failed.error);
      setSaving("idle");
    } else setSaving("saved");
  }, [form.id]);

  const schedule = useCallback(() => {
    setSaving("saving");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 700);
  }, [flush]);

  useEffect(() => () => void flush(), [flush]);

  function patchBlock(id: string, patch: BlockPatch) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch, config: patch.config ?? b.config } : b)));
    const merged = { ...(pendingBlocks.current.get(id) ?? {}), ...patch };
    pendingBlocks.current.set(id, merged);
    schedule();
  }

  function patchSettings(patch: FormSettings) {
    setSettings((prev) => ({ ...prev, ...patch }));
    pendingSettings.current = { ...(pendingSettings.current ?? {}), ...patch };
    schedule();
  }

  function structural(action: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, after?: (r: Record<string, unknown>) => void) {
    start(async () => {
      await flush();
      const result = await action();
      if (!result.ok) return void toast.error(result.error || "No se pudo.");
      after?.(result);
      router.refresh();
    });
  }

  function addBlock(type: BlockType) {
    setAddOpen(false);
    const after = selected !== "welcome" && selected !== "end" ? selected : blocks[blocks.length - 1]?.id ?? null;
    structural(() => addFormBlock({ formId: form.id, type, afterBlockId: after }), (r) => setSelected(String(r.blockId)));
  }

  function moveBlock(id: string, delta: -1 | 1) {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
    structural(() => reorderFormBlocks({ formId: form.id, blockIds: next.map((b) => b.id) }));
  }

  function dropOn(targetId: string) {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    const next = blocks.filter((b) => b.id !== from);
    const at = next.findIndex((b) => b.id === targetId);
    next.splice(at, 0, blocks.find((b) => b.id === from)!);
    setBlocks(next);
    structural(() => reorderFormBlocks({ formId: form.id, blockIds: next.map((b) => b.id) }));
  }

  const url = origin ? `${origin}/f/${form.token}` : `/f/${form.token}`;
  const current = blocks.find((b) => b.id === selected) ?? null;
  let questionNumber = 0;

  const statusButton = (value: Status, labelText: string, tone: string) => (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        structural(() => setFormStatus({ formId: form.id, status: value }), () =>
          toast.success(value === "OPEN" ? "Formulario abierto: ya se puede responder." : value === "CLOSED" ? "Formulario cerrado." : "Volvió a borrador.")
        )
      }
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${form.status === value ? tone : "text-muted-foreground hover:bg-secondary"}`}
    >
      {labelText}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Encabezado: título, estado, enlace y accesos. */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim() && title !== form.title) structural(() => updateForm({ formId: form.id, title }));
            }}
            className="min-w-[14rem] flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-xl font-semibold outline-none hover:border-border focus:border-primary/60"
            aria-label="Título del formulario"
          />
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {saving === "saving" ? "Guardando…" : saving === "saved" ? "Guardado" : ""}
          </span>
          <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Estado">
            {statusButton("DRAFT", "Borrador", "bg-amber-100 text-amber-900")}
            {statusButton("OPEN", "Abierto", "bg-emerald-600 text-white")}
            {statusButton("CLOSED", "Cerrado", "bg-slate-600 text-white")}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Enlace</span>
            <code className="min-w-0 flex-1 truncate text-sm">{url}</code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success("Enlace copiado.");
                } catch {
                  toast.error("No se pudo copiar.");
                }
              }}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar
            </button>
          </div>
          <Link href={`/f/${form.token}?previa=1`} target="_blank" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary">
            <Eye className="h-4 w-4" /> Vista previa
          </Link>
          <Link href={`/admin/forms/${form.id}/respuestas`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary">
            <MessageSquareText className="h-4 w-4" /> {responseCount} respuesta{responseCount === 1 ? "" : "s"}
          </Link>
          <button
            type="button"
            title="Generar un enlace nuevo (el actual deja de funcionar)"
            onClick={async () => {
              const ok = await confirmDialog({ message: "¿Generar un enlace nuevo? El actual deja de funcionar para quien ya lo tenga.", confirmLabel: "Generar enlace nuevo", tone: "danger" });
              if (ok) structural(() => regenerateFormToken({ formId: form.id }), () => toast.success("Enlace nuevo generado."));
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
          >
            <RefreshCw className="h-4 w-4" /> Nuevo enlace
          </button>
        </div>
        {form.status !== "OPEN" ? (
          <p className="mt-2 text-xs text-amber-700">
            {form.status === "DRAFT" ? "Está en borrador: el enlace muestra «todavía no está abierto». Pasalo a Abierto para recibir respuestas." : "Está cerrado: el enlace ya no recibe respuestas."}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3 text-sm">
          <label className="flex items-center gap-2">
            Fondo
            <select value={settings.theme ?? "light"} onChange={(e) => patchSettings({ theme: e.target.value as NonNullable<FormSettings["theme"]> })} className="h-9 rounded-md border border-border bg-white px-2">
              <option value="white">Blanco liso</option>
              <option value="light">Blanco con degradé azul</option>
              <option value="gray">Gris claro</option>
              <option value="dark">Oscuro (azul Soundtec)</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Botones y detalles
            <select
              value={settings.accent ?? "blue"}
              disabled={settings.theme === "dark"}
              title={settings.theme === "dark" ? "Con fondo oscuro los botones van en blanco" : undefined}
              onChange={(e) => patchSettings({ accent: e.target.value as NonNullable<FormSettings["accent"]> })}
              className="h-9 rounded-md border border-border bg-white px-2 disabled:opacity-50"
            >
              <option value="blue">Azul Soundtec</option>
              <option value="black">Negro</option>
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={Boolean(settings.particles)} onChange={(e) => patchSettings({ particles: e.target.checked })} className="h-4 w-4 accent-primary" />
            Partículas sutiles
          </label>
          <label className="flex items-center gap-2">
            Cierra solo el
            <input
              type="datetime-local"
              defaultValue={form.closesAt ? form.closesAt.slice(0, 16) : ""}
              onBlur={(e) => {
                const v = e.target.value;
                structural(() => updateForm({ formId: form.id, closesAt: v ? new Date(v).toISOString() : null }));
              }}
              className="h-9 rounded-md border border-border bg-white px-2"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        {/* Lista de pantallas */}
        <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
          <ScreenItem active={selected === "welcome"} onClick={() => setSelected("welcome")} icon={Sparkles} label="Bienvenida" sub={settings.welcomeTitle || "Pantalla de inicio"} />
          <ol className="space-y-1.5">
            {blocks.map((b, i) => {
              const Icon = ICONS[b.type];
              const n = isQuestionType(b.type) ? ++questionNumber : null;
              const joined = i > 0 && Boolean(b.config.groupWithPrevious);
              return (
                <li
                  key={b.id}
                  draggable
                  onDragStart={() => (dragId.current = b.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOn(b.id)}
                  className={`group flex items-center gap-2 rounded-lg border px-2 py-2 transition ${joined ? "-mt-1 ml-4 border-l-4 border-l-primary/40" : ""} ${selected === b.id ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/30"}`}
                >
                  <button type="button" onClick={() => setSelected(b.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${isQuestionType(b.type) ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-800"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {n != null ? `${n}. ` : ""}
                        {b.title || BLOCK_LABELS[b.type].label}
                        {b.required ? <span className="text-primary"> *</span> : null}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {BLOCK_LABELS[b.type].label}
                        {joined ? " · misma pantalla" : ""}
                      </span>
                    </span>
                  </button>
                  <span className="flex shrink-0 flex-col opacity-60 group-hover:opacity-100">
                    <button type="button" disabled={i === 0 || pending} onClick={() => moveBlock(b.id, -1)} className="rounded p-0.5 hover:bg-secondary disabled:opacity-30" aria-label="Subir">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" disabled={i === blocks.length - 1 || pending} onClick={() => moveBlock(b.id, 1)} className="rounded p-0.5 hover:bg-secondary disabled:opacity-30" aria-label="Bajar">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="relative">
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/30 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/5"
            >
              <Plus className="h-4 w-4" /> Agregar pregunta o contenido
            </button>
            {addOpen ? (
              <div className="absolute left-0 right-0 z-20 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-xl">
                {(["Preguntas", "Opciones", "Contenido"] as const).map((group) => (
                  <div key={group} className="mb-1">
                    <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                    {[...QUESTION_TYPES, ...CONTENT_TYPES]
                      .filter((t) => BLOCK_LABELS[t].group === group)
                      .map((t) => {
                        const Icon = ICONS[t];
                        return (
                          <button key={t} type="button" onClick={() => addBlock(t)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-secondary">
                            <Icon className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">{BLOCK_LABELS[t].label}</span>
                            <span className="ml-auto truncate text-[11px] text-muted-foreground">{BLOCK_LABELS[t].hint}</span>
                          </button>
                        );
                      })}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <ScreenItem active={selected === "end"} onClick={() => setSelected("end")} icon={Flag} label="Cierre" sub={settings.endTitle || "Pantalla final"} />
        </aside>

        {/* Editor de la pantalla elegida */}
        <section className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-sm">
          {selected === "welcome" ? (
            <div className="space-y-6">
            <div className="rounded-lg border border-border bg-secondary/20 p-4">
              <MediaField
                formId={form.id}
                label="Logo del formulario (opcional)"
                value={settings.logoUrl ?? ""}
                onChange={(url) => patchSettings({ logoUrl: url })}
                hint="Reemplaza al logo de Soundtec arriba en todas las pantallas y sale grande y centrado en la bienvenida. Si ya incluye el título del evento, podés dejar el título vacío. Con fondo oscuro va sobre un recuadro blanco."
              />
            </div>
            <SettingsScreen
              formId={form.id}
              heading="Pantalla de bienvenida"
              hint="Es lo primero que se ve al abrir el enlace. Si la dejás vacía, el formulario arranca directo en la primera pregunta."
              title={settings.welcomeTitle ?? ""}
              body={settings.welcomeBody ?? ""}
              imageUrl={settings.welcomeImageUrl ?? ""}
              button={settings.welcomeButton ?? ""}
              onChange={(p) => patchSettings({ welcomeTitle: p.title, welcomeBody: p.body, welcomeImageUrl: p.imageUrl, welcomeButton: p.button })}
            />
            </div>
          ) : selected === "end" ? (
            <SettingsScreen
              formId={form.id}
              heading="Pantalla de cierre"
              hint="Se muestra cuando la persona envía sus respuestas."
              title={settings.endTitle ?? ""}
              body={settings.endBody ?? ""}
              imageUrl={settings.endImageUrl ?? ""}
              onChange={(p) => patchSettings({ endTitle: p.title, endBody: p.body, endImageUrl: p.imageUrl })}
            />
          ) : current ? (
            <>
              <BlockEditor formId={form.id} block={current} brands={brands} canGroup={blocks[0]?.id !== current.id} onPatch={(patch) => patchBlock(current.id, patch)} />
              <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
                <button type="button" disabled={pending} onClick={() => structural(() => duplicateFormBlock({ blockId: current.id }), (r) => setSelected(String(r.blockId)))} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary">
                  <CopyPlus className="h-4 w-4" /> Duplicar
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={async () => {
                    const ok = await confirmDialog({ message: "¿Quitar este bloque? Las respuestas ya recibidas no se pierden.", confirmLabel: "Quitar", tone: "danger" });
                    if (!ok) return;
                    const i = blocks.findIndex((b) => b.id === current.id);
                    structural(() => deleteFormBlock({ blockId: current.id }), () => setSelected(blocks[i + 1]?.id ?? blocks[i - 1]?.id ?? "welcome"));
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" /> Quitar
                </button>
                <Link href={`/f/${form.token}?previa=1`} target="_blank" className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary">
                  Ver cómo queda <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Elegí una pantalla de la izquierda o agregá una pregunta.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function ScreenItem({ active, onClick, icon: Icon, label, sub }: { active: boolean; onClick: () => void; icon: typeof Type; label: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition ${active ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-secondary/30 hover:border-primary/30"}`}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#1e3553] text-white">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>
      </span>
    </button>
  );
}

function SettingsScreen({
  formId,
  heading,
  hint,
  title,
  body,
  imageUrl,
  button,
  onChange,
}: {
  formId: string;
  heading: string;
  hint: string;
  title: string;
  body: string;
  imageUrl: string;
  button?: string;
  onChange: (patch: { title: string; body: string; imageUrl: string; button?: string }) => void;
}) {
  const state = { title, body, imageUrl, button };
  const set = (patch: Partial<typeof state>) => onChange({ ...state, ...patch } as { title: string; body: string; imageUrl: string; button?: string });
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{heading}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">Título</label>
        <input value={title} onChange={(e) => set({ title: e.target.value })} className="h-12 w-full rounded-md border border-border bg-white px-3 text-base font-semibold outline-none focus:border-primary/60" />
      </div>
      <div>
        <span className="mb-1.5 block text-sm font-medium">Texto</span>
        <FormRichEditor key={heading} value={body} onChange={(html) => set({ body: html })} placeholder="Contá de qué se trata, la fecha, el lugar…" />
      </div>
      <MediaField formId={formId} label="Imagen (opcional)" value={imageUrl} onChange={(url) => set({ imageUrl: url })} hint="Se ve al costado del texto en pantallas grandes." />
      {button !== undefined ? (
        <div className="max-w-xs">
          <label className="mb-1.5 block text-sm font-medium">Texto del botón</label>
          <input value={button} onChange={(e) => set({ button: e.target.value })} placeholder="Comenzar" className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary/60" />
        </div>
      ) : null}
    </div>
  );
}
