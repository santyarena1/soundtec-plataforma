"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR, TableEmpty } from "@/components/ui/table";
import {
  applySoundTubePriceList,
  previewSoundTubePriceList,
  type MissingDecision,
  type PriceListPreview,
} from "@/server/actions/soundtube-price-list";
import { MissingTable, type MissingAction, type MissingChoice } from "./_missing-table";

type Tab = "missing" | "matched" | "new" | "warnings";

const usd = (value: number) => `USD ${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toNumber = (value: string) => Number(value.replace(",", "."));
const SUSPICIOUS_RATIO = 3;
/** Marca cambios de costo grandes (posible error de tipeo en el Excel). */
const isSuspiciousChange = (oldCost: number, newCost: number) =>
  oldCost > 0 && (newCost / oldCost > SUSPICIOUS_RATIO || oldCost / newCost > SUSPICIOUS_RATIO);

function buildDecisions(
  preview: PriceListPreview,
  choices: Record<string, MissingChoice>
): { decisions: MissingDecision[]; error?: string } {
  const decisions: MissingDecision[] = [];
  for (const row of preview.missing) {
    const choice = choices[row.productId];
    if (!choice || choice.action === "keep") continue;
    if (choice.action === "deactivate") {
      decisions.push({ productId: row.productId, action: "deactivate" });
      continue;
    }
    const costUsd = toNumber(choice.costUsd);
    const mup = toNumber(choice.mup);
    if (!(costUsd > 0) || !(mup > 0) || mup > 20) {
      return { decisions, error: `Completá costo y MUP válidos para ${row.sku || row.name}.` };
    }
    decisions.push({ productId: row.productId, action: "price", costUsd, mup });
  }
  return { decisions };
}

export function SoundTubePriceListPanel() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PriceListPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, MissingChoice>>({});
  const [applyTaxonomy, setApplyTaxonomy] = useState(false);
  const [tab, setTab] = useState<Tab>("missing");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function formFor(selected: File) {
    const form = new FormData();
    form.set("file", selected);
    return form;
  }

  function review() {
    if (!file) return;
    setMessage(null);
    startTransition(async () => {
      const result = await previewSoundTubePriceList(formFor(file));
      if (!result.ok) {
        setPreview(null);
        setMessage({ ok: false, text: result.error });
        return;
      }
      setPreview(result);
      setChoices({});
      setTab(result.missing.length > 0 ? "missing" : "matched");
    });
  }

  function bulk(action: MissingAction) {
    if (!preview) return;
    setChoices((prev) => {
      const next = { ...prev };
      for (const row of preview.missing) {
        if (row.isActive) next[row.productId] = { action, costUsd: "", mup: "" };
      }
      return next;
    });
  }

  function apply() {
    if (!file || !preview) return;
    const { decisions, error } = buildDecisions(preview, choices);
    if (error) {
      setMessage({ ok: false, text: error });
      return;
    }
    const summary = `Se actualizan ${preview.matched.length} productos (costo + MUP)` +
      `${decisions.length ? ` y ${decisions.length} de los que quedan afuera` : ""}` +
      `${applyTaxonomy ? ", con la clasificación del Excel" : ""}. ¿Aplicar?`;
    if (!window.confirm(summary)) return;
    startTransition(async () => {
      const form = formFor(file);
      form.set("decisions", JSON.stringify(decisions));
      form.set("applyTaxonomy", String(applyTaxonomy));
      const result = await applySoundTubePriceList(form);
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      setMessage({
        ok: true,
        text: `Listo: ${result.updated} actualizados, ${result.deactivated} desactivados, ${result.priced} con precio manual.`,
      });
      setPreview(null);
      router.refresh();
    });
  }

  const tabs: Array<{ key: Tab; label: string; count: number }> = preview
    ? [
        { key: "missing", label: "Quedan afuera", count: preview.missing.length },
        { key: "matched", label: "Se actualizan", count: preview.matched.length },
        { key: "new", label: "No están en el sistema", count: preview.notInSystem.length },
        { key: "warnings", label: "Avisos", count: preview.warnings.length + preview.invalid.length },
      ]
    : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-5">
          <input
            type="file"
            accept=".xlsx,.xls"
            aria-label="Excel de la lista SoundTube"
            className="text-sm"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
          />
          <Button variant="outline" onClick={review} disabled={!file || pending}>
            {pending && !preview ? "Leyendo…" : "Revisar lista"}
          </Button>
        </CardContent>
      </Card>

      {message && (
        <p className={message.ok ? "text-sm text-emerald-600" : "text-sm text-destructive"}>{message.text}</p>
      )}

      {preview && (
        <>
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  tab === t.key ? "border-accent bg-accent/10" : "border-border hover:bg-secondary"
                }`}
              >
                <span className="block text-lg font-semibold">{t.count}</span>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "missing" && (
            <MissingTable
              rows={preview.missing}
              choices={choices}
              onChange={(id, choice) => setChoices((prev) => ({ ...prev, [id]: choice }))}
              onBulk={bulk}
            />
          )}

          {tab === "matched" && (
            <Table>
              <THead>
                <TR>
                  <TH>SKU</TH>
                  <TH>Marca</TH>
                  <TH>Costo actual</TH>
                  <TH>Costo nuevo</TH>
                  <TH>MUP</TH>
                  <TH>Precio venta</TH>
                  <TH>Clasificación Excel</TH>
                </TR>
              </THead>
              <TBody>
                {preview.matched.map((m) => (
                  <TR key={m.productId}>
                    <TD className="font-mono text-xs font-semibold">{m.sku}</TD>
                    <TD className="text-xs text-muted-foreground">{m.brand}</TD>
                    <TD className="whitespace-nowrap text-xs">{usd(m.oldCost)}</TD>
                    <TD
                      className={`whitespace-nowrap text-xs ${
                        isSuspiciousChange(m.oldCost, m.newCost)
                          ? "font-semibold text-destructive"
                          : m.oldCost !== m.newCost
                            ? "font-semibold"
                            : ""
                      }`}
                      title={isSuspiciousChange(m.oldCost, m.newCost) ? "Cambio de más de 3 veces: revisá el Excel" : undefined}
                    >
                      {usd(m.newCost)}
                    </TD>
                    <TD className="text-xs">×{m.mup}</TD>
                    <TD className="whitespace-nowrap text-xs">{usd(m.newCost * m.mup)}</TD>
                    <TD className="text-xs text-muted-foreground">
                      {[m.categoria, m.segmento, m.familia, m.tipo].filter(Boolean).join(" · ")}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}

          {tab === "new" && (
            <Table>
              <THead>
                <TR>
                  <TH>Fila</TH>
                  <TH>SKU</TH>
                  <TH>Descripción</TH>
                  <TH>Costo</TH>
                  <TH>MUP</TH>
                </TR>
              </THead>
              <TBody>
                {preview.notInSystem.length === 0 ? (
                  <TableEmpty message="Todos los SKUs del Excel existen en el sistema." />
                ) : (
                  preview.notInSystem.map((r) => (
                    <TR key={r.sku}>
                      <TD className="text-xs text-muted-foreground">{r.excelRow}</TD>
                      <TD className="font-mono text-xs font-semibold">{r.sku}</TD>
                      <TD className="text-xs">{r.description}</TD>
                      <TD className="whitespace-nowrap text-xs">{usd(r.costUsd)}</TD>
                      <TD className="text-xs">×{r.mup}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          )}

          {tab === "warnings" && (
            <ul className="space-y-1 text-xs">
              {preview.warnings.length + preview.invalid.length === 0 && (
                <li className="text-muted-foreground">Sin avisos.</li>
              )}
              {preview.warnings.map((w) => (
                <li key={w.sku}><span className="font-mono font-semibold">{w.sku}</span>: {w.message}</li>
              ))}
              {preview.invalid.map((i) => (
                <li key={`${i.excelRow}-${i.sku}`} className="text-destructive">
                  Fila {i.excelRow} <span className="font-mono">{i.sku}</span>: {i.reason} (no se carga)
                </li>
              ))}
            </ul>
          )}

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
              <label className="flex max-w-xl items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={applyTaxonomy}
                  onChange={(e) => setApplyTaxonomy(e.target.checked)}
                />
                <span>
                  Aplicar también la clasificación del Excel: CATEGORIA → Rubro, SEGMENTO → Subrubro, FAMILIA → Familia,
                  TIPO → Tipo. Crea los rubros y subrubros que no existan.
                </span>
              </label>
              <Button onClick={apply} disabled={pending}>
                {pending ? "Aplicando…" : "Aplicar lista"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
