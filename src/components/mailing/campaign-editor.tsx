"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { CalendarClock, Heading1, Image as ImageIcon, Loader2, Minus, MousePointerClick, Package, Save, Send, Type, Users } from "lucide-react";
import { toast } from "sonner";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BlockCard } from "@/components/mailing/block-editors";
import { EmailPreview } from "@/components/mailing/email-preview";
import { AudiencePanel, type ListOption } from "@/components/mailing/audience-panel";
import { SendDialog } from "@/components/mailing/send-dialog";
import { newBlock, type MailBlock, type MailBlockType } from "@/lib/mailing/blocks";
import type { CampaignAudience } from "@/lib/mailing/audience";
import type { CampaignFooter } from "@/lib/mailing/template";
import { variableKey, type MailContact } from "@/lib/mailing/variables";
import type { TemplateWarning } from "@/lib/mailing/html-template";
import { cn } from "@/lib/utils";
import { CampaignHtmlContent } from "@/components/mailing/campaign-html-content";
import { saveCampaign, sendCampaignTest, unscheduleCampaign } from "@/server/actions/mailing";

export type EditorCampaign = {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  blocks: MailBlock[];
  audience: CampaignAudience;
  status: string;
  scheduledAt: string | null;
  contentMode: "BLOCKS" | "HTML";
  customHtml: string | null;
  templateId: string | null;
};

const ADD_BLOCKS: Array<{ type: MailBlockType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { type: "heading", label: "Título", icon: Heading1 },
  { type: "text", label: "Texto", icon: Type },
  { type: "products", label: "Productos", icon: Package },
  { type: "image", label: "Imagen", icon: ImageIcon },
  { type: "button", label: "Botón", icon: MousePointerClick },
  { type: "divider", label: "Separador", icon: Minus },
];

const SAMPLE: MailContact = { email: "martin@ejemplo.com", name: "Martín Pereyra", company: "Estudio Acústico Sur" };

