"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pencil, Sparkles, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuoteBody } from "@/components/quotes/quote-body";
import { RichTextEditor } from "@/components/quotes/rich-text-editor";
import { AiRewriteBox } from "@/components/quotes/ai-rewrite-box";
import { saveQuoteImagePlacement, saveQuoteTemplateBlock } from "@/server/actions/quotes";
import { reviseQuoteTemplateBlock } from "@/server/actions/quote-ai";
import { toEditorHtml } from "@/lib/quote-richtext";
import { formatUsd } from "@/lib/utils";

export type TemplateModule = {
  key: string;
  kind: "fixed" | "ai" | "table";
  title: string;
  description: string;
  blockId: string | null;
  body: string;
};

type Placement = { width: number; align: "left" | "center" | "right" };

export type TemplateIdentity = {
  name: string;
  primary: string;
  logoUrl: string;
  headerUrl: string;
  brandsUrl: string;
  isoUrl: string;
  brands: Placement;
  iso: Placement;
};

const SAMPLE_ITEMS = [
  { qty: 4, unit: "u", detail: "Parlante de embutir 6,5″ con transformador de línea 70/100 V", unit_price: 182 },
  { qty: 1, unit: "u", detail: "Amplificador de línea 240 W con entrada auxiliar y control de zona", unit_price: 940 },
  { qty: 1, unit: "gl", detail: "Instalación, cableado, puesta en marcha y capacitación al personal", unit_price: 610 },
];

function TemplateReviseBox({
  blockId,
  onRewritten,
}: {
  blockId: string;
  onRewritten: (body: string) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mt-[3mm] print:hidden">
      <AiRewriteBox
        pending={pending}
        message={message}
        warning="Cambia la plantilla maestra. Las cotizaciones ya creadas no se tocan."
        placeholder="Hacelo más largo, más claro, más institucional… esto actualiza el texto de todas las COT nuevas."
        onApply={(instruction) => {
          start(async () => {
            const result = await reviseQuoteTemplateBlock({ blockId, instruction });
            setMessage(result.error || result.message || "Listo");
            if (result.ok && result.body) onRewritten(result.body);
          });
        }}
      />
    </div>
  );
}

/** Envoltorio que marca dónde empieza y termina cada módulo mientras se edita. */
function ModuleShell({
  label,
  hint,
  editable,
  editing,
  onEdit,
  footer,
  children,
}: {
  label: string;
  hint: string;
  editable: boolean;
  editing: boolean;
  onEdit: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`group relative mt-[7mm] rounded-[2px] transition-colors ${
        editing ? "outline outline-2 outline-offset-[6px] outline-primary/60" : "hover:bg-primary/[0.03]"
      }`}
    >
      <div
        className={`pointer-events-none absolute -top-[5mm] left-0 z-10 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] transition-opacity ${
          editing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <span className="rounded-sm bg-primary px-1.5 py-0.5 text-primary-foreground">{label}</span>
        <span className="rounded-sm bg-muted px-1.5 py-0.5 normal-case tracking-normal text-muted-foreground">
          {hint}
        </span>
      </div>

      {editable && !editing ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar ${label}`}
          className="absolute -right-[9mm] top-0 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-white text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {children}
      {footer}
    </section>
  );
}

function SectionTitle({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <h2
      className="mb-[2.5mm] border-b pb-[1mm] text-[11pt] font-bold uppercase tracking-[0.08em]"
      style={{ color, borderColor: color }}
    >
      {children} <span className="font-normal">–</span>
    </h2>
  );
}

function PlacedImage({ src, alt, placement }: { src: string; alt: string; placement: Placement }) {
  const margin =
    placement.align === "center" ? "0 auto" : placement.align === "right" ? "0 0 0 auto" : "0 auto 0 0";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="mt-[3mm] block" style={{ width: `${placement.width}%`, margin }} />
  );
}

