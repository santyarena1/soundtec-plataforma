"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { Input, Label, Select } from "@/components/ui/input";
import { RubroPicker } from "@/components/admin/rubro-picker";
import { LabelSelector } from "@/components/admin/label-selector";
import { COMMERCIAL_TAGS } from "@/lib/commercial-tags";
import { useUnsavedValue } from "@/hooks/use-unsaved-changes-guard";
import { saveQuickEditClassification } from "@/server/actions/quick-edit";
import { cn } from "@/lib/utils";
import { SaveBar, SectionHead, useFeedback } from "./parts";
import { errorText, useReportDirty, type TabProps } from "./texts-tab";

const STOCK_OPTIONS = [
  { value: "UNKNOWN", label: "Sin dato" },
  { value: "IN_STOCK", label: "En stock" },
  { value: "LOW_STOCK", label: "Pocas unidades" },
  { value: "OUT_OF_STOCK", label: "Sin stock" },
  { value: "ON_REQUEST", label: "A pedido" },
] as const;

type StockStatus = (typeof STOCK_OPTIONS)[number]["value"];

function Toggle({ checked, onChange, title, hint, icon }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string; icon?: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors", checked ? "border-primary/40 bg-primary/[0.04]" : "border-border hover:bg-secondary/50")}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {icon}
          {title}
        </span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

export function ClassificationTab({ data, onSaved, onDirty, onHidden }: TabProps & { onHidden: () => void }) {
  const p = data.product;
  const initial = {
    brandId: p.brandId ?? "",
    categoryId: p.categoryId ?? "",
    lineId: p.lineId ?? "",
    commercialTag: p.commercialTag ?? "",
    isFeatured: p.isFeatured,
    isActive: p.isActive,
    isDiscontinued: p.isDiscontinued,
    stockStatus: p.stockStatus as StockStatus,
    stockQuantity: p.stockQuantity == null ? "" : String(p.stockQuantity),
    kind: p.kind,
  };
  const [form, setForm] = useState(initial);
  const [pickerKey, setPickerKey] = useState(0);
  const guard = useUnsavedValue(form);
  useReportDirty(onDirty, guard.isDirty);
  const [feedback, setFeedback] = useFeedback();
  const [pending, start] = useTransition();
  const series = data.series.filter((s) => s.brandId === form.brandId);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  function save() {
    const qty = form.stockQuantity.trim() === "" ? null : Number(form.stockQuantity);
    if (qty != null && (!Number.isInteger(qty) || qty < 0)) return setFeedback({ tone: "error", text: "El stock propio tiene que ser un número entero (o vacío)." });
    setFeedback(null);
    start(async () => {
      try {
        const result = await saveQuickEditClassification({
          productId: p.id,
          brandId: form.brandId || null,
          categoryId: form.categoryId || null,
          lineId: form.lineId || null,
          commercialTag: form.commercialTag || null,
          isFeatured: form.isFeatured,
          isActive: form.isActive,
          isDiscontinued: form.isDiscontinued,
          stockStatus: form.stockStatus,
          stockQuantity: qty,
          kind: form.kind,
        });
        if (!result.ok) return setFeedback({ tone: "error", text: result.error });
        guard.markSaved();
        // El rubro con reglas de precio queda en revisión: la ficha sigue con el rubro anterior.
        setFeedback({ tone: result.notice ? "info" : "ok", text: result.notice ?? "Clasificación guardada." });
        if (!form.isActive) return onHidden();
        onSaved();
      } catch (error) {
        setFeedback({ tone: "error", text: errorText(error) });
      }
    });
  }

  return (
    <div className="space-y-7">
      <section>
        <SectionHead title="Marca, rubro y serie" hint="Si el rubro nuevo cambia reglas de precio, el cambio queda en Precios › Revisión de cambios antes de aplicarse." />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="qe-brand">Marca</Label>
            <Select id="qe-brand" value={form.brandId} onChange={(e) => setForm((f) => ({ ...f, brandId: e.target.value, lineId: "" }))}>
              <option value="">Sin marca</option>
              {data.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="qe-line">Serie del fabricante</Label>
            <Select id="qe-line" value={form.lineId} onChange={(e) => set("lineId", e.target.value)} disabled={!form.brandId}>
              <option value="">{form.brandId ? (series.length ? "Sin serie" : "Esta marca no tiene series") : "Elegí primero la marca"}</option>
              {series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="qe-rubro">Rubro</Label>
            <RubroPicker
              key={pickerKey}
              id="qe-rubro"
              nodes={data.categories}
              defaultValue={form.categoryId || null}
              onChange={(id) => set("categoryId", id)}
              allowCreate={data.access.canCreateSubrubro}
            />
          </div>
        </div>
      </section>

      <section>
        <SectionHead title="Etiquetas comerciales" hint="Se guardan al tocarlas (filtros del catálogo y chips de la ficha)." />
        <LabelSelector productId={p.id} allLabels={data.labels} currentLabelIds={p.labelIds} />
      </section>

      <section>
        <SectionHead title="Cartel y estado" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="qe-tag">Cartel para el cliente</Label>
            <Select id="qe-tag" value={form.commercialTag} onChange={(e) => set("commercialTag", e.target.value)}>
              <option value="">Automático (solo el descuento)</option>
              {COMMERCIAL_TAGS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">«Últimas unidades» habla del stock propio de Soundtec: elegilo a mano.</p>
          </div>
          <div>
            <Label htmlFor="qe-kind">Tipo</Label>
            <Select id="qe-kind" value={form.kind} onChange={(e) => set("kind", e.target.value as typeof form.kind)}>
              <option value="PRINCIPAL">Producto principal</option>
              <option value="ACCESORIO">Accesorio</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="qe-stock">Stock</Label>
            <Select id="qe-stock" value={form.stockStatus} onChange={(e) => set("stockStatus", e.target.value as StockStatus)}>
              {STOCK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="qe-qty">Unidades (stock propio)</Label>
            <Input id="qe-qty" inputMode="numeric" value={form.stockQuantity} onChange={(e) => set("stockQuantity", e.target.value.replace(/[^\d]/g, ""))} placeholder="Vacío = sin dato" />
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Toggle checked={form.isFeatured} onChange={(v) => set("isFeatured", v)} title="Destacado" hint="Sale primero al entrar a su marca." icon={<Star className={cn("h-3.5 w-3.5", form.isFeatured ? "fill-accent text-accent" : "")} />} />
          <Toggle checked={form.isActive} onChange={(v) => set("isActive", v)} title="Visible" hint="Apagado: deja de verse en el portal y el catálogo." />
          <Toggle checked={form.isDiscontinued} onChange={(v) => set("isDiscontinued", v)} title="Discontinuado" hint="Dato del fabricante. Solo lo ve el equipo." />
        </div>
        {!form.isActive && p.isActive ? (
          <p className="mt-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">Al guardar se oculta: esta ficha deja de existir para los clientes y te llevamos al admin.</p>
        ) : null}
      </section>

      <SaveBar
        dirty={guard.isDirty}
        pending={pending}
        feedback={feedback}
        onSave={save}
        onDiscard={() => {
          setForm(initial);
          setPickerKey((k) => k + 1);
        }}
        label="Guardar clasificación"
      />
    </div>
  );
}