export function CampaignEditor({
  campaign,
  lists,
  footer,
  simulate,
  dailyLimit,
  defaultTestEmail,
  templates,
}: {
  campaign: EditorCampaign;
  lists: ListOption[];
  footer: CampaignFooter;
  simulate: boolean;
  dailyLimit: number;
  defaultTestEmail: string;
  templates: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [name, setName] = useState(campaign.name);
  const [subject, setSubject] = useState(campaign.subject);
  const [preheader, setPreheader] = useState(campaign.preheader);
  const [blocks, setBlocks] = useState<MailBlock[]>(campaign.blocks);
  const [audience, setAudience] = useState<CampaignAudience>(campaign.audience);
  const [sample, setSample] = useState<MailContact>(SAMPLE);
  const [testTo, setTestTo] = useState(defaultTestEmail);
  const [sendOpen, setSendOpen] = useState(false);
  const [busy, start] = useTransition();
  const [mode, setMode] = useState<"BLOCKS" | "HTML">(campaign.contentMode);
  const [customHtml, setCustomHtml] = useState(campaign.customHtml ?? "");
  const [htmlWarnings, setHtmlWarnings] = useState<TemplateWarning[] | null>(null);
  const [savedAt, setSavedAt] = useState<string>(
    JSON.stringify({ name: campaign.name, subject: campaign.subject, preheader: campaign.preheader, blocks: campaign.blocks, audience: campaign.audience, mode: campaign.contentMode, customHtml: campaign.customHtml ?? "" })
  );

  const snapshot = JSON.stringify({ name, subject, preheader, blocks, audience, mode, customHtml });
  const dirty = snapshot !== savedAt;

  // Aviso al salir (pestaña, enlaces, atrás) mientras la campaña tenga cambios sin guardar.
  useUnsavedChangesGuard(dirty);

  const extraVariables = useMemo(() => [...new Set(lists.filter((l) => audience.include.includes(l.id)).flatMap((l) => l.extraFields))], [lists, audience.include]);

  async function save(silent = false): Promise<boolean> {
    const result = await saveCampaign({ id: campaign.id, name, subject, preheader, blocks, audience, contentMode: mode, ...(mode === "HTML" ? { customHtml } : {}) });
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    if (result.html !== undefined) {
      setCustomHtml(result.html);
      setHtmlWarnings(result.warnings ?? []);
    }
    setSavedAt(JSON.stringify({ name, subject, preheader, blocks, audience, mode, customHtml: result.html ?? customHtml }));
    if (!silent) toast.success("Campaña guardada.");
    return true;
  }

  const updateBlock = (index: number, block: MailBlock) => setBlocks((current) => current.map((b, i) => (i === index ? block : b)));
  const moveBlock = (index: number, delta: -1 | 1) =>
    setBlocks((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  function sendTest() {
    start(async () => {
      if (!(await save(true))) return;
      const result = await sendCampaignTest({ id: campaign.id, to: testTo });
      if (!result.ok) return void toast.error(result.error);
      toast.success(result.simulated ? `Modo prueba: no salió nada (se hubiera mandado a ${testTo}).` : `Prueba enviada a ${testTo}. Revisá también la carpeta de spam.`);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <Link href="/admin/mailing" className="text-sm text-muted-foreground hover:text-foreground">
            ← Campañas
          </Link>
          <input
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            className="block w-full rounded-md border border-transparent bg-transparent px-1 text-2xl font-semibold tracking-tight outline-none hover:border-border focus:border-primary/50"
            aria-label="Nombre de la campaña (interno)"
          />
          <p className="px-1 text-xs text-muted-foreground">
            Nombre interno: los destinatarios no lo ven.
            {campaign.status === "SCHEDULED" && campaign.scheduledAt ? (
              <>
                {" "}
                <Badge tone="primary" className="ml-1">
                  <CalendarClock className="h-3 w-3" /> Programada para el {new Date(campaign.scheduledAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}
                </Badge>{" "}
                <button
                  type="button"
                  className="font-semibold text-primary underline"
                  onClick={() =>
                    start(async () => {
                      await unscheduleCampaign({ id: campaign.id });
                      toast.success("Volvió a borrador: no sale hasta que la mandes.");
                      router.refresh();
                    })
                  }
                >
                  Desprogramar
                </button>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={busy || !dirty} onClick={() => start(async () => void (await save()))}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {dirty ? "Guardar" : "Guardado"}
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              start(async () => {
                if (await save(true)) setSendOpen(true);
              })
            }
          >
            <Send className="h-4 w-4" /> Enviar…
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="space-y-1.5">
              <Label required>Asunto</Label>
              <Input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} placeholder="Ej.: {{nombre}}, ingresaron los Crestron DM NVX que esperabas" />
              <p className="text-xs text-muted-foreground">{subject.length}/200 · conviene menos de 60 caracteres: en el celular se corta.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Texto de vista previa</Label>
              <Input value={preheader} maxLength={200} onChange={(e) => setPreheader(e.target.value)} placeholder="Lo que se lee al lado del asunto en la bandeja: Stock disponible y entrega inmediata" />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Contenido</h2>
              <div role="tablist" aria-label="Cómo se arma el mail" className="inline-flex rounded-lg border border-border p-0.5 text-sm">
                {(
                  [
                    { key: "BLOCKS", label: "Armar con bloques" },
                    { key: "HTML", label: "HTML propio" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="tab"
                    aria-selected={mode === option.key}
                    onClick={() => setMode(option.key)}
                    className={cn("rounded-md px-3 py-1.5 font-medium", mode === option.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {mode === "HTML" ? (
              <CampaignHtmlContent
                campaignId={campaign.id}
                html={customHtml}
                onHtml={setCustomHtml}
                warnings={htmlWarnings}
                onImported={(html, warnings) => {
                  setCustomHtml(html);
                  setHtmlWarnings(warnings);
                }}
                templates={templates}
              />
            ) : (
              <>
            {blocks.map((block, index) => (
              <BlockCard
                key={block.id}
                block={block}
                index={index}
                count={blocks.length}
                onChange={(b) => updateBlock(index, b)}
                onMove={(delta) => moveBlock(index, delta)}
                onRemove={() => setBlocks((current) => current.filter((_, i) => i !== index))}
              />
            ))}
            <div className="flex flex-wrap gap-2 rounded-xl border border-dashed border-border p-3">
              <span className="self-center pr-1 text-xs font-medium text-muted-foreground">Agregar:</span>
              {ADD_BLOCKS.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setBlocks((current) => [...current, newBlock(type)])}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:border-primary/40 hover:bg-secondary"
                >
                  <Icon className="h-4 w-4 text-primary" /> {label}
                </button>
              ))}
            </div>
              </>
            )}
            {extraVariables.length ? (
              <p className="text-xs text-muted-foreground">
                Variables de las listas elegidas: {extraVariables.map((v) => `{{${variableKey(v)}}}`).join(" · ")}
              </p>
            ) : null}
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold">
              <Users className="h-4 w-4 text-primary" /> A quién le llega
            </h2>
            <AudiencePanel lists={lists} audience={audience} onChange={setAudience} onSample={(contact) => setSample(contact)} />
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-semibold">Mandar una prueba</h2>
            <p className="text-sm text-muted-foreground">Llega con «[Prueba]» en el asunto. Mirala en el celular y en la computadora antes de mandarla a todos.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="tu-mail@soundtec.com.ar" aria-label="Mail para la prueba" />
              <Button variant="outline" className="shrink-0 whitespace-nowrap" disabled={busy || !testTo.trim()} onClick={sendTest}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Mandar prueba
              </Button>
            </div>
          </section>
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <EmailPreview subject={subject} preheader={preheader} blocks={blocks} footer={footer} contact={sample} customHtml={mode === "HTML" ? customHtml : null} />
        </div>
      </div>

      <SendDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        campaignId={campaign.id}
        audience={audience}
        subject={subject}
        simulate={simulate}
        dailyLimit={dailyLimit}
        onStarted={() => router.refresh()}
      />
    </div>
  );
}
