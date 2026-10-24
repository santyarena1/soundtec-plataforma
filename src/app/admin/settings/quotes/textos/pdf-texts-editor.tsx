"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { LiveRichText } from "@/components/quotes/live-rich-text";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { toEditorHtml } from "@/lib/quote-richtext";
import { describeVariantRule, pickTextVariant } from "@/lib/quote-text-variant-pick";
import { createTextVariant, deleteTextVariant, saveGeneralText, updateTextVariant } from "@/server/actions/quote-text-variants";
import { AiDraftPanel } from "./ai-draft-panel";
import { PROFILE_OPTIONS, VariantConditions, profileLabel } from "./variant-conditions";
import { TextPreview } from "./text-preview";

export type PdfTextVariant = { id: string; label: string; body: string; profiles: string[]; audiences: string[]; updatedAt: string };

export type PdfTextSection = {
  key: string;
  title: string;
  description: string;
  inProfiles: readonly string[];
  mode: "editable" | "ai" | "elsewhere";
  note: string | null;
  href: string | null;
  cta: string | null;
  generalBody: string;
  variants: PdfTextVariant[];
};

type Draft = { label: string; body: string; profiles: string[]; audiences: string[] };
const GENERAL = "general";
const NEW = "nueva";

function draftFor(section: PdfTextSection, tab: string): Draft {
  if (tab === GENERAL) return { label: "Texto general", body: section.generalBody, profiles: [], audiences: [] };
  const v = section.variants.find((x) => x.id === tab);
  if (v) return { label: v.label, body: v.body, profiles: v.profiles, audiences: v.audiences };
  return { label: "", body: section.generalBody, profiles: [], audiences: [] };
}

const sameDraft = (a: Draft, b: Draft) =>
  a.label === b.label && a.body === b.body && a.profiles.join() === b.profiles.join() && a.audiences.join() === b.audiences.join();

