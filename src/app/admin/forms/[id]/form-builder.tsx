"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, Eye, Flag, Layers, Mail, MessageSquareText, Plus, RefreshCw, Sparkles } from "lucide-react";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { BLOCK_LABELS, isQuestionType, type BlockType, type FormSettings } from "@/lib/forms/types";
import {
  addFormBlock,
  addFormBlocks,
  deleteFormBlock,
  duplicateFormBlock,
  regenerateFormToken,
  reorderFormBlocks,
  setFormStatus,
  updateForm,
  updateFormBlock,
} from "@/server/actions/forms";
import { FormRichEditor } from "../form-rich-editor";
import type { BlockPatch, EditableBlock } from "./block-editor";
import { MediaField } from "./media-field";
import type { FormBrandOption } from "@/lib/forms/public";
import { CONTACT_PRESET, ICONS, flatten, toScreens, type Screen } from "./screens";
import { ScreenEditor } from "./screen-editor";
import { TypeMenu } from "./type-menu";
import { AgendaEditor, InfoEditor, MapLinkField } from "./event-editors";

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
  // Si solo volvió lo guardado mientras se escribe, se conserva lo local: si no, el
  // guardado automático pisaba las letras tipeadas después de mandarlo.
  useEffect(() => {
    setBlocks((prev) => {
      const same = prev.length === initialBlocks.length && prev.every((b, i) => b.id === initialBlocks[i].id && b.type === initialBlocks[i].type);
      return same ? prev : initialBlocks;
    });
  }, [initialBlocks]);

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

  function queueBlock(id: string, patch: BlockPatch) {
    pendingBlocks.current.set(id, { ...(pendingBlocks.current.get(id) ?? {}), ...patch });
    schedule();
  }

  function patchBlock(id: string, patch: BlockPatch) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch, config: patch.config ?? b.config } : b)));
    queueBlock(id, patch);
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

  const screens = toScreens(blocks);
  const currentScreen = screens.find((sc) => sc.blocks.some((b) => b.id === selected)) ?? null;
  const lastBlockId = (currentScreen ?? screens[screens.length - 1])?.blocks.at(-1)?.id ?? null;

  /**
   * Aplica una nueva estructura de pantallas: corrige la marca «misma pantalla» de
   * cada bloque según su lugar y guarda el orden (o corre otra acción en su lugar).
   */
  function restructure(next: EditableBlock[][], action?: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    const { ids, grouped } = flatten(next);
    const flat = next.flat().map((b) => {
      const want = grouped.get(b.id) ?? false;
      if (Boolean(b.config.groupWithPrevious) === want) return b;
      const config = { ...b.config, groupWithPrevious: want || undefined };
      queueBlock(b.id, { config });
      return { ...b, config };
    });
    setBlocks(flat);
    structural(action ?? (() => reorderFormBlocks({ formId: form.id, blockIds: ids })), after);
  }

  function addScreen(type: BlockType) {
    setAddOpen(false);
    structural(() => addFormBlock({ formId: form.id, type, afterBlockId: lastBlockId }), (r) => setSelected(String(r.blockId)));
  }

  function addContactScreen() {
    setAddOpen(false);
    structural(() => addFormBlocks({ formId: form.id, afterBlockId: lastBlockId, blocks: CONTACT_PRESET }), (r) => setSelected(String((r.blockIds as string[])[1])));
  }

  function addField(screen: Screen, type: BlockType) {
    structural(() => addFormBlock({ formId: form.id, type, afterBlockId: screen.blocks.at(-1)!.id, groupWithPrevious: true }), (r) => setSelected(String(r.blockId)));
  }

  function moveScreen(id: string, delta: -1 | 1) {
    const list = screens.map((sc) => sc.blocks);
    const i = screens.findIndex((sc) => sc.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    restructure(list);
  }

  function dropScreen(targetId: string) {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    const moving = screens.find((sc) => sc.id === from)!;
    const rest = screens.filter((sc) => sc.id !== from);
    const at = rest.findIndex((sc) => sc.id === targetId);
    rest.splice(at, 0, moving);
    restructure(rest.map((sc) => sc.blocks));
  }

  function moveField(screen: Screen, blockId: string, delta: -1 | 1) {
    const fields = [...screen.blocks];
    const i = fields.findIndex((b) => b.id === blockId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= fields.length) return;
    [fields[i], fields[j]] = [fields[j], fields[i]];
    restructure(screens.map((sc) => (sc.id === screen.id ? fields : sc.blocks)));
  }

  async function deleteField(screen: Screen, blockId: string) {
    const ok = await confirmDialog({ message: "¿Quitar este campo? Las respuestas ya recibidas no se pierden.", confirmLabel: "Quitar", tone: "danger" });
    if (!ok) return;
    const fields = screen.blocks.filter((b) => b.id !== blockId);
    const next = screens.map((sc) => (sc.id === screen.id ? fields : sc.blocks)).filter((list) => list.length);
    restructure(next, () => deleteFormBlock({ blockId }), () => setSelected(fields[0]?.id ?? "welcome"));
  }

  async function deleteScreen(screen: Screen) {
    const ok = await confirmDialog({
      message:
        screen.blocks.length > 1
          ? `¿Quitar la pantalla con sus ${screen.blocks.length} campos? Las respuestas ya recibidas no se pierden.`
          : "¿Quitar esta pantalla? Las respuestas ya recibidas no se pierden.",
      confirmLabel: "Quitar pantalla",
      tone: "danger",
    });
    if (!ok) return;
    const i = screens.findIndex((sc) => sc.id === screen.id);
    structural(
      async () => {
        for (const b of screen.blocks) {
          const r = await deleteFormBlock({ blockId: b.id });
          if (!r.ok) return r;
        }
        return { ok: true };
      },
      () => setSelected(screens[i + 1]?.id ?? screens[i - 1]?.id ?? "welcome")
    );
  }

  const url = origin ? `${origin}/f/${form.token}` : `/f/${form.token}`;

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
          <input autoComplete="off"
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
          <Link href={`/admin/forms/${form.id}/invitados`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary">
            <Mail className="h-4 w-4" /> Invitados por mail
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
            <input autoComplete="off" type="checkbox" checked={Boolean(settings.particles)} onChange={(e) => patchSettings({ particles: e.target.checked })} className="h-4 w-4 accent-primary" />
            Partículas sutiles
          </label>
          <label className="flex items-center gap-2">
            Cierra solo el
            <input autoComplete="off"
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
            {screens.map((sc, i) => (
              <ScreenRow
                key={sc.id}
                screen={sc}
                number={i + 1}
                active={currentScreen?.id === sc.id}
                pending={pending}
                first={i === 0}
                last={i === screens.length - 1}
                onSelect={() => setSelected(sc.blocks.find((b) => isQuestionType(b.type))?.id ?? sc.id)}
                onMove={(d) => moveScreen(sc.id, d)}
                onDragStart={() => (dragId.current = sc.id)}
                onDrop={() => dropScreen(sc.id)}
              />
            ))}
          </ol>
          <div className="relative">
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/30 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/5"
            >
              <Plus className="h-4 w-4" /> Nueva pantalla
            </button>
            {addOpen ? <TypeMenu mode="screen" onPick={addScreen} onContact={addContactScreen} onClose={() => setAddOpen(false)} /> : null}
          </div>
          <ScreenItem active={selected === "end"} onClick={() => setSelected("end")} icon={Flag} label="Confirmación" sub={settings.endTitle || "Al enviar y si vuelve a entrar"} />
        </aside>

        {/* Editor de la pantalla elegida */}
        <section className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-sm">
          {selected === "welcome" ? (
            <div className="space-y-6">
            <div className="rounded-lg border border-border bg-secondary/20 p-4">
              <MediaField
                formId={form.id}
                label="Logo del formulario (opcional)"
                value={settings.logoUrl || settings.welcomeImageUrl || ""}
                onChange={(url) => patchSettings({ logoUrl: url, welcomeImageUrl: "" })}
                hint="En la bienvenida sale grande al centro y el título queda arriba a la izquierda. Desde la primera pregunta el título se va y el logo pasa a esa esquina, en lugar del de Soundtec. Usá un PNG sin fondo."
              />
            </div>
            <SettingsScreen
              formId={form.id}
              heading="Pantalla de bienvenida"
              hint="Es lo primero que se ve al abrir el enlace. Si la dejás vacía, el formulario arranca directo en la primera pregunta."
              title={settings.welcomeTitle ?? ""}
              body={settings.welcomeBody ?? ""}
              button={settings.welcomeButton ?? ""}
              onChange={(p) => patchSettings({ welcomeTitle: p.title, welcomeBody: p.body, welcomeButton: p.button })}
            />
            </div>
          ) : selected === "end" ? (
            <div className="space-y-8">
              <SettingsScreen
                formId={form.id}
                heading="Pantalla de confirmación"
                hint="Se muestra al enviar y es lo que ve quien ya respondió cuando vuelve a abrir el enlace (aunque el formulario ya esté cerrado). Ideal para la info del evento."
                title={settings.endTitle ?? ""}
                body={settings.endBody ?? ""}
                imageUrl={settings.endImageUrl ?? ""}
                onChange={(p) => patchSettings({ endTitle: p.title, endBody: p.body, endImageUrl: p.imageUrl })}
              />
              <section className="space-y-3 border-t border-border pt-6">
                <div>
                  <h3 className="font-semibold">Información útil</h3>
                  <p className="text-sm text-muted-foreground">Dirección, fecha, horario, estacionamiento… Se muestra en dos columnas.</p>
                </div>
                <InfoEditor items={settings.endInfo ?? []} onChange={(endInfo) => patchSettings({ endInfo })} />
              </section>
              <section className="space-y-3 border-t border-border pt-6">
                <h3 className="font-semibold">Mapa y «Cómo llegar»</h3>
                <MapLinkField heading="Enlace de Google Maps o dirección (opcional)" value={settings.endMapQuery ?? ""} resolved={settings.endMapResolved} onChange={(endMapQuery) => patchSettings({ endMapQuery, endMapResolved: undefined })} />
              </section>
              <section className="space-y-3 border-t border-border pt-6">
                <div>
                  <h3 className="font-semibold">Programa del evento</h3>
                  <p className="text-sm text-muted-foreground">Los horarios de lo que va a pasar. Si lo querés mostrar también antes de enviar, sumá una pantalla «Programa».</p>
                </div>
                <AgendaEditor items={settings.endAgenda ?? []} onChange={(endAgenda) => patchSettings({ endAgenda })} />
              </section>
            </div>
          ) : currentScreen ? (
            <ScreenEditor
              key={currentScreen.id}
              formId={form.id}
              token={form.token}
              screen={currentScreen}
              number={screens.indexOf(currentScreen) + 1}
              selectedBlockId={selected}
              brands={brands}
              pending={pending}
              onSelectBlock={setSelected}
              onPatch={patchBlock}
              onAddField={(type) => addField(currentScreen, type)}
              onMoveField={(id, d) => moveField(currentScreen, id, d)}
              onDuplicate={(id) => structural(() => duplicateFormBlock({ blockId: id }), (r) => setSelected(String(r.blockId)))}
              onDeleteField={(id) => void deleteField(currentScreen, id)}
              onDeleteScreen={() => void deleteScreen(currentScreen)}
            />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{pending ? "Cargando…" : "Elegí una pantalla de la izquierda o agregá una nueva."}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function ScreenRow({
  screen,
  number,
  active,
  pending,
  first,
  last,
  onSelect,
  onMove,
  onDragStart,
  onDrop,
}: {
  screen: Screen;
  number: number;
  active: boolean;
  pending: boolean;
  first: boolean;
  last: boolean;
  onSelect: () => void;
  onMove: (delta: -1 | 1) => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const head = screen.blocks[0];
  const many = screen.blocks.length > 1;
  const Icon = many ? Layers : ICONS[head.type];
  const question = isQuestionType(head.type) || many;
  const fieldNames = screen.blocks
    .filter((b) => isQuestionType(b.type))
    .map((b) => b.title)
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={`group flex items-center gap-2 rounded-lg border px-2 py-2 transition ${active ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/30"}`}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${question ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-800"}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {number}. {head.title || BLOCK_LABELS[head.type].label}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">{many ? `${screen.blocks.length} campos · ${fieldNames}` : BLOCK_LABELS[head.type].label}</span>
        </span>
      </button>
      <span className="flex shrink-0 flex-col opacity-60 group-hover:opacity-100">
        <button type="button" disabled={first || pending} onClick={() => onMove(-1)} className="rounded p-0.5 hover:bg-secondary disabled:opacity-30" aria-label="Subir pantalla">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" disabled={last || pending} onClick={() => onMove(1)} className="rounded p-0.5 hover:bg-secondary disabled:opacity-30" aria-label="Bajar pantalla">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </span>
    </li>
  );
}

function ScreenItem({ active, onClick, icon: Icon, label, sub }: { active: boolean; onClick: () => void; icon: typeof Flag; label: string; sub: string }) {
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
  /** Sin imagen en la bienvenida: ahí la imagen es el logo del formulario. */
  imageUrl?: string;
  button?: string;
  onChange: (patch: { title: string; body: string; imageUrl?: string; button?: string }) => void;
}) {
  const state = { title, body, imageUrl, button };
  const set = (patch: Partial<typeof state>) => onChange({ ...state, ...patch } as { title: string; body: string; imageUrl?: string; button?: string });
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{heading}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">Título</label>
        <input autoComplete="off" value={title} onChange={(e) => set({ title: e.target.value })} className="h-12 w-full rounded-md border border-border bg-white px-3 text-base font-semibold outline-none focus:border-primary/60" />
      </div>
      <div>
        <span className="mb-1.5 block text-sm font-medium">Texto</span>
        <FormRichEditor key={heading} value={body} onChange={(html) => set({ body: html })} placeholder="Contá de qué se trata, la fecha, el lugar…" />
      </div>
      {imageUrl !== undefined ? <MediaField formId={formId} label="Imagen (opcional)" value={imageUrl} onChange={(url) => set({ imageUrl: url })} hint="Se ve al costado del texto en pantallas grandes." /> : null}
      {button !== undefined ? (
        <div className="max-w-xs">
          <label className="mb-1.5 block text-sm font-medium">Texto del botón</label>
          <input autoComplete="off" value={button} onChange={(e) => set({ button: e.target.value })} placeholder="Comenzar" className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary/60" />
        </div>
      ) : null}
    </div>
  );
}