function ImageControls({
  target,
  placement,
  onChange,
}: {
  target: "brands" | "iso";
  placement: Placement;
  onChange: (next: Placement) => void;
}) {
  const [pending, start] = useTransition();

  function persist(next: Placement) {
    onChange(next);
    start(async () => {
      await saveQuoteImagePlacement({ target, width: next.width, align: next.align });
    });
  }

  return (
    <div className="mt-[3mm] flex flex-wrap items-center gap-3 rounded-md border border-dashed border-primary/40 bg-primary/[0.04] px-3 py-2 text-[11px] text-muted-foreground print:hidden">
      <span className="font-semibold uppercase tracking-wide">Imagen</span>
      <label className="flex items-center gap-2">
        Ancho
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={placement.width}
          onChange={(event) => persist({ ...placement, width: Number(event.target.value) })}
          className="h-1 w-32 cursor-pointer"
        />
        <span className="w-9 tabular-nums">{placement.width}%</span>
      </label>
      <span className="flex items-center gap-1">
        {(["left", "center", "right"] as const).map((align) => (
          <button
            key={align}
            type="button"
            onClick={() => persist({ ...placement, align })}
            className={`rounded px-2 py-0.5 capitalize transition-colors ${
              placement.align === align ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            {align === "left" ? "Izquierda" : align === "center" ? "Centro" : "Derecha"}
          </button>
        ))}
      </span>
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
    </div>
  );
}

function SampleTable({ color }: { color: string }) {
  const total = SAMPLE_ITEMS.reduce((sum, item) => sum + item.qty * item.unit_price, 0);
  return (
    <table className="w-full table-fixed border-collapse text-[9pt]">
      <colgroup>
        <col style={{ width: "8mm" }} />
        <col style={{ width: "12mm" }} />
        <col style={{ width: "9mm" }} />
        <col />
        <col style={{ width: "21mm" }} />
        <col style={{ width: "23mm" }} />
      </colgroup>
      <thead>
        <tr style={{ background: color, color: "#fff" }}>
          <th className="px-[2mm] py-[1.6mm] text-right font-semibold">#</th>
          <th className="px-[2mm] py-[1.6mm] text-right font-semibold">Cant.</th>
          <th className="px-[2mm] py-[1.6mm] text-left font-semibold">U</th>
          <th className="px-[2mm] py-[1.6mm] text-left font-semibold">Detalle</th>
          <th className="px-[2mm] py-[1.6mm] text-right font-semibold">Unit.</th>
          <th className="px-[2mm] py-[1.6mm] text-right font-semibold">Total</th>
        </tr>
      </thead>
      <tbody>
        {SAMPLE_ITEMS.map((item, index) => (
          <tr key={item.detail} style={{ background: index % 2 ? "#f3f5f8" : "#fff" }}>
            <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] text-right tabular-nums text-neutral-500">
              {index + 1}
            </td>
            <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] text-right tabular-nums">{item.qty}</td>
            <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm]">{item.unit}</td>
            <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] leading-[1.35]">{item.detail}</td>
            <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] text-right tabular-nums">
              {formatUsd(item.unit_price)}
            </td>
            <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] text-right font-semibold tabular-nums">
              {formatUsd(item.qty * item.unit_price)}
            </td>
          </tr>
        ))}
        <tr style={{ background: color, color: "#fff" }}>
          <td className="px-[2mm] py-[2mm] text-right font-bold uppercase tracking-[0.08em]" colSpan={5}>
            Total
          </td>
          <td className="px-[2mm] py-[2mm] text-right text-[10.5pt] font-bold tabular-nums">{formatUsd(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function QuoteTemplateEditor({
  modules,
  identity,
}: {
  modules: TemplateModule[];
  identity: TemplateIdentity;
}) {
  const color = identity.primary;
  const [bodies, setBodies] = useState(() => Object.fromEntries(modules.map((m) => [m.key, m.body])));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [brands, setBrands] = useState(identity.brands);
  const [iso, setIso] = useState(identity.iso);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function beginEdit(mod: TemplateModule) {
    setError(null);
    setEditingKey(mod.key);
    setDraft(toEditorHtml(bodies[mod.key] ?? ""));
  }

  function save(mod: TemplateModule) {
    if (!mod.blockId) return;
    const body = draft;
    start(async () => {
      const result = await saveQuoteTemplateBlock({ blockId: mod.blockId as string, body });
      if (!result.ok) {
        setError(result.error || "No se pudo guardar el módulo.");
        return;
      }
      setBodies((prev) => ({ ...prev, [mod.key]: body }));
      setEditingKey(null);
    });
  }

  function applyRewritten(mod: TemplateModule, body: string) {
    setBodies((prev) => ({ ...prev, [mod.key]: body }));
    if (editingKey === mod.key) setDraft(toEditorHtml(body));
  }

  function reviseFooter(mod: TemplateModule) {
    if (!mod.blockId) return null;
    return (
      <TemplateReviseBox
        blockId={mod.blockId}
        onRewritten={(body) => applyRewritten(mod, body)}
      />
    );
  }

  function renderBody(mod: TemplateModule) {
    const body = bodies[mod.key] ?? "";
    if (editingKey === mod.key) {
      return (
        <div className="print:hidden">
          <RichTextEditor value={draft} onChange={setDraft} ariaLabel={`Texto de ${mod.title}`} />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={() => save(mod)} disabled={pending}>
              {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
              Guardar módulo
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditingKey(null)} disabled={pending}>
              <X className="mr-1 h-3.5 w-3.5" />
              Cancelar
            </Button>
            <span className="text-[11px] text-muted-foreground">Afecta a las cotizaciones nuevas.</span>
          </div>
        </div>
      );
    }
    return <QuoteBody body={body} />;
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto bg-neutral-300/40 p-6">
        <table className="quote-doc">
          <thead className="quote-doc__header">
            <tr>
              <td>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={identity.logoUrl} alt={identity.name} className="quote-doc__band" />
              </td>
            </tr>
          </thead>
          <tfoot className="quote-doc__footer">
            <tr>
              <td>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={identity.headerUrl} alt="" className="quote-doc__band" />
              </td>
            </tr>
          </tfoot>
          <tbody>
            <tr>
              <td className="quote-doc__inner">
                <p className="text-right text-[10pt] text-neutral-700">Buenos Aires, 15 de agosto de 2026</p>

                <div className="mt-[6mm]">
                  <p className="font-semibold" style={{ color }}>
                    A
                  </p>
                  <p className="text-[12pt] font-bold uppercase">Cliente de ejemplo S.A.</p>
                  <p className="text-[10pt]">At.: Nombre del contacto</p>
                  <p className="mt-[3mm]">
                    <span className="font-semibold" style={{ color }}>
                      Ref:
                    </span>{" "}
                    Sistema de sonido ambiental — sala de reuniones
                  </p>
                  <p>
                    <span className="font-semibold" style={{ color }}>
                      Presupuesto:
                    </span>{" "}
                    <span className="font-bold tracking-wide" style={{ color }}>
                      COT14544
                    </span>
                  </p>
                </div>

                {modules.map((mod) => {
                  const editing = editingKey === mod.key;
                  const editable = mod.kind === "fixed" && Boolean(mod.blockId);

                  if (mod.kind === "table") {
                    return (
                      <ModuleShell
                        key={mod.key}
                        label={mod.title}
                        hint="Se arma con los equipos de cada cotización"
                        editable={false}
                        editing={false}
                        onEdit={() => {}}
                      >
                        <SectionTitle color={color}>Planilla de equipamiento y servicios</SectionTitle>
                        <SampleTable color={color} />
                        <p className="mt-[2mm] flex items-center gap-1.5 text-[11px] text-muted-foreground print:hidden">
                          <Table2 className="h-3 w-3" /> Datos de ejemplo. En cada cotización se completa con los
                          equipos reales.
                        </p>
                      </ModuleShell>
                    );
                  }

                  if (mod.kind === "ai") {
                    return (
                      <ModuleShell
                        key={mod.key}
                        label={mod.title}
                        hint="Lo redacta la IA en cada cotización"
                        editable={false}
                        editing={false}
                        onEdit={() => {}}
                      >
                        <SectionTitle color={color}>{mod.title}</SectionTitle>
                        <p className="flex items-start gap-1.5 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-[10pt] text-muted-foreground">
                          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {mod.description}
                        </p>
                      </ModuleShell>
                    );
                  }

                  if (mod.key === "letter_open" || mod.key === "closing") {
                    return (
                      <ModuleShell
                        key={mod.key}
                        label={mod.title}
                        hint="Texto fijo"
                        editable={editable}
                        editing={editing}
                        onEdit={() => beginEdit(mod)}
                        footer={reviseFooter(mod)}
                      >
                        {renderBody(mod)}
                      </ModuleShell>
                    );
                  }

                  if (mod.key === "disciplines") {
                    return (
                      <ModuleShell
                        key={mod.key}
                        label={mod.title}
                        hint="Franja de disciplinas"
                        editable={editable}
                        editing={editing}
                        onEdit={() => beginEdit(mod)}
                        footer={reviseFooter(mod)}
                      >
                        {editing ? (
                          renderBody(mod)
                        ) : (
                          <div
                            className="px-[4mm] py-[2.5mm] text-center text-[10pt] font-semibold uppercase tracking-[0.14em] text-white"
                            style={{ background: color }}
                          >
                            <QuoteBody body={bodies[mod.key] ?? ""} />
                          </div>
                        )}
                      </ModuleShell>
                    );
                  }

                  return (
                    <ModuleShell
                      key={mod.key}
                      label={mod.title}
                      hint="Texto fijo"
                      editable={editable}
                      editing={editing}
                      onEdit={() => beginEdit(mod)}
                      footer={reviseFooter(mod)}
                    >
                      <SectionTitle color={color}>{mod.title}</SectionTitle>
                      {renderBody(mod)}

                      {mod.key === "brands" ? (
                        <>
                          <PlacedImage src={identity.brandsUrl} alt="Marcas" placement={brands} />
                          <ImageControls target="brands" placement={brands} onChange={setBrands} />
                        </>
                      ) : null}

                      {mod.key === "iso" ? (
                        <>
                          <PlacedImage src={identity.isoUrl} alt="ISO 9001" placement={iso} />
                          <ImageControls target="iso" placement={iso} onChange={setIso} />
                        </>
                      ) : null}
                    </ModuleShell>
                  );
                })}

                <div className="mt-[9mm]">
                  <p className="font-semibold">Nombre de quien firma</p>
                  <p className="text-[10pt]">Cargo</p>
                  <p className="text-[10pt] font-semibold tracking-[0.35em]" style={{ color }}>
                    {identity.name} s.r.l.
                  </p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
