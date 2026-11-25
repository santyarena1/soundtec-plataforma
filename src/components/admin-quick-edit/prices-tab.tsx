"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRightLeft, History, Info, Loader2, Target } from "lucide-react";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUnsavedValue } from "@/hooks/use-unsaved-changes-guard";
import { formatUsd, cn } from "@/lib/utils";
import { markupForTargetPrice, parseDecimal, planPriceSave, type PriceDraft, type ProductPriceFields } from "@/lib/quick-edit/price-draft";
import { loadQuickEditPricing, saveQuickEditPrices, simulateQuickEditPrice, type PriceSnapshot, type QuickPricingData } from "@/server/actions/quick-edit-pricing";
import { ClientPicker, PriceTicket } from "./price-ticket";
import { FeedbackLine, SaveBar, SectionHead, useFeedback } from "./parts";
import { errorText, useReportDirty } from "./texts-tab";

type NumKey = Exclude<keyof ProductPriceFields, "distributorId" | "requiresQuote">;
const NUM_FIELDS: Array<{ key: NumKey; label: string; suffix: string; hint: string; required?: boolean }> = [
  { key: "baseCostUsd", label: "Costo base", suffix: "USD", hint: "Costo del proveedor, sin impuestos.", required: true },
  { key: "coefNac", label: "Coef. nacionalización", suffix: "×", hint: "Costo nac. = costo × coef. Vacío = ×1." },
  { key: "coefVta", label: "Coef. venta (COEF VTA)", suffix: "×", hint: "Markup si ninguna regla le aplica." },
  { key: "discountPercent", label: "Descuento propio", suffix: "%", hint: "Manda sobre las reglas generales de descuento." },
  { key: "tariffDutyPercent", label: "Derecho de importación", suffix: "%", hint: "Informativo para el costo de importación." },
  { key: "coefVtaFob", label: "Coef. venta FOB", suffix: "×", hint: "Para el precio FOB." },
  { key: "ivaPercent", label: "IVA", suffix: "%", hint: "Vacío = 21 %." },
  { key: "impIntPercent", label: "Impuestos internos", suffix: "%", hint: "Sobre el precio en pesos." },
];

const toText = (v: number | null) => (v == null ? "" : String(Number(v.toFixed(4))).replace(".", ","));
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const STATUS: Record<string, { label: string; tone: "success" | "warning" | "muted" }> = {
  APPLIED: { label: "Aplicado", tone: "success" },
  PENDING: { label: "Pendiente", tone: "warning" },
  DISCARDED: { label: "Descartado", tone: "muted" },
};

function initialText(data: QuickPricingData) {
  return {
    nums: Object.fromEntries(NUM_FIELDS.map((f) => [f.key, toText(data.fields[f.key])])) as Record<NumKey, string>,
    distributorId: data.fields.distributorId ?? "",
    requiresQuote: data.fields.requiresQuote,
    ownMarkup: toText(data.ownMarkup),
    rules: Object.fromEntries(data.rules.filter((r) => r.origin !== "catalog").map((r) => [r.id, toText(r.value)])) as Record<string, string>,
  };
}

/** Texto del formulario → borrador numérico (o el primer error). */
function toDraft(text: ReturnType<typeof initialText>): { draft: PriceDraft } | { error: string } {
  const fields = { distributorId: text.distributorId || null, requiresQuote: text.requiresQuote } as ProductPriceFields;
  for (const f of NUM_FIELDS) {
    const raw = text.nums[f.key];
    const n = parseDecimal(raw);
    if (raw.trim() && n == null) return { error: `«${f.label}» no es un número.` };
    if (n != null && n < 0) return { error: `«${f.label}» no puede ser negativo.` };
    if (f.required && n == null) return { error: `Falta el ${f.label.toLowerCase()}.` };
    (fields as unknown as Record<string, number | null>)[f.key] = n;
  }
  const ownMarkup = parseDecimal(text.ownMarkup);
  if (text.ownMarkup.trim() && (ownMarkup == null || ownMarkup <= 1)) return { error: "El markup propio tiene que ser mayor a 1 (ej. 1,8)." };
  const ruleValues: Record<string, number> = {};
  for (const [id, raw] of Object.entries(text.rules)) {
    const n = parseDecimal(raw);
    if (n == null) return { error: "Hay una regla sin valor." };
    ruleValues[id] = n;
  }
  return { draft: { fields, ownMarkup, ruleValues } };
}

