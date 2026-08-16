"use client";

import { useRef, useState, useTransition } from "react";
import { Sparkles, Table2 } from "lucide-react";
import { AiRewriteBox } from "@/components/quotes/ai-rewrite-box";
import { LiveRichText } from "@/components/quotes/live-rich-text";
import { ResizableQuoteImage } from "@/components/quotes/resizable-quote-image";
import { toEditorHtml } from "@/lib/quote-richtext";
import {
  DEFAULT_BRANDS_PLACEMENT,
  DEFAULT_ISO_PLACEMENT,
  resolveImagePlacement,
  type ImagePlacement,
} from "@/lib/quote-defaults";
import { formatUsd } from "@/lib/utils";
import { saveQuoteImagePlacement, saveQuoteSectionBody, saveQuoteTemplateBlock } from "@/server/actions/quotes";
import { reviseQuoteNode, reviseQuoteTemplateBlock } from "@/server/actions/quote-ai";

export type LiveModuleKind = "fixed" | "ai" | "table";

export type LiveModule = {
  key: string;
  kind: LiveModuleKind;
  title: string;
  description: string;
  body: string;
  persistId: string | null;
};

export type LiveIdentity = {
  name: string;
  primary: string;
  logoUrl: string;
  headerUrl: string;
  brandsUrl: string;
  isoUrl: string;
  brands?: ImagePlacement | null;
  iso?: ImagePlacement | null;
};

export type LiveHeader = {
  dateLabel: string;
  clientName: string;
  contactName?: string | null;
  reference: string;
  number: string;
};

export type LiveTableItem = {
  id: string;
  qty: number;
  unit: string;
  detail: string;
  unitPrice: number;
  lineTotal: number;
  ivaRate?: number;
  optional?: boolean;
  deliveryKey?: string;
  photoUrl?: string | null;
};

export type LiveTerms = {
  paymentTerms?: string | null;
  deliveryText?: string | null;
  validityDays?: number | null;
};

const SAMPLE_ITEMS: LiveTableItem[] = [
  {
    id: "s1",
    qty: 4,
    unit: "u",
    detail: "Parlante de embutir 6,5″ con transformador de línea 70/100 V",
    unitPrice: 182,
    lineTotal: 728,
  },
  {
    id: "s2",
    qty: 1,
    unit: "u",
    detail: "Amplificador de línea 240 W con entrada auxiliar y control de zona",
    unitPrice: 940,
    lineTotal: 940,
  },
  {
    id: "s3",
    qty: 1,
    unit: "gl",
    detail: "Instalación, cableado, puesta en marcha y capacitación al personal",
    unitPrice: 610,
    lineTotal: 610,
  },
];

function ModuleChrome({
  label,
  hint,
  focused,
  saving,
  children,
  footer,
}: {
  label: string;
  hint: string;
  focused?: boolean;
  saving?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className={`quote-doc__block quote-doc__live-module mt-[7mm] ${focused ? "quote-doc__live-module--focus" : ""}`}>
      <div className="quote-doc__live-chrome print:hidden">
        <span className="quote-doc__live-chip">{label}</span>
        <span className="quote-doc__live-hint">{hint}</span>
        {saving ? <span className="quote-doc__live-hint">Guardando…</span> : null}
      </div>
      <div className="quote-doc__live-body">{children}</div>
      {footer ? <div className="quote-doc__live-footer print:hidden">{footer}</div> : null}
    </section>
  );
}

function SectionTitle({
  value,
  color,
  editable,
  onSave,
}: {
  value: string;
  color: string;
  editable: boolean;
  onSave?: (title: string) => void;
}) {
  return (
    <h2
      className="mb-[2.5mm] border-b pb-[1mm] text-[11pt] font-bold uppercase tracking-[0.08em] outline-none"
      style={{ color, borderColor: color }}
      contentEditable={editable}
      suppressContentEditableWarning
      onBlur={(event) => {
        if (!editable || !onSave) return;
        const next = event.currentTarget.innerText.replace(/\s*–\s*$/, "").trim();
        if (next && next !== value) onSave(next);
      }}
    >
      {value}{" "}
      <span className="font-normal" contentEditable={false}>
        –
      </span>
    </h2>
  );
}

