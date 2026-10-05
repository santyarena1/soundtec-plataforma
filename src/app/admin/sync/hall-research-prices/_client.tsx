"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR, TableEmpty } from "@/components/ui/table";
import {
  applyHallResearchPriceList,
  previewHallResearchPriceList,
  type HallMissingDecision,
  type HallPriceListPreview,
} from "@/server/actions/hall-research-price-list";
import { MissingTable, type MissingAction, type MissingChoice } from "./_missing-table";

type Tab = "missing" | "matched" | "new" | "warnings";

const usd = (value: number | null | undefined) =>
  value == null ? "—" : `USD ${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toNumber = (value: string) => Number(value.replace(",", "."));
const SUSPICIOUS_RATIO = 3;
/** Marca cambios de costo grandes (posible error en el Excel). */
const isSuspiciousChange = (oldCost: number, newCost: number) =>
  oldCost > 0 && (newCost / oldCost > SUSPICIOUS_RATIO || oldCost / newCost > SUSPICIOUS_RATIO);

function buildDecisions(
  preview: HallPriceListPreview,
  choices: Record<string, MissingChoice>
): { decisions: HallMissingDecision[]; error?: string } {
  const decisions: HallMissingDecision[] = [];
  for (const row of preview.missing) {
    const choice = choices[row.productId];
    if (!choice || choice.action === "keep") continue;
    if (choice.action === "deactivate") {
      decisions.push({ productId: row.productId, action: "deactivate" });
      continue;
    }
    const costUsd = toNumber(choice.costUsd);
    if (!(costUsd > 0)) return { decisions, error: `Completá un costo válido para ${row.sku}.` };
    decisions.push({ productId: row.productId, action: "price", costUsd });
  }
  return { decisions };
}

export function HallResearchPriceListPanel() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<HallPriceListPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, MissingChoice>>({});
  const [createNew, setCreateNew] = useState(true);
  const [reactivate, setReactivate] = useState(true);
  const [tab, setTab] = useState<Tab>("matched");
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
      const result = await previewHallResearchPriceList(formFor(file));
      if (!result.ok) {
        setPreview(null);
        setMessage({ ok: false, text: result.error });
        return;
      }
      setPreview(result);
      setChoices({});
      setTab(result.missing.length > 0 ? "missing" : result.toCreate.length > 0 && result.matched.length === 0 ? "new" : "matched");
    });
  }

  function bulk(action: MissingAction) {
    if (!preview) return;
    setChoices((prev) => {
      const next = { ...prev };
      for (const row of preview.missing) {
        if (row.isActive) next[row.productId] = { action, costUsd: "" };
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
    const parts = [
      `${preview.matched.length} productos actualizan costo y MSRP`,
      createNew && preview.toCreate.length ? `${preview.toCreate.length} productos nuevos se crean` : "",
      decisions.length ? `${decisions.length} de los que quedan afuera cambian` : "",
    ].filter(Boolean);
    if (!window.confirm(`${parts.join(", ")}. ¿Aplicar?`)) return;
    startTransition(async () => {
      const form = formFor(file);
      form.set("decisions", JSON.stringify(decisions));
      form.set("createNew", String(createNew));
      form.set("reactivate", String(reactivate));
      const result = await applyHallResearchPriceList(form);
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      setMessage({
        ok: true,
        text:
          `Listo: ${result.updated} actualizados, ${result.created} creados, ${result.deactivated} desactivados, ` +
          `${result.priced} con costo manual, ${result.reactivated} reactivados.`,
      });
      setPreview(null);
      router.refresh();
    });
  }

  const warningCount = preview ? preview.invalid.length + preview.duplicates.length + preview.unknownBrands.length : 0;
  const tabs: Array<{ key: Tab; label: string; count: number }> = preview
    ? [
        { key: "missing", label: "Quedan afuera", count: preview.missing.length },
        { key: "matched", label: "Actualizan precio", count: preview.matched.length },
        { key: "new", label: "Productos nuevos", count: preview.toCreate.length },
        { key: "warnings", label: "Avisos", count: warningCount },
      ]
    : [];
  const changedCount = preview?.matched.filter((m) => m.changed).length ?? 0;
  const inactiveMatched = preview?.matched.filter((m) => !m.isActive).length ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-5">
          <input
            type="file"
            accept=".xlsx,.xls"
            aria-label="Excel de la lista Hall Research"
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
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {changedCount} con cambios de costo o MSRP. De estos productos solo se actualizan costo y MSRP: descripciones,
                fotos, categoría y demás datos no se tocan.
              </p>
              <Table>
                <THead>
                  <TR>
                    <TH>SKU</TH>
                    <TH>Marca</TH>
                    <TH>Costo actual</TH>
                    <TH>Costo nuevo</TH>
                    <TH>MSRP actual</TH>
                    <TH>MSRP nuevo</TH>
                    <TH>Estado</TH>
                  </TR>
                </THead>
                <TBody>
                  {preview.matched.length === 0 ? (
                    <TableEmpty message="Ningún producto de la lista existe todavía en el sistema." />
                  ) : (
                    preview.matched.map((m) => (
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
                        <TD className="whitespace-nowrap text-xs text-muted-foreground">{usd(m.oldMsrp)}</TD>
                        <TD className="whitespace-nowrap text-xs text-muted-foreground">{usd(m.newMsrp)}</TD>
                        <TD className="text-xs">{m.isActive ? "Activo" : "Inactivo"}</TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </div>
          )}

          {tab === "new" && (
            <Table>
              <THead>
                <TR>
                  <TH>SKU</TH>
                  <TH>Marca</TH>
                  <TH>Categoría</TH>
                  <TH>Descripción</TH>
                  <TH>Costo</TH>
                  <TH>MSRP</TH>
                  <TH>Foto</TH>
                </TR>
              </THead>
              <TBody>
                {preview.toCreate.length === 0 ? (
                  <TableEmpty message="No hay productos nuevos en la lista." />
                ) : (
                  preview.toCreate.map((r) => (
                    <TR key={r.sku}>
                      <TD className="font-mono text-xs font-semibold">{r.sku}</TD>
                      <TD className="text-xs text-muted-foreground">{r.brand}</TD>
                      <TD className="text-xs">{r.category ?? "—"}</TD>
                      <TD className="max-w-xs truncate text-xs" title={r.description}>{r.description ?? "—"}</TD>
                      <TD className="whitespace-nowrap text-xs">{usd(r.costUsd)}</TD>
                      <TD className="whitespace-nowrap text-xs text-muted-foreground">{usd(r.msrpUsd)}</TD>
                      <TD className="text-xs">{r.hasImage ? "Sí" : "—"}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          )}

          {tab === "warnings" && (
            <ul className="space-y-1 text-xs">
              {warningCount === 0 && <li className="text-muted-foreground">Sin avisos.</li>}
              {preview.unknownBrands.map((b) => (
                <li key={b} className="text-destructive">
                  Marca «{b}»: no es del grupo Hall Research, sus filas no se cargan.
                </li>
              ))}
              {preview.duplicates.map((sku) => (
                <li key={`dup-${sku}`}>
                  <span className="font-mono font-semibold">{sku}</span>: SKU repetido, se usa la primera fila.
                </li>
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
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-xs">
                  <input type="checkbox" className="mt-0.5" checked={createNew} onChange={(e) => setCreateNew(e.target.checked)} />
                  <span>Crear los productos nuevos con los datos de la lista (marca, categoría, descripciones, medidas y foto).</span>
                </label>
                {inactiveMatched > 0 && (
                  <label className="flex items-start gap-2 text-xs">
                    <input type="checkbox" className="mt-0.5" checked={reactivate} onChange={(e) => setReactivate(e.target.checked)} />
                    <span>Reactivar los {inactiveMatched} productos inactivos que volvieron a la lista.</span>
                  </label>
                )}
              </div>
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
