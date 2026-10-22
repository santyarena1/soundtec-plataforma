"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatUsd } from "@/lib/utils";
import {
  clearProductsMarkup,
  loadPriceEditor,
  setProductTargetPrice,
  setProductsMarkup,
  updateRuleMarkup,
  type EditorProduct,
  type EditorRule,
} from "@/server/actions/price-editor";

type Mode = "markup" | "price" | "rule" | "clear";

const parse = (v: string) => Number(v.replace(",", "."));
const SOURCE_LABEL: Record<EditorProduct["source"], string> = { RULE: "Regla", COEF_VTA: "COEF VTA de la ficha", DEFAULT: "Markup por defecto" };

/**
 * Editor de precios del catálogo: muestra de dónde sale el precio de cada
 * producto elegido y permite cambiarlo, con el precio nuevo a la vista antes
 * de guardar. Solo para quien gestiona márgenes y ve costos.
 */
export function PriceEditorModal({ productIds, open, onClose }: { productIds: string[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<EditorProduct[]>([]);
  const [rules, setRules] = useState<EditorRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("markup");
  const [markupInput, setMarkupInput] = useState("");
  const [unit, setUnit] = useState<"markup" | "margin">("markup");
  const [priceInput, setPriceInput] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [ruleMarkup, setRuleMarkup] = useState("");
  const [pending, start] = useTransition();
  const single = productIds.length === 1;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setDone(null);
    loadPriceEditor(productIds)
      .then((r) => {
        if (!r.ok) return setError(r.error);
        setProducts(r.products);
        setRules(r.rules);
        const firstRule = r.rules[0];
        setRuleId(firstRule?.id ?? "");
        setRuleMarkup(firstRule ? String(firstRule.markup) : "");
        setMode(single ? "price" : "markup");
        if (single && r.products[0]) setPriceInput(r.products[0].finalPriceUsd.toFixed(2));
      })
      .catch(() => setError("No se pudo cargar el editor."))
      .finally(() => setLoading(false));
  }, [open, productIds, single]);

  // Markup a aplicar según lo escrito (markup × o margen %).
  const newMarkup = useMemo(() => {
    const v = parse(markupInput);
    if (!markupInput.trim() || !Number.isFinite(v)) return null;
    return unit === "markup" ? v : 1 + v / 100;
  }, [markupInput, unit]);

  /** Precio nuevo de cada producto (el precio es lineal en el markup). */
  function preview(p: EditorProduct): number | null {
    if (mode === "markup" && newMarkup) return p.markup > 0 ? (p.finalPriceUsd * newMarkup) / p.markup : null;
    if (mode === "price" && single) {
      const v = parse(priceInput);
      return Number.isFinite(v) && v > 0 ? v : null;
    }
    if (mode === "rule" && ruleId && p.ruleId === ruleId) {
      const v = parse(ruleMarkup);
      return Number.isFinite(v) && v > 0 && p.markup > 0 ? (p.finalPriceUsd * v) / p.markup : null;
    }
    return null;
  }

  function run(action: () => Promise<{ ok: true; changed: number } | { ok: false; error: string }>, label: (n: number) => string) {
    setError(null);
    start(async () => {
      const r = await action();
      if (!r.ok) return setError(r.error);
      setDone(label(r.changed));
      router.refresh();
      const reload = await loadPriceEditor(productIds);
      if (reload.ok) {
        setProducts(reload.products);
        setRules(reload.rules);
      }
    });
  }

  const selectedRule = rules.find((r) => r.id === ruleId);
  const withOwnRule = products.filter((p) => p.ownRule).length;

  return (
    <Modal open={open} onClose={onClose} title={single ? "Editar precio" : `Editar precios de ${productIds.length} productos`} size="lg">
      {loading ? (
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Calculando precios…
        </p>
      ) : (
        <div className="space-y-4">
          <div className="max-h-64 overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-secondary/80 text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">Producto</th>
                  <th className="px-2 py-1.5 text-right">Costo</th>
                  <th className="px-2 py-1.5">Markup</th>
                  <th className="px-2 py-1.5 text-right">Precio</th>
                  <th className="px-2 py-1.5 text-right">Nuevo</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const next = preview(p);
                  const rule = rules.find((r) => r.id === p.ruleId);
                  return (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-2 py-1.5">
                        <span className="block max-w-[16rem] truncate font-medium" title={p.name}>
                          {p.name}
                        </span>
                        <span className="text-muted-foreground">{[p.brand, p.sku].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{p.costUsd > 0 ? formatUsd(p.costUsd) : <span className="text-destructive">sin costo</span>}</td>
                      <td className="px-2 py-1.5">
                        <span className="font-mono">×{p.markup.toFixed(2)}</span>
                        <span className="block text-muted-foreground" title={rule?.name}>
                          {p.ownRule ? "Propio" : rule ? `${rule.scope}${rule.scopeName ? `: ${rule.scopeName}` : ""}` : SOURCE_LABEL[p.source]}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatUsd(p.finalPriceUsd)}</td>
                      <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${next != null && next < p.finalPriceUsd ? "text-amber-700" : "text-emerald-700"}`}>
                        {next != null ? formatUsd(next) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
            {(
              [
                ["markup", "Markup propio"],
                ...(single ? [["price", "Precio final"]] : []),
                ...(rules.length ? [["rule", "Editar la regla"]] : []),
                ...(withOwnRule ? [["clear", "Volver a la regla general"]] : []),
              ] as Array<[Mode, string]>
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "markup" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Le pone a {single ? "este producto" : `estos ${productIds.length} productos`} un markup propio, que manda sobre la regla de marca o categoría.
                {withOwnRule ? ` ${withOwnRule} ya tienen uno: se actualiza.` : ""}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex rounded-md border border-border p-0.5 text-xs">
                  {(["markup", "margin"] as const).map((u) => (
                    <button key={u} type="button" onClick={() => setUnit(u)} className={`rounded px-2 py-1 ${unit === u ? "bg-secondary font-medium" : "text-muted-foreground"}`}>
                      {u === "markup" ? "Markup ×" : "Margen %"}
                    </button>
                  ))}
                </div>
                <div className="w-32">
                  <Label>{unit === "markup" ? "Markup" : "Margen"}</Label>
                  <Input value={markupInput} onChange={(e) => setMarkupInput(e.target.value)} inputMode="decimal" placeholder={unit === "markup" ? "2,75" : "175"} />
                </div>
                <Button disabled={pending || !newMarkup} onClick={() => run(() => setProductsMarkup(productIds, newMarkup!), (n) => `Listo: ${n} producto(s) con markup ×${newMarkup!.toFixed(2)}.`)}>
                  Aplicar
                </Button>
              </div>
            </div>
          ) : null}

          {mode === "price" && single ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Escribí el precio de venta que querés: calculamos el markup que lo da y queda como markup propio del producto.</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-40">
                  <Label>Precio final (USD)</Label>
                  <Input value={priceInput} onChange={(e) => setPriceInput(e.target.value)} inputMode="decimal" />
                </div>
                <Button disabled={pending || !(parse(priceInput) > 0)} onClick={() => run(() => setProductTargetPrice(productIds[0]!, parse(priceInput)), () => "Listo: precio actualizado.")}>
                  Aplicar
                </Button>
              </div>
            </div>
          ) : null}

          {mode === "rule" && rules.length ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[14rem] flex-1">
                  <Label>Regla</Label>
                  <select
                    value={ruleId}
                    onChange={(e) => {
                      setRuleId(e.target.value);
                      setRuleMarkup(String(rules.find((r) => r.id === e.target.value)?.markup ?? ""));
                    }}
                    className="h-10 w-full rounded-md border border-border bg-card px-2 text-sm"
                  >
                    {rules.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.scope}
                        {r.scopeName ? `: ${r.scopeName}` : ""} · ×{r.markup.toFixed(2)} · {r.selectedCount} elegido(s)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <Label>Markup ×</Label>
                  <Input value={ruleMarkup} onChange={(e) => setRuleMarkup(e.target.value)} inputMode="decimal" />
                </div>
                <Button disabled={pending || !(parse(ruleMarkup) > 1)} onClick={() => run(() => updateRuleMarkup(ruleId, parse(ruleMarkup)), (n) => `Listo: regla actualizada (${n} subregla(s)).`)}>
                  Guardar regla
                </Button>
              </div>
              {selectedRule ? (
                <p className="flex items-start gap-1.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {selectedRule.fromSoundTubeList
                    ? "Es el MUP de la lista SoundTube de este producto: la próxima lista lo vuelve a poner."
                    : `Cambia el precio de todos los productos que toman esta regla (${selectedRule.scope}${selectedRule.scopeName ? `: ${selectedRule.scopeName}` : ""}), no solo los elegidos.`}
                </p>
              ) : null}
            </div>
          ) : null}

          {mode === "clear" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Saca el markup propio de {withOwnRule} producto(s): vuelven a tomar la regla general (marca, categoría o por defecto). El MUP de la lista SoundTube no se toca.
              </p>
              <Button variant="outline" disabled={pending} onClick={() => run(() => clearProductsMarkup(productIds), (n) => `Listo: ${n} markup(s) propio(s) quitado(s).`)}>
                Volver a la regla general
              </Button>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {done ? <p className="text-sm text-emerald-700">{done}</p> : null}
          {pending ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
