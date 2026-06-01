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
  Sparkles,
  Loader2,
} from "lucide-react";
import type {
  SonancePreviewResponse,
  SonancePreviewItem,
  CategoryTarget,
} from "@/app/api/admin/sonance-import/route";

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

type Filter = "changes" | "new" | "matched" | "all";
type Tone = "success" | "warning" | "destructive" | "muted" | "accent";

function brandTone(brand: string): Tone {
  if (brand === "SONANCE") return "accent";
  if (brand === "IPORT") return "success";
  if (brand === "JAMES") return "destructive";
  if (brand.includes("BLAZE")) return "warning";
  return "muted";
}

function fmtPrice(p: number | null) {
  if (p == null) return "—";
  return `$ ${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SonanceImportPanel({ hasPortal }: { hasPortal: boolean }) {
  const [state, setState] = useState<
    "idle" | "loading" | "preview" | "applying" | "done" | "error"
  >("idle");
  const [hydrating, setHydrating] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [preview, setPreview] = useState<SonancePreviewResponse | null>(null);
  const [applyResult, setApplyResult] = useState<{
    updated: number;
    created: number;
    categoryWrites?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("changes");
  const [createNew, setCreateNew] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<CategoryTarget>("rubro");
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  // Inspector de campos API (qué columnas trae mySonance)
  const [inspectSku, setInspectSku] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const [inspectResult, setInspectResult] = useState<{
    flat: Array<{ path: string; type: string; sample: string }>;
    totalPaths: number;
    attrTypeLabels: Array<{ label: string; values: string[] }>;
    documentSummary: Array<{ name: string; type: string }>;
    accessoryTotal: number;
    accessorySummary: Array<{ sku: string; name: string; price: number | null }>;
  } | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);

  // DB columns disponibles para mapping
  const [dbColumns, setDbColumns] = useState<Array<{
    field: string;
    type: string;
    description: string;
    coveragePercent?: number;
  }> | null>(null);
  const [dbColumnsLoading, setDbColumnsLoading] = useState(false);

  async function loadDbColumns() {
    setDbColumnsLoading(true);
    try {
      const res = await fetch("/api/admin/sonance-import/db-columns");
      const data = await res.json();
      if (data.ok) setDbColumns(data.columns);
    } catch { /* ignore */ } finally {
      setDbColumnsLoading(false);
    }
  }

  // Sync full (batched: init listing + N detail batches con progreso)
  const [fullSync, setFullSync] = useState<{
    phase: "init" | "detail" | "done";
    total: number;
    processed: number;
  } | null>(null);
  const [fullSyncCancelRef] = useState<{ canceled: boolean }>({ canceled: false });

  async function runInspect() {
    if (!inspectSku.trim()) return;
    setInspecting(true);
    setInspectError(null);
    setInspectResult(null);
    try {
      const res = await fetch(
        `/api/admin/sonance-import/inspect?sku=${encodeURIComponent(inspectSku.trim())}`
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Error al inspeccionar");
      setInspectResult(data);
    } catch (e) {
      setInspectError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setInspecting(false);
    }
  }

  // Enriquecimiento (rich data desde my.sonance.com).
  // enrichTranslate default false: la IA solo corre si el usuario tilda explícitamente.
  const [enriching, setEnriching] = useState(false);
  const [enrichTranslate, setEnrichTranslate] = useState(false);
  const [enrichForce, setEnrichForce] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{
    done: number;
    total: number;
    updated: number;
    withImages: number;
    withSpecs: number;
    withDocs: number;
    withAccessories: number;
    withTranslations: number;
  } | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [enrichDone, setEnrichDone] = useState(false);
  const [enrichCancelRef] = useState<{ canceled: boolean }>({ canceled: false });

  // Hydrate translations + target when a preview arrives
  useEffect(() => {
    if (!preview) return;
    const base: Record<string, string> = { ...(preview.translations ?? {}) };
    for (const c of preview.uniqueCategories ?? []) {
      if (!(c in base)) base[c] = "";
    }
    setTranslations(base);
    if (preview.target) setTarget(preview.target);
    const sa = (preview as SonancePreviewResponse & { savedAt?: string }).savedAt;
    setSavedAt(typeof sa === "string" ? sa : null);
  }, [preview]);

  // On mount: try to load the last saved sync payload so the user can resume
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [pRes, sRes] = await Promise.all([
          fetch("/api/admin/sonance-import?cached=1"),
          fetch("/api/admin/sonance-import/state"),
        ]);
        if (mounted && pRes.ok) {
          const data = (await pRes.json()) as SonancePreviewResponse;
          if (data.ok) {
            setPreview(data);
            setState("preview");
          }
        }
        if (mounted && sRes.ok) {
          const sdata = await sRes.json();
          if (typeof sdata?.createNew === "boolean") setCreateNew(sdata.createNew);
        }
      } catch { /* ignore */ } finally {
        if (mounted) setHydrating(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Debounced auto-save of in-flight state to AdminSetting
  useEffect(() => {
    if (hydrating || !preview) return;
    const t = setTimeout(() => {
      void fetch("/api/admin/sonance-import/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translations, target, createNew }),
      });
    }, 600);
    return () => clearTimeout(t);
  }, [translations, target, createNew, hydrating, preview]);

  async function handleSync() {
    setState("loading");
    setError(null);
    setPreview(null);
    setApplyResult(null);
    setFullSync(null);
    fullSyncCancelRef.canceled = false;

    try {
      // Fase 1: listing — fetch básico + preview
      const res = await fetch("/api/admin/sonance-import");
      const data: SonancePreviewResponse = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Error al sincronizar");
      setPreview(data);
      setState("preview");

      // Fase 2: detail completo en batches (todos los ~113 campos por producto)
      // Esto NO usa OpenAI — solo descarga del portal.
      const initRes = await fetch("/api/admin/sonance-import/sync-full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init: true }),
      });
      const initData = await initRes.json();
      if (!initData.ok) {
        setError(initData.error ?? "Falló la inicialización de detalle");
        return;
      }
      setFullSync({ phase: "init", total: initData.totalProducts ?? 0, processed: 0 });

      // Loop de batches
      let offset = 0;
      while (!fullSyncCancelRef.canceled) {
        const r = await fetch("/api/admin/sonance-import/sync-full", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, batchSize: 25 }),
        });
        const d = await r.json();
        if (!d.ok) {
          setError(d.error ?? "Falló batch de detalle");
          break;
        }
        const processed = d.processedDetail ?? offset;
        setFullSync({
          phase: d.phase,
          total: d.totalDetail ?? initData.totalProducts ?? 0,
          processed,
        });
        if (d.done || d.nextOffset === null) break;
        offset = d.nextOffset;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setState("error");
    }
  }

  function cancelFullSync() {
    fullSyncCancelRef.canceled = true;
  }

  async function handleApply() {
    if (!preview?.items) return;
    setState("applying");
    setError(null);
    try {
      const res = await fetch("/api/admin/sonance-import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: preview.items, createNew, translations, target }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Error al aplicar");
      setApplyResult({
        updated: data.updated,
        created: data.created,
        categoryWrites: data.categoryWrites,
      });
      // El servidor ya borró el cached payload — limpiar UI también
      setPreview(null);
      setSavedAt(null);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setState("error");
    }
  }

  async function handleAutoTranslate(onlyMissing: boolean) {
    if (!preview?.uniqueCategories?.length) return;
    setTranslating(true);
    setTranslateError(null);
    try {
      const items = onlyMissing
        ? preview.uniqueCategories.filter((c) => !(translations[c] ?? "").trim())
        : preview.uniqueCategories;
      if (items.length === 0) {
        setTranslating(false);
        return;
      }
      const res = await fetch("/api/admin/sonance-import/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Error al traducir");
      setTranslations((prev) => ({ ...prev, ...(data.translations ?? {}) }));
    } catch (e) {
      setTranslateError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setTranslating(false);
    }
  }

  async function runEnrich() {
    setEnriching(true);
    setEnrichError(null);
    setEnrichDone(false);
    setEnrichProgress({
      done: 0,
      total: 0,
      updated: 0,
      withImages: 0,
      withSpecs: 0,
      withDocs: 0,
      withAccessories: 0,
      withTranslations: 0,
    });
    enrichCancelRef.canceled = false;
    try {
      let offset = 0;
      let total = 0;
      const acc = {
        updated: 0,
        withImages: 0,
        withSpecs: 0,
        withDocs: 0,
        withAccessories: 0,
        withTranslations: 0,
      };
      while (!enrichCancelRef.canceled) {
        const res = await fetch("/api/admin/sonance-import/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            translate: enrichTranslate,
            force: enrichForce,
            batchSize: 20,
            offset,
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error ?? "Error al enriquecer");
        total = data.totalTargets ?? 0;
        acc.updated += data.updated ?? 0;
        acc.withImages += data.withImages ?? 0;
        acc.withSpecs += data.withSpecs ?? 0;
        acc.withDocs += data.withDocs ?? 0;
        acc.withAccessories += data.withAccessories ?? 0;
        acc.withTranslations += data.withTranslations ?? 0;
        const newDone = data.nextOffset ?? total;
        setEnrichProgress({ done: newDone, total, ...acc });
        if (data.done || data.nextOffset === null) break;
        offset = data.nextOffset;
      }
      setEnrichDone(true);
    } catch (e) {
      setEnrichError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setEnriching(false);
    }
  }

  function cancelEnrich() {
    enrichCancelRef.canceled = true;
  }

  const itemsWithComputed = useMemo(() => {
    if (!preview?.items) return [];
    return preview.items.map((i) => {
      const cleanedCat = String(i.category ?? "").trim();
      const tr = translations[cleanedCat];
      const es = (typeof tr === "string" ? tr : "").trim();
      const currentLabel = String(i.currentCategoryLabel ?? "").trim();
      const categoryChanged = !i.isNew && es.length > 0 && currentLabel !== es;
      return { ...i, esCategory: es, categoryChanged };
    });
  }, [preview, translations]);

  const filteredItems = useMemo(() => {
    if (filter === "changes")
      return itemsWithComputed.filter(
        (i) => !i.isNew && (i.priceChanged || i.categoryChanged)
      );
    if (filter === "new") return itemsWithComputed.filter((i) => i.isNew);
    if (filter === "matched")
      return itemsWithComputed.filter((i) => !i.isNew && !i.priceChanged && !i.categoryChanged);
    return itemsWithComputed;
  }, [itemsWithComputed, filter]);

  const displayed = showAll ? filteredItems : filteredItems.slice(0, 60);

  const productsWithChanges = itemsWithComputed.filter(
    (i) => !i.isNew && (i.priceChanged || i.categoryChanged)
  ).length;
  const categoryChanges = itemsWithComputed.filter((i) => i.categoryChanged).length;
  const hasChanges =
    (preview?.priceChanges ?? 0) > 0 ||
    categoryChanges > 0 ||
    (createNew && (preview?.newProducts ?? 0) > 0);

  const untranslatedCount = (preview?.uniqueCategories ?? []).filter(
    (c) => !translations[c]?.trim()
  ).length;

  return (
    <div className="space-y-4">
      {/* Paso 1 — Sincronización */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Badge tone="primary">Paso 1</Badge>
              <div>
                <p className="text-sm font-medium">Traer catálogo desde my.sonance.com</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Login + paginación de todas las marcas (SONANCE, IPORT, BLAZE, JAMES, TRUFIG).
                  Esto NO toca IA — solo descarga los productos. La preview queda guardada en BD
                  para que puedas salir de la página y volver después.
                </p>
              </div>
            </div>
            <Button
              onClick={handleSync}
              disabled={!hasPortal || state === "loading" || state === "applying"}
              size="sm"
              title={!hasPortal ? "Configurá las credenciales primero" : undefined}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${state === "loading" ? "animate-spin" : ""}`}
              />
              {state === "loading"
                ? "Descargando catálogo…"
                : preview
                ? "Re-sincronizar (descarta el actual)"
                : "Sincronizar"}
            </Button>
          </div>
          {!hasPortal && (
            <p className="text-xs text-warning">
              Configurá usuario y password arriba antes de sincronizar.
            </p>
          )}
          {hydrating && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Cargando última sincronización guardada…
            </p>
          )}
          {!hydrating && preview && savedAt && (
            <p className="text-xs text-muted-foreground">
              Última sincronización: {new Date(savedAt).toLocaleString("es-AR")} ·{" "}
              {preview.totalParsed ?? 0} productos guardados.
              Tus traducciones y selección se autoguardan a medida que las editás.
            </p>
          )}
          {/* Progreso de descarga del detalle completo (V1 — todos los ~113 campos) */}
          {fullSync && fullSync.total > 0 && (
            <div className="space-y-1.5 mt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Detalle completo (V1, todas las columnas): {fullSync.processed} / {fullSync.total}
                  {fullSync.phase === "done" && " · ✓ Completo"}
                </span>
                {fullSync.phase !== "done" && (
                  <button
                    onClick={cancelFullSync}
                    className="text-xs text-muted-foreground hover:text-destructive underline"
                  >
                    Cancelar
                  </button>
                )}
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, (fullSync.processed / Math.max(1, fullSync.total)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DB Columns — todos los campos disponibles en tu BD para que mapees */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 flex-1">
              <Badge tone="muted">BD</Badge>
              <div>
                <p className="text-sm font-medium">Columnas disponibles en tu base de datos</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Todos los campos que un Product puede tener en BD, con cobertura actual.
                  Combinado con el Inspector de API, te sirve para decidir el mapping.
                </p>
              </div>
            </div>
            <Button onClick={loadDbColumns} disabled={dbColumnsLoading} size="sm" variant="outline">
              {dbColumnsLoading ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Cargando…</>
              ) : dbColumns ? (
                "Recargar"
              ) : (
                "Ver columnas BD"
              )}
            </Button>
          </div>
          {dbColumns && (
            <div className="border border-border rounded-md overflow-hidden">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Campo</th>
                      <th className="px-3 py-1.5 text-left font-medium">Tipo</th>
                      <th className="px-3 py-1.5 text-left font-medium">Descripción</th>
                      <th className="px-3 py-1.5 text-right font-medium">Cobertura</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {dbColumns.map((c) => (
                      <tr key={c.field}>
                        <td className="px-3 py-1 font-mono">{c.field}</td>
                        <td className="px-3 py-1 text-muted-foreground">{c.type}</td>
                        <td className="px-3 py-1 text-muted-foreground">{c.description}</td>
                        <td className="px-3 py-1 text-right tabular-nums">
                          {c.coveragePercent != null ? `${c.coveragePercent}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inspector — ver todos los campos que trae la API para un SKU */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start gap-3">
            <Badge tone="muted">Inspector</Badge>
            <div className="flex-1">
              <p className="text-sm font-medium">Ver todas las columnas que trae la API</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ingresá un SKU (ej. <code>SA68</code>, <code>AMP-X300</code>) y te muestro
                <strong> todos los campos disponibles</strong> con un valor de muestra —
                así sabés exactamente qué hay para mapear.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                SKU del portal
              </label>
              <input
                type="text"
                value={inspectSku}
                onChange={(e) => setInspectSku(e.target.value)}
                placeholder="SA68"
                disabled={inspecting}
                className="h-9 w-full rounded border border-border bg-background px-3 text-sm font-mono"
              />
            </div>
            <Button onClick={runInspect} disabled={!inspectSku.trim() || inspecting} size="sm">
              {inspecting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Inspeccionando…
                </>
              ) : (
                "Ver campos disponibles"
              )}
            </Button>
          </div>
          {inspectError && <p className="text-xs text-destructive">{inspectError}</p>}
          {inspectResult && (
            <div className="space-y-3 mt-2">
              <p className="text-xs text-muted-foreground">
                <strong>{inspectResult.totalPaths}</strong> rutas disponibles ·{" "}
                <strong>{inspectResult.attrTypeLabels.length}</strong> attributeTypes (specs) ·{" "}
                <strong>{inspectResult.documentSummary.length}</strong> documentos ·{" "}
                <strong>{inspectResult.accessoryTotal}</strong> accesorios
              </p>

              {/* Attribute types (specs / categories) */}
              {inspectResult.attrTypeLabels.length > 0 && (
                <div className="border border-border rounded-md overflow-hidden">
                  <div className="bg-muted/40 px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    attributeTypes (specs técnicos + categorías)
                  </div>
                  <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="px-3 py-1 text-left">Label</th>
                          <th className="px-3 py-1 text-left">Valores (primeros 3)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {inspectResult.attrTypeLabels.map((a, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1 font-mono">{a.label}</td>
                            <td className="px-3 py-1 text-muted-foreground">
                              {a.values.join(" · ") || "(vacío)"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Documents */}
              {inspectResult.documentSummary.length > 0 && (
                <div className="border border-border rounded-md overflow-hidden">
                  <div className="bg-muted/40 px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    documents (datasheets, manuales, planos)
                  </div>
                  <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-border">
                        {inspectResult.documentSummary.map((d, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1">{d.name}</td>
                            <td className="px-3 py-1 font-mono text-muted-foreground">{d.type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Accessories preview */}
              {inspectResult.accessoryTotal > 0 && (
                <div className="border border-border rounded-md overflow-hidden">
                  <div className="bg-muted/40 px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    accessories (primeros 5 de {inspectResult.accessoryTotal})
                  </div>
                  <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-border">
                        {inspectResult.accessorySummary.map((a, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1 font-mono">{a.sku}</td>
                            <td className="px-3 py-1">{a.name}</td>
                            <td className="px-3 py-1 text-right tabular-nums text-muted-foreground">
                              {a.price != null ? `$ ${a.price.toFixed(2)}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* All paths (flat) */}
              <details className="border border-border rounded-md">
                <summary className="bg-muted/40 px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium cursor-pointer">
                  TODAS las rutas planas ({inspectResult.flat.length}) — click para expandir
                </summary>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground sticky top-0 bg-background">
                      <tr>
                        <th className="px-3 py-1 text-left">Ruta</th>
                        <th className="px-3 py-1 text-left">Tipo</th>
                        <th className="px-3 py-1 text-left">Valor muestra</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {inspectResult.flat.map((f, i) => (
                        <tr key={i}>
                          <td className="px-3 py-0.5 font-mono">{f.path || "(root)"}</td>
                          <td className="px-3 py-0.5 text-muted-foreground">{f.type}</td>
                          <td className="px-3 py-0.5 max-w-[400px] truncate">{f.sample}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
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

      {/* Done */}
      {state === "done" && applyResult && (
        <Card>
          <CardContent className="p-4 flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <p className="text-sm font-medium">
              Aplicado: {applyResult.updated} productos actualizados
              {applyResult.created > 0 ? `, ${applyResult.created} creados` : ""}
              {(applyResult.categoryWrites ?? 0) > 0
                ? `, ${applyResult.categoryWrites} con categoría`
                : ""}
              .
            </p>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {(state === "preview" || state === "applying" || state === "done") && preview && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total catálogo", value: preview.totalParsed ?? 0, color: "" },
              { label: "Coinciden en BD", value: preview.matched ?? 0, color: "text-success" },
              {
                label: "Cambios de precio",
                value: preview.priceChanges ?? 0,
                color: "text-warning",
              },
              {
                label: "Nuevos (no en BD)",
                value: preview.newProducts ?? 0,
                color: "text-muted-foreground",
              },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4 text-center">
                  <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Brand breakdown */}
          {preview.brandCounts && Object.keys(preview.brandCounts).length > 1 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(preview.brandCounts).map(([b, n]) => (
                <Badge key={b} tone={brandTone(b)}>
                  {b} · {n} productos
                </Badge>
              ))}
            </div>
          )}

          {/* Paso 2 — Categorías + traducción IA opcional */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3 flex-1 min-w-[200px]">
                  <Badge tone="primary">Paso 2</Badge>
                  <Languages className="h-4 w-4 mt-0.5 text-accent shrink-0" />
                  <div>
                    <h3 className="text-sm font-medium">Categorías (traducción + destino)</h3>
                    <p className="text-xs text-muted-foreground">
                      Traducí manualmente o usá la IA. Elegí dónde guardar la categoría traducida.
                      Tus ediciones se autoguardan en BD.
                    </p>
                  </div>
                </div>
                {(preview.uniqueCategories?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAutoTranslate(true)}
                      disabled={translating || untranslatedCount === 0}
                      title="Solo completa las que están vacías"
                    >
                      <Sparkles
                        className={`mr-1.5 h-3.5 w-3.5 ${translating ? "animate-pulse" : ""}`}
                      />
                      {translating ? "Traduciendo…" : `Traducir faltantes (${untranslatedCount})`}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleAutoTranslate(false)}
                      disabled={translating}
                      title="Sobrescribe todas las traducciones"
                    >
                      Re-traducir todas
                    </Button>
                  </div>
                )}
              </div>
              {translateError && <p className="text-xs text-destructive">{translateError}</p>}

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
                        <th className="px-3 py-2 text-left font-medium">Original (Sonance · EN)</th>
                        <th className="px-3 py-2 text-left font-medium">Traducción (ES)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(preview.uniqueCategories ?? []).map((c) => (
                        <tr key={c}>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground max-w-[260px] truncate">
                            {c}
                          </td>
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
                  No se detectaron categorías en los datos parseados.
                </p>
              )}

              {untranslatedCount > 0 && (
                <p className="text-[11px] text-warning">
                  {untranslatedCount} categoría{untranslatedCount === 1 ? "" : "s"} sin traducir — no se escribirán en los productos.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Options + Apply */}
          {(state === "preview" || state === "applying") && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={createNew}
                  onChange={(e) => setCreateNew(e.target.checked)}
                  disabled={state === "applying"}
                  className="h-4 w-4 rounded border-border"
                />
                Crear también los {preview.newProducts ?? 0} productos nuevos{" "}
                <span className="text-xs text-muted-foreground">
                  (quedan inactivos hasta revisión)
                </span>
              </label>
              <Button
                onClick={handleApply}
                disabled={!hasChanges || state === "applying"}
                size="sm"
              >
                {state === "applying" ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Aplicando…
                  </>
                ) : (
                  <>
                    Aplicar {preview.priceChanges ?? 0} precio
                    {categoryChanges > 0 ? ` · ${categoryChanges} categoría` : ""}
                    {createNew && (preview.newProducts ?? 0) > 0
                      ? ` · ${preview.newProducts} nuevos`
                      : ""}
                  </>
                )}
              </Button>
            </div>
          )}

          {state === "applying" && (
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Loader2 className="h-4 w-4 shrink-0 text-primary animate-spin" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Aplicando cambios…</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Actualizando precios{createNew && (preview.newProducts ?? 0) > 0
                      ? ` y creando ${preview.newProducts} productos nuevos`
                      : ""}
                    . No cierres esta pestaña.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Paso 3 (opcional) — Enriquecimiento + traducción IA del detalle */}
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start gap-3 flex-1 min-w-[260px]">
                <Badge tone="primary">Paso 3</Badge>
                <Sparkles className="h-4 w-4 mt-0.5 text-accent shrink-0" />
                <div>
                  <h3 className="text-sm font-medium">Enriquecer productos con datos completos (opcional)</h3>
                  <p className="text-xs text-muted-foreground">
                    Por cada producto baja del portal: imágenes (hasta 10), specs técnicos (25 atributos), datasheets,
                    accesorios y descripción HTML. Opcionalmente traduce todo al español con OpenAI (cache: cada texto se traduce 1 sola vez).
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Procesa de a 20 productos por batch. Cancelable y reanudable.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enrichTranslate}
                    onChange={(e) => setEnrichTranslate(e.target.checked)}
                    disabled={enriching}
                    className="h-4 w-4 rounded border-border"
                  />
                  Traducir nombres, specs, docs y descripciones al español
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enrichForce}
                    onChange={(e) => setEnrichForce(e.target.checked)}
                    disabled={enriching}
                    className="h-4 w-4 rounded border-border"
                  />
                  Re-procesar productos ya enriquecidos
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {!enriching ? (
                  <Button size="sm" onClick={runEnrich} disabled={!hasPortal}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Iniciar enriquecimiento
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={cancelEnrich}>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Cancelar (termina batch actual)
                  </Button>
                )}
                {enrichProgress && enrichProgress.total > 0 && (
                  <p className="text-xs text-muted-foreground self-center">
                    {enrichProgress.done} / {enrichProgress.total} ·{" "}
                    {enrichProgress.withImages} con imágenes ·{" "}
                    {enrichProgress.withSpecs} con specs ·{" "}
                    {enrichProgress.withDocs} con docs ·{" "}
                    {enrichProgress.withAccessories} con accesorios
                    {enrichProgress.withTranslations > 0
                      ? ` · ${enrichProgress.withTranslations} traducidos`
                      : ""}
                  </p>
                )}
              </div>
              {enrichProgress && enrichProgress.total > 0 && (
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(100, (enrichProgress.done / enrichProgress.total) * 100)}%`,
                    }}
                  />
                </div>
              )}
              {enrichError && <p className="text-xs text-destructive">{enrichError}</p>}
              {enrichDone && (
                <p className="text-xs text-success">
                  ✓ Enriquecimiento completo: {enrichProgress?.updated} productos actualizados.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="flex border-b border-border px-4 pt-3 gap-4 text-sm overflow-x-auto">
                {(
                  [
                    {
                      key: "changes",
                      label: `Con cambios (${productsWithChanges})`,
                    },
                    { key: "new", label: `Nuevos (${preview.newProducts ?? 0})` },
                    {
                      key: "matched",
                      label: `Sin cambios (${(preview.matched ?? 0) - productsWithChanges})`,
                    },
                    { key: "all", label: `Todos (${preview.totalParsed ?? 0})` },
                  ] as { key: Filter; label: string }[]
                ).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setFilter(t.key);
                      setShowAll(false);
                    }}
                    className={`shrink-0 pb-2 border-b-2 transition-colors text-xs ${
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
                  Sin resultados en esta vista.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b border-border bg-muted/40">
                        <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                          <th className="px-3 py-2.5">SKU</th>
                          <th className="px-3 py-2.5">Nombre</th>
                          <th className="px-3 py-2.5">Marca</th>
                          <th className="px-3 py-2.5">Categoría</th>
                          <th className="px-3 py-2.5">UoM</th>
                          <th className="px-3 py-2.5 text-right">Precio actual</th>
                          <th className="px-3 py-2.5 text-right">Precio nuevo</th>
                          <th className="px-3 py-2.5">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {displayed.map((item) => (
                          <tr key={item.supplierSku} className="hover:bg-muted/20">
                            <td className="px-3 py-2 font-mono text-muted-foreground">
                              {item.supplierSku}
                            </td>
                            <td className="px-3 py-2 max-w-[200px]">{item.name}</td>
                            <td className="px-3 py-2">
                              <Badge tone={brandTone(item.brand)}>{item.brand}</Badge>
                            </td>
                            <td
                              className={`px-3 py-2 text-xs max-w-[160px] ${
                                item.categoryChanged
                                  ? "text-accent font-medium"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {item.esCategory ||
                                (item.category ? (
                                  <span className="italic text-muted-foreground">
                                    sin traducir ({item.category})
                                  </span>
                                ) : (
                                  "—"
                                ))}
                              {item.categoryChanged && item.currentCategoryLabel && (
                                <span className="block text-[10px] text-muted-foreground line-through">
                                  {item.currentCategoryLabel}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{item.uom}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {fmtPrice(item.currentPrice)}
                            </td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums font-medium ${
                                item.priceChanged ? "text-warning" : ""
                              }`}
                            >
                              {fmtPrice(item.newPrice)}
                            </td>
                            <td className="px-3 py-2">
                              {item.isNew ? (
                                <Badge tone="muted">Nuevo</Badge>
                              ) : item.priceChanged ? (
                                <Badge tone="warning">Precio cambia</Badge>
                              ) : item.categoryChanged ? (
                                <Badge tone="accent">Categoría cambia</Badge>
                              ) : (
                                <Badge tone="success">Sin cambio</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {filteredItems.length > 60 && (
                    <div className="border-t border-border px-4 py-2 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Mostrando {displayed.length} de {filteredItems.length}
                      </p>
                      <button
                        onClick={() => setShowAll((v) => !v)}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        {showAll ? (
                          <>
                            <ChevronUp className="h-3 w-3" /> Mostrar menos
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3" /> Ver todos ({filteredItems.length})
                          </>
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