type Sim = { general: { before: PriceSnapshot; after: PriceSnapshot }; client: { name: string; before: PriceSnapshot; after: PriceSnapshot } | null };

export function PricesTab({ productId, onSaved, onDirty, active }: { productId: string; onSaved: () => void; onDirty: (d: boolean) => void; active: boolean }) {
  const [data, setData] = useState<QuickPricingData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<QuickPricingData | null> => {
    try {
      const result = await loadQuickEditPricing(productId);
      if (!result.ok) {
        setLoadError(result.error);
        return null;
      }
      setLoadError(null);
      setData(result.data);
      return result.data;
    } catch (error) {
      setLoadError(errorText(error));
      return null;
    }
  }, [productId]);

  // Se carga recién cuando se abre la pestaña (los costos no viajan si nadie los mira).
  useEffect(() => {
    if (active && !data) void load();
  }, [active, data, load]);

  if (loadError) return <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadError}</p>;
  if (!data)
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Armando el desglose del precio…
      </p>
    );
  return <PricesEditor productId={productId} data={data} onDirty={onDirty} reload={load} onSaved={onSaved} />;
}

interface EditorProps {
  productId: string;
  data: QuickPricingData;
  onDirty: (d: boolean) => void;
  reload: () => Promise<QuickPricingData | null>;
  onSaved: () => void;
}

