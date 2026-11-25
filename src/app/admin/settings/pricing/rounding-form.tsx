"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { roundPrice, validateRoundingConfig, type PriceRoundingConfig, type RoundingMode } from "@/lib/price-rounding";
import { proposeRoundingAction, saveRoundingDraftAction } from "@/server/actions/price-rounding";

interface Row {
  key: number;
  fromUsd: string;
  toUsd: string;
  step: string;
}

interface Props {
  /** Lo que se edita (borrador guardado o los tramos iniciales). */
  draft: PriceRoundingConfig;
  /** Lo que usan hoy los precios (null = sin redondeo). */
  active: PriceRoundingConfig | null;
  pendingReviews: Array<{ id: string; title: string; affectedProducts: number }>;
}

const EXAMPLES = [7.43, 24.12, 79.62, 212.3, 640.1, 1834.4];

const toText = (n: number) => String(n).replace(".", ",");
const toNum = (text: string) => {
  const clean = text.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  return clean ? Number(clean) : NaN;
};
const usd = (n: number) => `US$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let rowKey = 0;
function rowsFrom(config: PriceRoundingConfig): Row[] {
  return config.tiers.map((t) => ({ key: ++rowKey, fromUsd: toText(t.fromUsd), toUsd: toText(t.toUsd), step: toText(t.step) }));
}

/**
 * Tramos de redondeo del precio de venta. Guardar el borrador no mueve
 * precios; activarlos (o cambiarlos) pasa por Revisión de cambios de precio
 * con la lista de productos afectados antes de aplicar.
 */
export function RoundingForm({ draft, active, pendingReviews }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(draft));
  const [mode, setMode] = useState<RoundingMode>(draft.mode);
  const [enabled, setEnabled] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string; reviewId?: string } | null>(null);
  const [pending, start] = useTransition();

  const config = useMemo<PriceRoundingConfig>(
    () => ({
      enabled,
      mode,
      tiers: rows.map((r) => ({ fromUsd: toNum(r.fromUsd), toUsd: toNum(r.toUsd), step: toNum(r.step) })),
    }),
    [enabled, mode, rows]
  );
  const validation = validateRoundingConfig(config);

  function update(key: number, field: keyof Omit<Row, "key">, value: string) {
    setMessage(null);
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    const last = rows[rows.length - 1];
    const from = last ? toNum(last.toUsd) + 0.01 : 0;
    setRows((prev) => [...prev, { key: ++rowKey, fromUsd: toText(Number(from.toFixed(2))), toUsd: "", step: "1" }]);
  }

  function run(kind: "draft" | "review", next: PriceRoundingConfig) {
    setMessage(null);
    const checked = validateRoundingConfig(next);
    if (!checked.ok) return setMessage({ ok: false, text: checked.error });
    start(async () => {
      if (kind === "draft") {
        const result = await saveRoundingDraftAction(checked.config);
        setMessage(result.ok ? { ok: true, text: "Borrador guardado. Los precios no cambiaron." } : { ok: false, text: result.error });
      } else {
        const result = await proposeRoundingAction(checked.config);
        if (!result.ok) return setMessage({ ok: false, text: result.error });
        setMessage({
          ok: true,
          reviewId: result.reviewId,
          text: `Quedó en Revisión de cambios: mueve el precio de ${result.affectedProducts} producto${result.affectedProducts === 1 ? "" : "s"}. No se aplica hasta que se apruebe.`,
        });
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5" aria-labelledby="rounding-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="rounding-title" className="text-sm font-semibold">
            Redondeo del precio de venta
          </h3>
          <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
            Lleva el precio final en USD (y el de lista) a valores redondos según en qué tramo cae. Se aplica en un solo lugar de la cadena de
            precios, así que catálogo, ficha, cotizaciones, listas compartibles, exportaciones y PDF muestran lo mismo. El precio en pesos sale del
            USD ya redondeado.
          </p>
        </div>
        {active ? (
          <Badge tone="success">Vigente · {active.mode === "up" ? "hacia arriba" : "al más cercano"}</Badge>
        ) : (
          <Badge tone="muted">Desactivado: los precios no se redondean</Badge>
        )}
      </div>

      {pendingReviews.length ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          Pendiente de aprobación:{" "}
          {pendingReviews.map((r, i) => (
            <span key={r.id}>
              {i ? " · " : ""}
              <Link href={`/admin/price-reviews/${r.id}`} className="font-medium underline underline-offset-2">
                {r.title}
              </Link>{" "}
              ({r.affectedProducts} productos)
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <caption className="sr-only">Tramos de redondeo</caption>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="pb-1 pr-2 font-semibold">Desde USD</th>
                  <th className="pb-1 pr-2 font-semibold">Hasta USD</th>
                  <th className="pb-1 pr-2 font-semibold">Paso</th>
                  <th className="pb-1 font-semibold">
                    <span className="sr-only">Quitar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.key}>
                    <td className="py-1 pr-2">
                      <Input aria-label={`Tramo ${index + 1}: desde`} inputMode="decimal" value={row.fromUsd} onChange={(e) => update(row.key, "fromUsd", e.target.value)} />
                    </td>
                    <td className="py-1 pr-2">
                      <Input aria-label={`Tramo ${index + 1}: hasta`} inputMode="decimal" value={row.toUsd} onChange={(e) => update(row.key, "toUsd", e.target.value)} />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        aria-label={`Tramo ${index + 1}: paso (0 = sin redondeo)`}
                        inputMode="decimal"
                        value={row.step}
                        onChange={(e) => update(row.key, "step", e.target.value)}
                        placeholder="0 = sin redondeo"
                      />
                    </td>
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Quitar tramo ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> Agregar tramo
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Paso 0 = ese tramo no se redondea. Un precio que queda por encima del último «hasta» no se redondea. «Hasta» es inclusive: 50,00 cae en el
            tramo que termina en 50.
          </p>
        </div>

        <div className="space-y-3 rounded-lg bg-secondary/40 p-3 text-xs">
          <div>
            <Label htmlFor="roundingMode">Cómo redondea</Label>
            <Select id="roundingMode" value={mode} onChange={(e) => setMode(e.target.value as RoundingMode)}>
              <option value="up">Hacia arriba (al próximo múltiplo del paso)</option>
              <option value="nearest">Al más cercano (la mitad redondea para arriba)</option>
            </Select>
          </div>
          <div>
            <p className="font-semibold">Ejemplos con estos tramos</p>
            {validation.ok ? (
              <ul className="mt-1 space-y-0.5 tabular-nums">
                {EXAMPLES.map((price) => (
                  <li key={price} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{usd(price)}</span>
                    <span>→ {usd(roundPrice(price, { ...validation.config, enabled: true }))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 flex items-start gap-1 text-destructive">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {validation.error}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" disabled={pending || !validation.ok} onClick={() => run("draft", config)}>
          Guardar tramos (sin aplicar)
        </Button>
        <Button
          type="button"
          disabled={pending || !validation.ok}
          onClick={() => {
            setEnabled(true);
            run("review", { ...config, enabled: true });
          }}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {active ? "Mandar cambios a revisión" : "Activar: mandar a revisión de precios"}
        </Button>
        {active ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setEnabled(false);
              run("review", { ...config, enabled: false });
            }}
          >
            Desactivar (pasa por revisión)
          </Button>
        ) : null}
      </div>
      {message ? (
        <p className={`mt-2 flex items-center gap-1 text-xs ${message.ok ? "text-success" : "text-destructive"}`} role="status">
          {message.ok ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <AlertCircle className="h-3 w-3 shrink-0" />}
          {message.text}
          {message.reviewId ? (
            <Link href={`/admin/price-reviews/${message.reviewId}`} className="ml-1 font-medium underline underline-offset-2">
              Ver lista de productos
            </Link>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