function ProductsTable({
  items,
  color,
  showDelivery,
  sample,
}: {
  items: LiveTableItem[];
  color: string;
  showDelivery?: boolean;
  sample?: boolean;
}) {
  const visible = items;
  const total = visible.filter((item) => !item.optional).reduce((sum, item) => sum + item.lineTotal, 0);
  const anyPhoto = visible.some((item) => item.photoUrl);
  const cols = 4 + (anyPhoto ? 1 : 0) + 2 + (sample ? 0 : 1) + (showDelivery ? 1 : 0);

  if (visible.length === 0) {
    return (
      <p className="border border-dashed border-neutral-300 px-[6mm] py-[10mm] text-center text-[10pt] text-neutral-500">
        Todavía no hay equipos cargados. Completá la planilla o generá la propuesta desde Brief y planos.
      </p>
    );
  }

  return (
    <table className="w-full table-fixed border-collapse text-[9pt]">
      <colgroup>
        <col style={{ width: "8mm" }} />
        {anyPhoto ? <col style={{ width: "20mm" }} /> : null}
        <col style={{ width: "12mm" }} />
        <col style={{ width: "9mm" }} />
        <col />
        <col style={{ width: "21mm" }} />
        <col style={{ width: "23mm" }} />
        {!sample ? <col style={{ width: "11mm" }} /> : null}
        {showDelivery ? <col style={{ width: "21mm" }} /> : null}
      </colgroup>
      <thead>
        <tr style={{ background: color, color: "#fff" }}>
          <th className="px-[2mm] py-[1.6mm] text-right font-semibold">#</th>
          {anyPhoto ? <th className="px-[2mm] py-[1.6mm] text-left font-semibold">Foto</th> : null}
          <th className="px-[2mm] py-[1.6mm] text-right font-semibold">Cant.</th>
          <th className="px-[2mm] py-[1.6mm] text-left font-semibold">U</th>
          <th className="px-[2mm] py-[1.6mm] text-left font-semibold">Detalle</th>
          <th className="px-[2mm] py-[1.6mm] text-right font-semibold">Unit.</th>
          <th className="px-[2mm] py-[1.6mm] text-right font-semibold">Total</th>
          {!sample ? <th className="px-[2mm] py-[1.6mm] text-right font-semibold">IVA</th> : null}
          {showDelivery ? <th className="px-[2mm] py-[1.6mm] text-left font-semibold">Entrega</th> : null}
        </tr>
      </thead>
      <tbody>
        {visible.map((item, index) => (
          <tr key={item.id} className="align-top" style={{ background: index % 2 ? "#f3f5f8" : "#fff" }}>
            <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] text-right tabular-nums text-neutral-500">
              {index + 1}
            </td>
            {anyPhoto ? (
              <td className="border-b border-neutral-200 px-[1.5mm] py-[1.5mm]">
                {item.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.photoUrl} alt="" className="h-[16mm] w-[16mm] object-contain" />
                ) : null}
              </td>
            ) : null}
            <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] text-right tabular-nums">{item.qty}</td>
            <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm]">{item.unit}</td>
            <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] leading-[1.35]">
              <span className="whitespace-pre-line">{item.detail}</span>
              {item.optional ? (
                <span className="ml-1 text-[7.5pt] font-semibold uppercase tracking-wide text-neutral-500">
                  Opcional
                </span>
              ) : null}
            </td>
            <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] text-right tabular-nums">
              {formatUsd(item.unitPrice)}
            </td>
            <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] text-right font-semibold tabular-nums">
              {formatUsd(item.lineTotal)}
            </td>
            {!sample ? (
              <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] text-right tabular-nums">
                {item.ivaRate ?? "—"}
              </td>
            ) : null}
            {showDelivery ? (
              <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm]">{item.deliveryKey || "—"}</td>
            ) : null}
          </tr>
        ))}
        <tr style={{ background: color, color: "#fff" }}>
          <td className="px-[2mm] py-[2mm] text-right font-bold uppercase tracking-[0.08em]" colSpan={cols - (sample ? 1 : 3)}>
            Total
          </td>
          <td className="px-[2mm] py-[2mm] text-right text-[10.5pt] font-bold tabular-nums">{formatUsd(total)}</td>
          {!sample ? <td colSpan={showDelivery ? 2 : 1} /> : null}
        </tr>
      </tbody>
    </table>
  );
}