export function PdfTextsEditor({
  sections,
  audiences,
  primaryColor,
}: {
  sections: PdfTextSection[];
  audiences: { key: string; label: string }[];
  primaryColor: string;
}) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState(() => sections.find((s) => s.mode === "editable")?.key ?? sections[0]!.key);
  const [tab, setTab] = useState(GENERAL);
  const section = sections.find((s) => s.key === selectedKey) ?? sections[0]!;
  const saved = useMemo(() => draftFor(section, tab), [section, tab]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [editorKey, setEditorKey] = useState(0);
  // El editor normaliza el texto al cargarlo: solo cuenta lo que se escribe con el cursor adentro.
  const editing = useRef(false);
  const [pending, start] = useTransition();
  const [tryProfile, setTryProfile] = useState("tecnico");
  const [tryAudience, setTryAudience] = useState("");

  const dirty = section.mode === "editable" && !sameDraft(draft, saved);
  const audienceLabel = (k: string) => audiences.find((a) => a.key === k)?.label ?? k;

  async function go(nextKey: string, nextTab: string) {
    if (dirty && !(await confirmDialog({ title: "Cambios sin guardar", message: "Tenés cambios sin guardar en este texto. ¿Descartarlos?", confirmLabel: "Descartar", tone: "danger" }))) return;
    const nextSection = sections.find((s) => s.key === nextKey) ?? section;
    setSelectedKey(nextKey);
    setTab(nextTab);
    setDraft(draftFor(nextSection, nextTab));
    setEditorKey((k) => k + 1);
  }

  function save() {
    start(async () => {
      const result =
        tab === GENERAL
          ? await saveGeneralText({ blockKey: section.key, body: draft.body })
          : tab === NEW
            ? await createTextVariant({ blockKey: section.key, ...draft } as Parameters<typeof createTextVariant>[0])
            : await updateTextVariant({ id: tab, blockKey: section.key, ...draft } as Parameters<typeof updateTextVariant>[0]);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(tab === NEW ? "Versión creada. Sale sola en las cotizaciones nuevas que cumplan las condiciones." : "Guardado.");
      if (tab === NEW && "id" in result) setTab(String(result.id));
      router.refresh();
    });
  }

  async function remove() {
    if (!(await confirmDialog({ title: "Eliminar versión", message: `¿Eliminar «${draft.label}»? Las cotizaciones que ya la usan conservan su texto.`, confirmLabel: "Eliminar", tone: "danger" }))) return;
    start(async () => {
      const result = await deleteTextVariant(tab);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Versión eliminada.");
      setTab(GENERAL);
      setDraft(draftFor(section, GENERAL));
      setEditorKey((k) => k + 1);
      router.refresh();
    });
  }

  const tried = pickTextVariant(section.variants, { profileKey: tryProfile || null, audience: tryAudience || null });
  const overlaps =
    tab !== GENERAL && (draft.profiles.length || draft.audiences.length)
      ? section.variants.filter((v) => v.id !== tab && v.profiles.join() === draft.profiles.join() && v.audiences.join() === draft.audiences.join())
      : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] 2xl:grid-cols-[13rem_minmax(0,1fr)_24rem]">
      {/* Lista de textos, en el orden del PDF */}
      <nav aria-label="Textos del PDF" className="lg:sticky lg:top-16 lg:self-start">
        <Select className="lg:hidden" aria-label="Elegí un texto" value={selectedKey} onChange={(e) => void go(e.target.value, GENERAL)}>
          {sections.map((s) => (
            <option key={s.key} value={s.key}>
              {s.title}
            </option>
          ))}
        </Select>
        <ol className="hidden space-y-0.5 lg:block">
          {sections.map((s) => {
            const active = s.key === selectedKey;
            const meta =
              s.mode === "ai" ? "Lo escribe la IA" : s.mode === "elsewhere" ? "Se cambia en otro lado" : s.variants.length ? `General + ${s.variants.length} ${s.variants.length === 1 ? "versión" : "versiones"}` : "Solo general";
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => void go(s.key, GENERAL)}
                  aria-current={active ? "true" : undefined}
                  className={`w-full rounded-md px-3 py-2 text-left transition-colors ${active ? "bg-primary/10 text-primary" : "hover:bg-secondary"} ${s.mode === "editable" ? "" : "opacity-70"}`}
                >
                  <span className="block text-sm font-medium">{s.title}</span>
                  <span className="block text-xs text-muted-foreground">{meta}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Texto y versiones */}
      <section className="min-w-0 space-y-3" aria-labelledby="pdf-text-title">
        <div>
          <h2 id="pdf-text-title" className="text-lg font-semibold">{section.title}</h2>
          <p className="text-sm text-muted-foreground">{section.description}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {section.inProfiles.length
              ? `Sale en los presupuestos ${section.inProfiles.map(profileLabel).join(", ")}.`
              : "No sale por defecto: se suma a mano en cada cotización."}
          </p>
        </div>

        {section.mode !== "editable" ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm">
            <p>{section.note}</p>
            {section.href ? (
              <ButtonLink href={section.href} size="sm" variant="outline" className="mt-3">
                Ir a {section.cta}
              </ButtonLink>
            ) : null}
          </div>
        ) : (
          <>
            <div role="tablist" aria-label="Versiones" className="flex flex-wrap gap-1.5 border-b border-border pb-2">
              {[{ id: GENERAL, label: "Texto general" }, ...section.variants.map((v) => ({ id: v.id, label: v.label }))].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => void go(section.key, t.id)}
                  className={`rounded-md px-3 py-1.5 text-sm ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary/60 hover:bg-secondary"}`}
                >
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                role="tab"
                aria-selected={tab === NEW}
                onClick={() => void go(section.key, NEW)}
                className={`inline-flex items-center gap-1 rounded-md border border-dashed px-3 py-1.5 text-sm ${tab === NEW ? "border-primary text-primary" : "border-border hover:bg-secondary"}`}
              >
                <Plus className="h-3.5 w-3.5" /> Nueva versión
              </button>
            </div>

            {tab === GENERAL ? (
              <p className="text-sm text-muted-foreground">Sale cuando ninguna versión corresponde a la cotización.</p>
            ) : (
              <>
                <div>
                  <Label htmlFor="variant-label">Nombre de la versión</Label>
                  <Input
                    id="variant-label"
                    value={draft.label}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    placeholder="Ej. Hotelería, Corto para integradores"
                  />
                </div>
                <VariantConditions
                  profiles={draft.profiles}
                  audiences={draft.audiences}
                  audienceOptions={audiences}
                  onChange={(next) => setDraft({ ...draft, ...next })}
                />
                {overlaps.length ? (
                  <p className="text-xs text-warning">
                    «{overlaps[0]!.label}» tiene las mismas condiciones: sale la que se guardó último.
                  </p>
                ) : null}
                <AiDraftPanel
                  key={`${section.key}-${tab}`}
                  blockKey={section.key}
                  baseBody={section.generalBody}
                  audienceOptions={audiences}
                  initialAudience={draft.audiences[0] ?? ""}
                  initialProfile={draft.profiles[0] ?? ""}
                  onDraft={(body, picked) => {
                    const label = draft.label || [picked.audience && audienceLabel(picked.audience), picked.profile && profileLabel(picked.profile)].filter(Boolean).join(" · ");
                    setDraft({
                      label,
                      body,
                      audiences: draft.audiences.length || !picked.audience ? draft.audiences : [picked.audience],
                      profiles: draft.profiles.length || !picked.profile ? draft.profiles : [picked.profile],
                    });
                    setEditorKey((k) => k + 1);
                  }}
                />
              </>
            )}

            <div className="max-h-[30rem] overflow-y-auto rounded-lg border border-border bg-card">
              <LiveRichText
                key={`${section.key}-${tab}-${editorKey}`}
                variant="boxed"
                value={toEditorHtml(draft.body)}
                onChange={(html) => {
                  if (editing.current) setDraft((d) => ({ ...d, body: html }));
                }}
                onFocusChange={(focused) => {
                  editing.current = focused;
                }}
                ariaLabel={`Texto de «${section.title}»`}
              />
            </div>

            <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
              <Button type="button" onClick={save} disabled={pending || !dirty}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {tab === NEW ? "Crear versión" : "Guardar"}
              </Button>
              {dirty ? (
                <Button type="button" variant="ghost" onClick={() => { setDraft(saved); setEditorKey((k) => k + 1); }} disabled={pending}>
                  Descartar cambios
                </Button>
              ) : null}
              {tab !== GENERAL && tab !== NEW ? (
                <Button type="button" variant="ghost" className="ml-auto text-destructive" onClick={() => void remove()} disabled={pending}>
                  <Trash2 className="h-4 w-4" /> Eliminar versión
                </Button>
              ) : null}
              {dirty ? <span className="text-sm text-muted-foreground">Cambios sin guardar</span> : null}
            </div>
          </>
        )}
      </section>

      {/* Vista previa y prueba */}
      <aside className="space-y-3 lg:col-start-2 2xl:col-start-auto 2xl:sticky 2xl:top-16 2xl:self-start">
        {section.mode === "editable" ? <TextPreview title={section.title} body={draft.body} color={primaryColor} /> : null}
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <p className="text-sm font-medium">Probar: ¿qué sale en una cotización…?</p>
          <div className="grid grid-cols-2 gap-2">
            <Select aria-label="Tipo para probar" value={tryProfile} onChange={(e) => setTryProfile(e.target.value)}>
              {PROFILE_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </Select>
            <Select aria-label="Rubro para probar" value={tryAudience} onChange={(e) => setTryAudience(e.target.value)}>
              <option value="">Sin rubro</option>
              {audiences.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </Select>
          </div>
          {section.mode === "editable" ? (
            <p className="text-sm" data-testid="try-result">
              En «{section.title}» sale: <b>{tried ? tried.label : "Texto general"}</b>
              {tried ? <span className="block text-xs text-muted-foreground">Para {describeVariantRule(tried, { profile: profileLabel, audience: audienceLabel })}</span> : null}
            </p>
          ) : null}
          <Link
            href={`/admin/settings/quotes/plantilla?tipo=${tryProfile}${tryAudience ? `&rubro=${tryAudience}` : ""}`}
            target="_blank"
            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
          >
            Ver el PDF de ejemplo completo con esa combinación <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </aside>
    </div>
  );
}