function PricesEditor({ productId, data, onDirty, reload, onSaved }: EditorProps) {
  const [text, setText] = useState(() => initialText(data));
  const [client, setClient] = useState<{ id: string; name: string } | null>(null);
  const [sim, setSim] = useState<Sim | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [target, setTarget] = useState("");
  const guard = useUnsavedValue(text);
  useReportDirty(onDirty, guard.isDirty);
  const [feedback, setFeedback] = useFeedback();
  const [pending, start] = useTransition();
  const parsed = useMemo(() => toDraft(text), [text]);
  const draft = "draft" in parsed ? parsed.draft : null;

  const plan = useMemo(
    () =>
      draft
        ? planPriceSave(
            { fields: data.fields, ownMarkup: data.ownMarkup, rules: data.rules.map((r) => ({ id: r.id, kind: r.kind, scope: r.scope, value: r.value, origin: r.origin })) },
            draft
          )
        : null,
    [draft, data]
  );

  // Simulación en vivo con el motor real (con una pausa corta mientras se escribe).
  const draftKey = JSON.stringify(draft);
  useEffect(() => {
    if (!draft) return;
    let alive = true;
    const timer = setTimeout(async () => {
      setSimulating(true);
      try {
        const result = await simulateQuickEditPrice(productId, draft, client?.id ?? null);
        if (!alive) return;
        if (result.ok) setSim({ general: result.general, client: result.client });
        else setFeedback({ tone: "error", text: result.error });
      } catch (error) {
        if (alive) setFeedback({ tone: "error", text: errorText(error) });
      } finally {
        if (alive) setSimulating(false);
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // draftKey resume el borrador (evita simular dos veces lo mismo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, client?.id, productId]);

  const general = sim?.general ?? { before: data.current, after: data.current };
  const setNum = (key: NumKey, value: string) => setText((t) => ({ ...t, nums: { ...t.nums, [key]: value } }));

  function applyTarget() {
    const value = parseDecimal(target);
    const markup = value == null ? null : markupForTargetPrice(value, general.after.costoNacUsd, general.after.discountPercent);
    if (markup == null) return setFeedback({ tone: "error", text: "Para fijar un precio final hace falta costo cargado y un precio mayor a 0." });
    setText((t) => ({ ...t, ownMarkup: toText(markup) }));
    setFeedback({ tone: "info", text: `Markup propio ×${toText(markup)}: revisá la simulación y guardá.` });
  }

  function save() {
    if (!draft) return;
    setFeedback(null);
    start(async () => {
      try {
        const result = await saveQuickEditPrices(productId, draft);
        const lines = [...(result.applied ?? []), ...(result.review ?? [])].join(" ");
        if (!result.ok) return setFeedback({ tone: "error", text: [result.error, lines].filter(Boolean).join(" · ") });
        setFeedback({ tone: result.review.length ? "info" : "ok", text: lines });
        // Vuelve a leer lo guardado: lo que quedó en revisión sigue con el valor de hoy.
        const fresh = await reload();
        const next = fresh ? initialText(fresh) : text;
        setText(next);
        guard.markSaved(next);
        setSim(null);
        onSaved();
      } catch (error) {
        setFeedback({ tone: "error", text: errorText(error) });
      }
    });
  }

  const directCount = plan ? Object.keys(plan.fields).length + plan.changes.filter((c) => c.route !== "review").length : 0;
  const reviewCount = plan ? plan.changes.filter((c) => c.route === "review").length : 0;
  const rulesShown = data.rules.filter((r) => r.origin !== "catalog");

  return (
    <div className="space-y-7">
      <div className="flex gap-2.5 rounded-md border border-primary/15 bg-primary/[0.04] px-3 py-2.5 text-xs leading-relaxed text-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          <span className="font-semibold">Cómo se guarda.</span> Lo propio de este producto (costo, proveedor, coeficientes, descuento propio, markup propio y «consultá precio») se aplica
          al guardar, igual que en la ficha del admin. Las reglas de marca, rubro, proveedor o generales, y todas las de descuento, mueven el precio de muchos productos: quedan en{" "}
          <Link href="/admin/price-reviews" className="font-medium text-primary underline-offset-2 hover:underline">
            Precios › Revisión de cambios
          </Link>{" "}
          hasta que alguien las aprueba.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-1">
        <PriceTicket title="Precio general" before={general.before} after={general.after} loading={simulating} roundingOn={!!data.rounding} />
        <ClientPicker value={client} onChange={setClient} />
        {sim?.client ? <PriceTicket title={`Para ${sim.client.name}`} before={sim.client.before} after={sim.client.after} loading={simulating} roundingOn={!!data.rounding} /> : null}
        <p className="text-[11px] text-muted-foreground">
          {data.rounding ? "Redondeo por tramos activo (Configuración › Precios): se aplica al precio de lista y al final." : "Redondeo por tramos apagado: los precios van sin redondear."}
          {data.clientRulesCount ? ` Hay ${data.clientRulesCount} condición(es) de clientes que tocan este producto; se editan en la ficha de cada cliente.` : ""}
        </p>
      </div>

      <section>
        <SectionHead
          title="Datos del producto"
          hint={
            <>
              Se guardan directo. Moneda del costo: <span className="font-medium">{data.currency}</span>
              {data.costUpdatedAt ? ` · costo editado a mano el ${fmtDate(data.costUpdatedAt)}` : ""}
              {data.msrpUsd ? ` · lista del fabricante (MSRP) ${formatUsd(data.msrpUsd)}, solo de referencia` : ""}
            </>
          }
        />
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="qe-dist">Proveedor / distribuidor</Label>
            <Select id="qe-dist" value={text.distributorId} onChange={(e) => setText((t) => ({ ...t, distributorId: e.target.value }))}>
              <option value="">Sin proveedor</option>
              {data.distributors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">Las reglas por proveedor dependen de este dato.</p>
          </div>
          {NUM_FIELDS.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`qe-${f.key}`}>{f.label}</Label>
              <div className="relative">
                <Input id={`qe-${f.key}`} inputMode="decimal" value={text.nums[f.key]} onChange={(e) => setNum(f.key, e.target.value)} className="pr-12 text-right font-mono tabular-nums" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{f.suffix}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{f.hint}</p>
            </div>
          ))}
          <label className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2.5 sm:col-span-2">
            <input type="checkbox" checked={text.requiresQuote} onChange={(e) => setText((t) => ({ ...t, requiresQuote: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-primary" />
            <span className="text-sm">
              <span className="font-medium">Requiere cotización</span>
              <span className="block text-xs text-muted-foreground">El cliente ve «Consultá precio» en vez del precio.</span>
            </span>
          </label>
        </div>
      </section>

      {data.canMargins ? (
        <section>
          <SectionHead title="Markup propio" hint="Regla de este producto solo: gana sobre marca, rubro y la lista SoundTube. Se guarda directo." />
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <Label htmlFor="qe-own">Markup</Label>
              <div className="relative">
                <Input id="qe-own" inputMode="decimal" value={text.ownMarkup} onChange={(e) => setText((t) => ({ ...t, ownMarkup: e.target.value }))} placeholder="Ninguno" className="pr-7 text-right font-mono tabular-nums" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">×</span>
              </div>
            </div>
            <ArrowRightLeft className="mb-3 h-4 w-4 text-muted-foreground" aria-hidden />
            <div className="w-40" data-unsaved-guard="ignore">
              <Label htmlFor="qe-target">Precio final buscado</Label>
              <Input id="qe-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="USD" className="text-right font-mono tabular-nums" />
            </div>
            <Button variant="outline" size="sm" className="mb-1" onClick={applyTarget} disabled={!target.trim()}>
              <Target className="h-3.5 w-3.5" /> Calcular markup
            </Button>
            {text.ownMarkup ? (
              <Button variant="ghost" size="sm" className="mb-1" onClick={() => setText((t) => ({ ...t, ownMarkup: "" }))}>
                Quitar markup propio
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {rulesShown.length ? (
        <section>
          <SectionHead title="Reglas que le aplican" hint="Del más específico al más general; gana la primera que aplica. Cambiá un valor para simularlo." />
          <ul className="divide-y divide-border rounded-md border border-border">
            {rulesShown.map((r) => {
              const editable = r.kind === "margin" ? data.canMargins : data.canDiscounts;
              const direct = r.kind === "margin" && r.scope === "PRODUCT";
              return (
                <li key={r.id} className={cn("grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center", r.applied ? "bg-primary/[0.04]" : "")}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium">{r.kind === "margin" ? "Margen" : "Descuento"} · {r.scopeLabel}</span>
                      {r.applied ? <Badge tone="success">Aplica hoy</Badge> : null}
                      {r.exempt ? <Badge tone="muted">Exceptuado</Badge> : null}
                      {r.origin === "soundtube" ? <Badge tone="accent">Lista SoundTube</Badge> : null}
                      <Badge tone={direct ? "primary" : "warning"}>{direct ? "Directo" : r.groupSize > 1 ? `Revisión · ${r.groupSize} subreglas` : "Revisión"}</Badge>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground" title={r.name}>{r.name}</p>
                  </div>
                  <div className="relative w-28">
                    <Input
                      inputMode="decimal"
                      value={text.rules[r.id] ?? ""}
                      disabled={!editable}
                      onChange={(e) => setText((t) => ({ ...t, rules: { ...t.rules, [r.id]: e.target.value } }))}
                      className="h-8 pr-7 text-right font-mono text-xs tabular-nums"
                      aria-label={`Valor de ${r.scopeLabel}`}
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{r.kind === "margin" ? "×" : "%"}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Para crear reglas nuevas: <Link href="/admin/margins" className="text-primary hover:underline">Márgenes</Link> ·{" "}
            <Link href="/admin/discounts" className="text-primary hover:underline">Descuentos</Link>.
          </p>
        </section>
      ) : null}

      <section>
        <SectionHead title="Historial reciente" hint="Revisiones de precio en las que entró este producto." aside={<History className="h-4 w-4 text-muted-foreground" />} />
        {data.history.length ? (
          <ul className="space-y-1">
            {data.history.map((h) => (
              <li key={h.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                <span className="font-mono text-[11px] text-muted-foreground">{fmtDate(h.createdAt)}</span>
                <span className="truncate" title={`${h.title}${h.by ? ` · ${h.by}` : ""}`}>
                  {h.title}
                </span>
                <span className="flex items-center gap-2">
                  {h.beforeUsd != null || h.afterUsd != null ? (
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {h.beforeUsd != null ? formatUsd(h.beforeUsd) : "—"} → {h.afterUsd != null ? formatUsd(h.afterUsd) : "—"}
                    </span>
                  ) : null}
                  <Badge tone={STATUS[h.status]?.tone ?? "muted"}>{STATUS[h.status]?.label ?? h.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Sin revisiones de precio que lo incluyan.</p>
        )}
      </section>

      {"error" in parsed ? (
        <p className="text-xs">
          <FeedbackLine feedback={{ tone: "error", text: parsed.error }} />
        </p>
      ) : null}
      <SaveBar
        dirty={guard.isDirty && !!draft && !!plan?.hasChanges}
        pending={pending}
        feedback={feedback}
        onSave={save}
        onDiscard={() => setText(initialText(data))}
        label={reviewCount ? "Guardar y mandar a revisión" : "Guardar precios"}
        summary={plan?.hasChanges ? [directCount ? `${directCount} directo${directCount > 1 ? "s" : ""}` : null, reviewCount ? `${reviewCount} a revisión` : null].filter(Boolean).join(" · ") : undefined}
      />
    </div>
  );
}