function TermsDetail({ terms, color }: { terms: LiveTerms; color: string }) {
  const rows: [string, string][] = [];
  if (terms.paymentTerms) rows.push(["Forma de pago", terms.paymentTerms]);
  if (terms.deliveryText) rows.push(["Plazo de entrega", terms.deliveryText]);
  if (terms.validityDays != null) rows.push(["Mantenimiento de la oferta", `${terms.validityDays} días corridos`]);
  if (rows.length === 0) return null;
  return (
    <table className="mt-[3mm] w-full border-collapse text-[9.5pt]">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td className="w-[52mm] border-b border-neutral-200 py-[1.4mm] pr-[3mm] align-top font-semibold" style={{ color }}>
              {label}
            </td>
            <td className="border-b border-neutral-200 py-[1.4mm] align-top">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LiveQuoteCanvas({
  scope,
  identity,
  header,
  modules,
  items,
  showDelivery,
  terms,
  signature,
  plans = [],
  gallery = [],
  issued = false,
  canEditImages = false,
  quoteId,
}: {
  scope: "template" | "quote";
  identity: LiveIdentity;
  header: LiveHeader;
  modules: LiveModule[];
  items?: LiveTableItem[];
  showDelivery?: boolean;
  terms?: LiveTerms | null;
  signature: { name: string; title: string };
  plans?: { id: string; url: string; caption: string | null }[];
  gallery?: { id: string; url: string; caption: string | null; aiGenerated?: boolean }[];
  issued?: boolean;
  canEditImages?: boolean;
  quoteId?: string;
}) {
  const color = identity.primary;
  const [bodies, setBodies] = useState(() => Object.fromEntries(modules.map((mod) => [mod.key, mod.body])));
  const [titles, setTitles] = useState(() => Object.fromEntries(modules.map((mod) => [mod.key, mod.title])));
  const draftsRef = useRef({ ...bodies });
  const savedRef = useRef({ ...bodies });
  const titlesRef = useRef({ ...titles });
  const savedTitlesRef = useRef({ ...titles });
  const [brands, setBrands] = useState(() => resolveImagePlacement(identity.brands, DEFAULT_BRANDS_PLACEMENT));
  const [iso, setIso] = useState(() => resolveImagePlacement(identity.iso, DEFAULT_ISO_PLACEMENT));
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [aiPendingKey, setAiPendingKey] = useState<string | null>(null);

  const tableItems = scope === "template" ? SAMPLE_ITEMS : items ?? [];
  const imageEditable = canEditImages && !issued;

  function persistBody(mod: LiveModule, body = draftsRef.current[mod.key] ?? "", title = titlesRef.current[mod.key]) {
    if (!mod.persistId || issued) return;
    if (body === savedRef.current[mod.key] && title === savedTitlesRef.current[mod.key]) return;
    setSavingKey(mod.key);
    start(async () => {
      const result =
        scope === "template"
          ? await saveQuoteTemplateBlock({ blockId: mod.persistId as string, body, title })
          : await saveQuoteSectionBody({ sectionId: mod.persistId as string, body, title });
      setSavingKey(null);
      if (!result.ok) {
        setError(result.error || "No se pudo guardar el módulo.");
        return;
      }
      savedRef.current[mod.key] = body;
      savedTitlesRef.current[mod.key] = title;
      setError(null);
    });
  }

  function persistTitle(mod: LiveModule, title: string) {
    titlesRef.current[mod.key] = title;
    setTitles((prev) => ({ ...prev, [mod.key]: title }));
    persistBody(mod, draftsRef.current[mod.key] ?? bodies[mod.key], title);
  }

  function persistImage(target: "brands" | "iso", next: ImagePlacement) {
    if (target === "brands") setBrands(next);
    else setIso(next);
    if (!imageEditable) return;
    start(async () => {
      const result = await saveQuoteImagePlacement({ target, width: next.width, align: next.align });
      if (!result.ok) setError(result.error || "No se pudo guardar la imagen.");
    });
  }

  function rewrite(mod: LiveModule, instruction: string) {
    if (!mod.persistId || issued) return;
    setAiPendingKey(mod.key);
    start(async () => {
      const result =
        scope === "template"
          ? await reviseQuoteTemplateBlock({ blockId: mod.persistId as string, instruction })
          : await reviseQuoteNode({
              quoteId: quoteId as string,
              nodeId: mod.persistId as string,
              kind: "section",
              instruction,
            });
      setAiPendingKey(null);
      setAiMessage((prev) => ({ ...prev, [mod.key]: result.error || result.message || "Listo" }));
      if (result.ok && result.body) {
        draftsRef.current[mod.key] = result.body;
        savedRef.current[mod.key] = result.body;
        setBodies((prev) => ({ ...prev, [mod.key]: result.body as string }));
      }
    });
  }

  function canEdit(mod: LiveModule) {
    if (issued || !mod.persistId) return false;
    if (mod.kind === "table") return false;
    if (scope === "template" && mod.kind !== "fixed") return false;
    return true;
  }

  function showsTitle(mod: LiveModule) {
    return mod.key !== "letter_open" && mod.key !== "closing" && mod.key !== "disciplines";
  }

  function aiFooter(mod: LiveModule) {
    if (!canEdit(mod)) return null;
    return (
      <AiRewriteBox
        compact
        pending={aiPendingKey === mod.key || pending}
        message={aiMessage[mod.key]}
        warning={
          scope === "template"
            ? "Cambia la plantilla maestra. Las cotizaciones ya creadas no se tocan."
            : "Sólo esta cotización. La plantilla maestra no cambia."
        }
        placeholder={
          scope === "template"
            ? "Hacelo más largo, más claro… actualiza el texto de las COT nuevas."
            : "Hacelo más largo, más claro… sólo esta cotización."
        }
        onApply={(instruction) => rewrite(mod, instruction)}
      />
    );
  }

  function renderEditor(mod: LiveModule, extraClass?: string) {
    const editable = canEdit(mod);
    return (
      <div className={extraClass}>
        <LiveRichText
          value={toEditorHtml(bodies[mod.key] ?? "")}
          onChange={(html) => {
            draftsRef.current[mod.key] = html;
          }}
          onBlurSave={() => persistBody(mod)}
          onFocusChange={(focused) => setFocusedKey(focused ? mod.key : null)}
          ariaLabel={`Texto de ${titles[mod.key] || mod.title}`}
          readOnly={!editable}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="print:hidden rounded-md border border-border bg-card px-3 py-2 text-sm">
        {scope === "template" ? (
          <p>
            <strong>Plantilla maestra.</strong> Clickeá el texto y escribí. Los cambios aplican a las cotizaciones
            nuevas. Las ya creadas no se tocan.
          </p>
        ) : (
          <p>
            <strong>Sólo esta cotización.</strong> Clickeá el documento y escribí. La plantilla maestra no cambia.
          </p>
        )}
      </div>

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
                <ModuleChrome
                  label="Encabezado"
                  hint={scope === "template" ? "Cliente, fecha y número — se completan en cada cotización" : "Datos de esta cotización"}
                >
                  <p className="text-right text-[10pt] text-neutral-700">{header.dateLabel}</p>
                  <div className="mt-[6mm]">
                    <p className="font-semibold" style={{ color }}>
                      A
                    </p>
                    <p className="text-[12pt] font-bold uppercase">{header.clientName}</p>
                    {header.contactName ? <p className="text-[10pt]">At.: {header.contactName}</p> : null}
                    <p className="mt-[3mm]">
                      <span className="font-semibold" style={{ color }}>
                        Ref:
                      </span>{" "}
                      {header.reference}
                    </p>
                    <p>
                      <span className="font-semibold" style={{ color }}>
                        Presupuesto:
                      </span>{" "}
                      <span className="font-bold tracking-wide" style={{ color }}>
                        {header.number}
                      </span>
                    </p>
                  </div>
                </ModuleChrome>

                {modules.map((mod) => {
                  const editable = canEdit(mod);
                  const title = titles[mod.key] || mod.title;

                  if (mod.kind === "table") {
                    return (
                      <ModuleChrome
                        key={mod.key}
                        label={title}
                        hint={scope === "template" ? "Se arma con los equipos de cada cotización" : "Planilla de esta cotización"}
                      >
                        <SectionTitle value="Planilla de equipamiento y servicios" color={color} editable={false} />
                        <ProductsTable
                          items={tableItems}
                          color={color}
                          showDelivery={scope === "quote" ? showDelivery : false}
                          sample={scope === "template"}
                        />
                        {scope === "template" ? (
                          <p className="mt-[2mm] flex items-center gap-1.5 text-[11px] text-muted-foreground print:hidden">
                            <Table2 className="h-3 w-3" /> Datos de ejemplo. En cada cotización se completa con los
                            equipos reales.
                          </p>
                        ) : null}
                      </ModuleChrome>
                    );
                  }

                  if (mod.kind === "ai" && scope === "template") {
                    return (
                      <ModuleChrome key={mod.key} label={title} hint="Lo redacta la IA en cada cotización">
                        <SectionTitle value={title} color={color} editable={false} />
                        <p className="flex items-start gap-1.5 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-[10pt] text-muted-foreground">
                          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {mod.description}
                        </p>
                      </ModuleChrome>
                    );
                  }

                  if (mod.key === "letter_open" || mod.key === "closing") {
                    return (
                      <ModuleChrome
                        key={mod.key}
                        label={title}
                        hint={scope === "template" ? "Texto fijo" : "Texto de esta cotización"}
                        focused={focusedKey === mod.key}
                        saving={savingKey === mod.key}
                        footer={aiFooter(mod)}
                      >
                        {renderEditor(mod)}
                      </ModuleChrome>
                    );
                  }

                  if (mod.key === "disciplines") {
                    return (
                      <ModuleChrome
                        key={mod.key}
                        label={title}
                        hint="Franja de disciplinas"
                        focused={focusedKey === mod.key}
                        saving={savingKey === mod.key}
                        footer={aiFooter(mod)}
                      >
                        <div
                          className="px-[4mm] py-[2.5mm] text-center text-[10pt] font-semibold uppercase tracking-[0.14em] text-white"
                          style={{ background: color }}
                        >
                          {renderEditor(mod)}
                        </div>
                      </ModuleChrome>
                    );
                  }

                  return (
                    <ModuleChrome
                      key={mod.key}
                      label={title}
                      hint={mod.kind === "ai" ? "Texto de proyecto" : scope === "template" ? "Texto fijo" : "Texto de esta cotización"}
                      focused={focusedKey === mod.key}
                      saving={savingKey === mod.key}
                      footer={aiFooter(mod)}
                    >
                      {showsTitle(mod) ? (
                        <SectionTitle
                          value={title}
                          color={color}
                          editable={editable}
                          onSave={(next) => persistTitle(mod, next)}
                        />
                      ) : null}
                      {renderEditor(mod)}
                      {mod.key === "brands" ? (
                        <ResizableQuoteImage
                          src={identity.brandsUrl}
                          alt="Marcas representadas por SOUNDTEC"
                          placement={brands}
                          editable={imageEditable}
                          onChange={(next) => persistImage("brands", next)}
                        />
                      ) : null}
                      {mod.key === "iso" ? (
                        <ResizableQuoteImage
                          src={identity.isoUrl}
                          alt="ISO 9001 · IRAM · IQNet"
                          placement={iso}
                          editable={imageEditable}
                          onChange={(next) => persistImage("iso", next)}
                        />
                      ) : null}
                      {mod.key === "commercial_terms" && terms ? <TermsDetail terms={terms} color={color} /> : null}
                    </ModuleChrome>
                  );
                })}

                <ModuleChrome label="Firma" hint="Sale del perfil de quien emite">
                  <div className="quote-doc__keep">
                    <p className="font-semibold">{signature.name}</p>
                    {signature.title ? <p className="text-[10pt]">{signature.title}</p> : null}
                    <p className="text-[10pt] font-semibold tracking-[0.35em]" style={{ color }}>
                      {identity.name} s.r.l.
                    </p>
                  </div>
                </ModuleChrome>

                {plans.length > 0 ? (
                  <ModuleChrome label="Planos" hint="Imágenes de esta cotización">
                    <SectionTitle value="Planos y relevamiento" color={color} editable={false} />
                    <div className="grid grid-cols-1 gap-[5mm]">
                      {plans.map((plan) => (
                        <figure key={plan.id} className="quote-doc__block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={plan.url} alt={plan.caption || "Plano"} className="max-h-[150mm] w-full object-contain" />
                          {plan.caption ? (
                            <figcaption className="mt-[1.5mm] text-center text-[8.5pt] text-neutral-600">
                              {plan.caption}
                            </figcaption>
                          ) : null}
                        </figure>
                      ))}
                    </div>
                  </ModuleChrome>
                ) : null}

                {gallery.length > 0 ? (
                  <ModuleChrome label="Galería" hint="Imágenes de esta cotización">
                    <SectionTitle value="Imágenes de referencia" color={color} editable={false} />
                    <div className="grid grid-cols-2 gap-[5mm]">
                      {gallery.map((asset) => (
                        <figure key={asset.id} className="quote-doc__block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={asset.url}
                            alt={asset.caption || ""}
                            className="h-[62mm] w-full bg-neutral-50 object-contain"
                          />
                          <figcaption className="mt-[1.5mm] text-[8.5pt] text-neutral-600">
                            {asset.caption || (asset.aiGenerated ? "Imagen conceptual" : "")}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </ModuleChrome>
                ) : null}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
