"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import type { SyncPreviewResponse, SyncPreviewItem } from "@/app/api/admin/crestron-sync/route";

type Filter = "all" | "changes" | "unmatched";

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
  const [applyResult, setApplyResult] = useState<{ updated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("changes");
  const [showAll, setShowAll] = useState(false);

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
      const res = await fetch("/api/admin/crestron-sync", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Error al aplicar");
      setApplyResult({ updated: data.updated });
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setState("error");
    }
  }

  const filteredItems: SyncPreviewItem[] = (() => {
    if (!preview?.items) return [];
    if (filter === "changes")
      return preview.items.filter((i) => i.matched && (i.priceChanged || i.stockChanged || i.categoryChanged));
    if (filter === "unmatched")
      return preview.items.filter((i) => !i.matched);
    return preview.items.filter((i) => i.matched);
  })();

  // Unique products that have any change — a single product can have price + category + stock all changing
  const productsWithChanges = preview?.items
    ? preview.items.filter((i) => i.matched && (i.priceChanged || i.stockChanged || i.categoryChanged)).length
    : 0;

  const displayedItems = showAll ? filteredItems : filteredItems.slice(0, 50);

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
              Sincronización aplicada: {applyResult.updated} productos actualizados.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Preview results */}
      {(state === "preview" || state === "applying" || state === "done") && preview && (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "En Crestron", value: preview.total ?? 0, color: "" },
              { label: "Coinciden en BD", value: preview.matchedCount ?? 0, color: "text-success" },
              { label: "Cambios de precio", value: preview.priceChanges ?? 0, color: "text-warning" },
              { label: "Cambios de categoría", value: preview.categoryChanges ?? 0, color: "text-accent" },
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

          {/* Apply button */}
          {state === "preview" && productsWithChanges > 0 && (
            <div className="flex flex-wrap justify-end items-center gap-3">
              <p className="text-xs text-muted-foreground">
                {productsWithChanges} producto{productsWithChanges === 1 ? "" : "s"}
                {" · "}
                {preview.priceChanges ?? 0} precio · {preview.categoryChanges ?? 0} categoría · {preview.stockChanges ?? 0} stock
              </p>
              <Button onClick={handleApply} disabled={state !== "preview"}>
                Actualizar {productsWithChanges} producto{productsWithChanges === 1 ? "" : "s"}
              </Button>
            </div>
          )}

          {/* Filter tabs */}
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
                          <th className="px-4 py-2.5">Categoría</th>
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
                              {item.category || "—"}
                              {item.categoryChanged && item.currentCategory && (
                                <span className="block text-[10px] text-muted-foreground line-through">
                                  {item.currentCategory}
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
