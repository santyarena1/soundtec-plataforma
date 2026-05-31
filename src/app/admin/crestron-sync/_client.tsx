"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Languages,
} from "lucide-react";
import type {
  SyncPreviewResponse,
  CategoryTarget,
} from "@/app/api/admin/crestron-sync/route";

type Filter = "all" | "changes" | "unmatched";

const TARGET_LABELS: Record<CategoryTarget, string> = {
  categoria: "Categoría (FK)",
  familia: "Familia (FK)",
  rubro: "Rubro (texto familia)",
  subrubro: "Subrubro (texto tipo)",
};

const TARGET_HELP: Record<CategoryTarget, string> = {
  categoria: "Crea o reusa filas en Categorías y la asigna al producto.",
  familia: "Crea o reusa filas en Familias y la asigna al producto.",
  rubro: "Escribe el valor traducido directo en el campo libre familia.",
  subrubro: "Escribe el valor traducido directo en el campo libre tipo.",
};

function stockBadge(status: string) {
  const map: Record<string, { tone: "success" | "warning" | "destructive" | "muted"; label: string }> = {
    IN_STOCK: { tone: "success", label: "En stock" },
    LOW_STOCK: { tone: "warning", label: "Poco stock" },
    OUT_OF_STOCK: { tone: "destructive", label: "Sin stock" },
    ON_REQUEST: { tone: "muted", label: "A pedido" },
    UNKNOWN: { tone: "muted", label: "Desconocido" },
  };
  const s = map[status] ?? { tone: "muted" as "muted", label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function fmtPrice(p: number | null) {
  if (p == null) return "—";
  return `$ ${p.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CrestronSyncPanel({ hasCredentials }: { hasCredentials: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "preview" | "applying" | "done" | "error">("idle");
  const [preview, setPreview] = useState<SyncPreviewResponse | null>(null);
  const [applyResult, setApplyResult] = useState<{ updated: number; categoryWrites: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("changes");
  const [showAll, setShowAll] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<CategoryTarget>("rubro");

  // Hydrate translations and target when a preview arrives
  useEffect(() => {
    if (!preview) return;
    const base: Record<string, string> = { ...(preview.translations ?? {}) };
    for (const c of preview.uniqueCategories ?? []) {
      if (!(c in base)) base[c] = "";
    }
    setTranslations(base);
    if (preview.target) setTarget(preview.target);
  }, [preview]);

  async function handlePreview() {
    setState("loading");
    setError(null);
    setPreview(null);
    setApplyResult(null);
    try {
      const res = await fetch("/api/admin/crestron-sync");
      const data: SyncPreviewResponse = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Error al obtener preview");
      setPreview(data);
      setState("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setState("error");
    }
  }

  async function handleApply() {
    setState("applying");
    setError(null);
    try {
      const res = await fetch("/api/admin/crestron-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translations, target }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Error al aplicar");
      setApplyResult({ updated: data.updated, categoryWrites: data.categoryWrites ?? 0 });
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setState("error");
    }
  }

  // categoryChanged is computed client-side from translations + target
  const itemsWithComputed = useMemo(() => {
    if (!preview?.items) return [];
    return preview.items.map((i) => {
      const es = (translations[i.category] ?? "").trim();
      const categoryChanged =
        i.matched && es.length > 0 && (i.currentCategoryLabel ?? "").trim() !== es;
      return { ...i, esCategory: es, categoryChanged };
    });
  }, [preview, translations]);

  const filteredItems = useMemo(() => {
    if (filter === "changes")
      return itemsWithComputed.filter(
        (i) => i.matched && (i.priceChanged || i.stockChanged || i.categoryChanged)
      );
    if (filter === "unmatched") return itemsWithComputed.filter((i) => !i.matched);
    return itemsWithComputed.filter((i) => i.matched);
  }, [itemsWithComputed, filter]);

  const productsWithChanges = itemsWithComputed.filter(
    (i) => i.matched && (i.priceChanged || i.stockChanged || i.categoryChanged)
  ).length;
  const categoryChanges = itemsWithComputed.filter((i) => i.categoryChanged).length;

  const displayedItems = showAll ? filteredItems : filteredItems.slice(0, 50);
  const untranslatedCount = (preview?.uniqueCategories ?? []).filter(
    (c) => !translations[c]?.trim()
  ).length;

  return (
    <div className="space-y-4">
      {/* Info card */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Fuente: crestronlatam.xtrabone.mx</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                1. Vista previa muestra qué cambiaría sin guardar nada.{" "}
                2. Confirmás para aplicar solo a productos con SKU coincidente.
              </p>
            </div>
            <Button
              onClick={handlePreview}
              disabled={!hasCredentials || state === "loading" || state === "applying"}
              size="sm"
              title={!hasCredentials ? "Configurá las credenciales primero" : undefined}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${state === "loading" ? "animate-spin" : ""}`} />
              {state === "loading" ? "Obteniendo datos…" : "Previsualizar sincronización"}
            </Button>
          </div>
          {!hasCredentials && (
            <p className="text-xs text-warning">
              Configurá el usuario y contraseña arriba antes de sincronizar.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {state === "error" && error && (
        <Card>
          <CardContent className="p-4 flex items-start gap-2 text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Apply success */}
      {state === "done" && applyResult && (
        <Card>
          <CardContent className="p-4 flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <p className="text-sm font-medium">
              Sincronización aplicada: {applyResult.updated} productos actualizados
              {applyResult.categoryWrites > 0 && ` · ${applyResult.categoryWrites} con categoría escrita`}.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Preview results */}
      {(state === "preview" || state === "applying" || state === "done") && preview && (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "En Crestron", value: preview.total ?? 0, color: "" },
              { label: "Coinciden en BD", value: preview.matchedCount ?? 0, color: "text-success" },
              { label: "Cambios de precio", value: preview.priceChanges ?? 0, color: "text-warning" },
              { label: "Sin coincidencia", value: preview.unmatchedCount ?? 0, color: "text-muted-foreground" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4 text-center">
                  <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Categories config */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start gap-2">
                <Languages className="h-4 w-4 mt-0.5 text-accent shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium">Categorías de Crestron</h3>
                  <p className="text-xs text-muted-foreground">
                    Traducí cada grupo al español y elegí dónde guardarlo. Se guarda al aplicar.
                  </p>
                </div>
              </div>

              {/* Target selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted-foreground">
                  Guardar como
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(TARGET_LABELS) as CategoryTarget[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTarget(t)}
                      className={`px-3 py-2 rounded-md border text-left text-xs transition-colors ${
                        target === t
                          ? "border-primary bg-primary/8 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      <p className="font-medium">{TARGET_LABELS[t]}</p>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">{TARGET_HELP[target]}</p>
              </div>

              {/* Translation table */}
              {(preview.uniqueCategories ?? []).length > 0 ? (
                <div className="border border-border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Original (Crestron · EN)</th>
                        <th className="px-3 py-2 text-left font-medium">Traducción (ES)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(preview.uniqueCategories ?? []).map((c) => (
                        <tr key={c}>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground">{c}</td>
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              value={translations[c] ?? ""}
                              onChange={(e) =>
                                setTranslations((prev) => ({ ...prev, [c]: e.target.value }))
                              }
                              placeholder="Escribí la traducción…"
                              className="h-7 w-full rounded border border-border bg-background px-2 text-xs"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No se detectaron categorías en los datos de Crestron.
                </p>
              )}

              {untranslatedCount > 0 && (
                <p className="text-[11px] text-warning">
                  {untranslatedCount} categoría{untranslatedCount === 1 ? "" : "s"} sin traducir — no se escribirán en los productos.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Apply button */}
          {state === "preview" && productsWithChanges > 0 && (
            <div className="flex flex-wrap justify-end items-center gap-3">
              <p className="text-xs text-muted-foreground">
                {productsWithChanges} producto{productsWithChanges === 1 ? "" : "s"}
                {" · "}
                {preview.priceChanges ?? 0} precio · {categoryChanges} categoría · {preview.stockChanges ?? 0} stock
              </p>
              <Button onClick={handleApply} disabled={state !== "preview"}>
                Actualizar {productsWithChanges} producto{productsWithChanges === 1 ? "" : "s"}
              </Button>
            </div>
          )}

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="flex border-b border-border px-4 pt-3 gap-3 text-sm">
                {(
                  [
                    { key: "changes", label: `Con cambios (${productsWithChanges})` },
                    { key: "all", label: `Todos coincidentes (${preview.matchedCount ?? 0})` },
                    { key: "unmatched", label: `Sin coincidencia (${preview.unmatchedCount ?? 0})` },
                  ] as { key: Filter; label: string }[]
                ).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => { setFilter(t.key); setShowAll(false); }}
                    className={`pb-2 border-b-2 transition-colors ${
                      filter === t.key
                        ? "border-primary text-foreground font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {filteredItems.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {filter === "changes" ? "Sin cambios detectados." : "Sin resultados."}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border bg-muted/40">
                        <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                          <th className="px-4 py-2.5">SKU</th>
                          <th className="px-4 py-2.5">Nombre Crestron</th>
                          {filter !== "unmatched" && <th className="px-4 py-2.5">Producto en BD</th>}
                          <th className="px-4 py-2.5">Categoría (ES)</th>
                          <th className="px-4 py-2.5 text-right">Precio actual</th>
                          <th className="px-4 py-2.5 text-right">Precio nuevo</th>
                          <th className="px-4 py-2.5">Stock LAREDO</th>
                          <th className="px-4 py-2.5">Stock MIAMI</th>
                          <th className="px-4 py-2.5">Nuevo estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {displayedItems.map((item) => (
                          <tr key={item.itemCode} className="hover:bg-muted/20">
                            <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                              {item.itemCode}
                            </td>
                            <td className="px-4 py-2.5 max-w-[180px] text-xs">{item.itemName}</td>
                            {filter !== "unmatched" && (
                              <td className="px-4 py-2.5 max-w-[180px] text-xs text-muted-foreground">
                                {item.productName ?? (
                                  <span className="text-destructive/70 italic">no encontrado</span>
                                )}
                              </td>
                            )}
                            <td className={`px-4 py-2.5 text-xs ${item.categoryChanged ? "text-accent font-medium" : "text-muted-foreground"}`}>
                              {item.esCategory || (item.category ? <span className="italic text-muted-foreground">sin traducir ({item.category})</span> : "—")}
                              {item.categoryChanged && item.currentCategoryLabel && (
                                <span className="block text-[10px] text-muted-foreground line-through">
                                  {item.currentCategoryLabel}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                              {fmtPrice(item.currentPrice)}
                            </td>
                            <td className={`px-4 py-2.5 text-right tabular-nums text-xs font-medium ${item.priceChanged ? "text-warning" : ""}`}>
                              {fmtPrice(item.newPrice)}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.laredo}</td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.miami}</td>
                            <td className="px-4 py-2.5">{stockBadge(item.newStockStatus)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {filteredItems.length > 50 && (
                    <div className="border-t border-border px-4 py-2 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Mostrando {displayedItems.length} de {filteredItems.length}
                      </p>
                      <button
                        onClick={() => setShowAll((v) => !v)}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        {showAll ? (
                          <><ChevronUp className="h-3 w-3" /> Mostrar menos</>
                        ) : (
                          <><ChevronDown className="h-3 w-3" /> Ver todos ({filteredItems.length})</>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
