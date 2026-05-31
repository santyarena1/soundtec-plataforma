"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Loader2,
  Languages,
  Sparkles,
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

export function SonanceImportPanel({ hasLinks }: { hasLinks: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, setState] = useState<
    "idle" | "parsing" | "preview" | "applying" | "done" | "error"
  >("idle");
  const [preview, setPreview] = useState<SonancePreviewResponse | null>(null);
  const [applyResult, setApplyResult] = useState<{ updated: number; created: number; categoryWrites?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("changes");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<CategoryTarget>("rubro");
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  // Enriquecimiento (rich data desde my.sonance.com)
  const [enriching, setEnriching] = useState(false);
  const [enrichTranslate, setEnrichTranslate] = useState(true);
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

  async function runEnrich() {
    setEnriching(true);
    setEnrichError(null);
    setEnrichDone(false);
    setEnrichProgress({ done: 0, total: 0, updated: 0, withImages: 0, withSpecs: 0, withDocs: 0, withAccessories: 0, withTranslations: 0 });
    enrichCancelRef.canceled = false;
    try {
      let offset = 0;
      let total = 0;
      const acc = { updated: 0, withImages: 0, withSpecs: 0, withDocs: 0, withAccessories: 0, withTranslations: 0 };
      while (!enrichCancelRef.canceled) {
        const res = await fetch("/api/admin/sonance-import/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ translate: enrichTranslate, force: enrichForce, batchSize: 20, offset }),
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
        const newDone = (data.nextOffset ?? total);
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

  // Hydrate translations + target when a preview arrives
  useEffect(() => {
    if (!preview) return;
    const base: Record<string, string> = { ...(preview.translations ?? {}) };
    for (const c of preview.uniqueCategories ?? []) {
      if (!(c in base)) base[c] = "";
    }
    setTranslations(base);
    if (preview.target) setTarget(preview.target);
  }, [preview]);
  const [createNew, setCreateNew] = useState(false);
  const [showAll, setShowAll] = useState(false);

  function reset() {
    setPreview(null);
    setState("idle");
    setError(null);
    setApplyResult(null);
    setShowAll(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFileName(f?.name ?? null);
    reset();
  }

  async function handleSyncFromBox() {
    setState("parsing");
    setError(null);
    setPreview(null);
    setApplyResult(null);
    try {
      const res = await fetch("/api/admin/sonance-import");
      const data: SonancePreviewResponse = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Error al sincronizar");
      setPreview(data);
      setState("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setState("error");
    }
  }

  async function handleParse() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setState("parsing");
    setError(null);
    setPreview(null);
    setApplyResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/admin/sonance-import", { method: "POST", body: fd });
      const data: SonancePreviewResponse = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Error al parsear");
      setPreview(data);
      setState("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setState("error");
    }
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
      setApplyResult({ updated: data.updated, created: data.created, categoryWrites: data.categoryWrites });
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

  const filteredItems: SonancePreviewItem[] = (() => {
    if (!preview?.items) return [];
    switch (filter) {
      case "changes": return preview.items.filter((i) => !i.isNew && i.priceChanged);
      case "new":     return preview.items.filter((i) => i.isNew);
      case "matched": return preview.items.filter((i) => !i.isNew && !i.priceChanged);
      case "all":     return preview.items;
    }
  })();

  const displayed = showAll ? filteredItems : filteredItems.slice(0, 60);

  // Category change count: matched products whose current category-target field
  // differs from the translation of their EN category
  const categoryChanges = useMemo(() => {
    if (!preview?.items) return 0;
    return preview.items.filter((i) => {
      if (i.isNew) return false;
      const es = (translations[i.category] ?? "").trim();
      return es.length > 0 && (i.currentCategoryLabel ?? "").trim() !== es;
    }).length;
  }, [preview, translations]);

  const untranslatedCount = (preview?.uniqueCategories ?? []).filter(
    (c) => !translations[c]?.trim()
  ).length;

  const hasChanges =
    (preview?.priceChanges ?? 0) > 0 ||
    categoryChanges > 0 ||
    (createNew && (preview?.newProducts ?? 0) > 0);

  return (
    <div className="space-y-4">

      {/* Sync card */}
      <Card>
        <CardContent className="p-5 space-y-4">

          {/* Auto-sync from Box */}
          {hasLinks && (
            <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Sincronizar desde Box</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Descarga y procesa automáticamente los archivos configurados.
                </p>
              </div>
              <Button
                onClick={handleSyncFromBox}
                disabled={state === "parsing" || state === "applying"}
                size="sm"
              >
                <Upload className={`mr-1.5 h-3.5 w-3.5 ${state === "parsing" ? "animate-bounce" : ""}`} />
                {state === "parsing" ? "Descargando…" : "Sincronizar"}
              </Button>
            </div>
          )}

          {/* Manual upload */}
          <div>
            {hasLinks && (
              <p className="text-xs font-medium text-muted-foreground mb-2">
                O subir manualmente
              </p>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                {!hasLinks && (
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Archivo Excel (.xlsx)
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer h-9 rounded-md border border-dashed border-border bg-background px-3 text-sm text-muted-foreground hover:bg-secondary transition-colors">
                  <FileSpreadsheet className="h-4 w-4 shrink-0" />
                  <span className="truncate">{fileName ?? "Elegir archivo…"}</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
              <Button
                onClick={handleParse}
                disabled={!fileName || state === "parsing" || state === "applying"}
                size="sm"
                variant={hasLinks ? "outline" : "secondary"}
              >
                <Upload className={`mr-1.5 h-3.5 w-3.5 ${state === "parsing" && fileName ? "animate-bounce" : ""}`} />
                {state === "parsing" && fileName ? "Procesando…" : "Analizar archivo"}
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>• <strong>Sonance + IPORT:</strong> <code>Sonance_IPORT Price List_*.xlsx</code> — detecta marcas por sección</p>
            <p>• <strong>BLAZE by SONANCE:</strong> <code>BLAZE by SONANCE_Price List_*.xlsx</code> — hoja &quot;USD - BLAZE PRICE LIST&quot;</p>
          </div>
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
              {(applyResult.categoryWrites ?? 0) > 0 ? `, ${applyResult.categoryWrites} con categoría` : ""}.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Enriquecimiento (rich data: imágenes, specs, docs, accesorios + traducción ES) */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2 flex-1 min-w-[260px]">
              <Sparkles className="h-4 w-4 mt-0.5 text-accent shrink-0" />
              <div>
                <h3 className="text-sm font-medium">Enriquecer productos Sonance</h3>
                <p className="text-xs text-muted-foreground">
                  Baja datos completos del portal por cada producto (imágenes, specs técnicos, datasheets, accesorios, descripciones HTML)
                  y opcionalmente los traduce al español con OpenAI (con cache: cada texto se traduce 1 sola vez).
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Procesa de a 20 productos por batch — no rompe por timeout. Podés cancelar y reanudar.
                </p>
              </div>
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
              <Button size="sm" onClick={runEnrich}>
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
                {enrichProgress.withTranslations > 0 ? ` · ${enrichProgress.withTranslations} traducidos` : ""}
              </p>
            )}
          </div>
          {enrichProgress && enrichProgress.total > 0 && (
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(100, (enrichProgress.done / enrichProgress.total) * 100)}%` }}
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

      {/* Preview */}
      {(state === "preview" || state === "applying" || state === "done") && preview && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Parseados", value: preview.totalParsed ?? 0, color: "" },
              { label: "Coinciden en BD", value: preview.matched ?? 0, color: "text-success" },
              { label: "Cambios de precio", value: preview.priceChanges ?? 0, color: "text-warning" },
              { label: "Nuevos (no en BD)", value: preview.newProducts ?? 0, color: "text-muted-foreground" },
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

          {/* Categories config */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-2 flex-1 min-w-[200px]">
                  <Languages className="h-4 w-4 mt-0.5 text-accent shrink-0" />
                  <div>
                    <h3 className="text-sm font-medium">Categorías de Sonance</h3>
                    <p className="text-xs text-muted-foreground">
                      Traducí cada grupo al español y elegí dónde guardarlo. Se guarda al aplicar.
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
                      <Sparkles className={`mr-1.5 h-3.5 w-3.5 ${translating ? "animate-pulse" : ""}`} />
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
                <label className="block text-xs font-medium text-muted-foreground">Guardar como</label>
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
                          <td className="px-3 py-1.5 font-mono text-muted-foreground max-w-[260px] truncate">{c}</td>
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              value={translations[c] ?? ""}
                              onChange={(e) => setTranslations((prev) => ({ ...prev, [c]: e.target.value }))}
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
                <span className="text-xs text-muted-foreground">(quedan inactivos hasta revisión)</span>
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
                    Aplicar {(preview.priceChanges ?? 0)} precio
                    {categoryChanges > 0 ? ` · ${categoryChanges} categoría` : ""}
                    {createNew && (preview.newProducts ?? 0) > 0 ? ` · ${preview.newProducts} nuevos` : ""}
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Applying banner */}
          {state === "applying" && (
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Loader2 className="h-4 w-4 shrink-0 text-primary animate-spin" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Aplicando cambios…</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Actualizando precios{createNew && (preview.newProducts ?? 0) > 0 ? ` y creando ${preview.newProducts} productos nuevos` : ""}. No cierres esta pestaña.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {/* Filter tabs */}
              <div className="flex border-b border-border px-4 pt-3 gap-4 text-sm overflow-x-auto">
                {(
                  [
                    { key: "changes", label: `Con cambios (${preview.priceChanges ?? 0})` },
                    { key: "new",     label: `Nuevos (${preview.newProducts ?? 0})` },
                    { key: "matched", label: `Sin cambios (${(preview.matched ?? 0) - (preview.priceChanges ?? 0)})` },
                    { key: "all",     label: `Todos (${preview.totalParsed ?? 0})` },
                  ] as { key: Filter; label: string }[]
                ).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => { setFilter(t.key); setShowAll(false); }}
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
                            <td className="px-3 py-2 font-mono text-muted-foreground">{item.supplierSku}</td>
                            <td className="px-3 py-2 max-w-[200px]">{item.name}</td>
                            <td className="px-3 py-2">
                              <Badge tone={brandTone(item.brand)}>{item.brand}</Badge>
                            </td>
                            <td className="px-3 py-2 max-w-[160px] text-muted-foreground">
                              {item.category}
                              {item.subcategory ? ` › ${item.subcategory}` : ""}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{item.uom}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {fmtPrice(item.currentPrice)}
                            </td>
                            <td className={`px-3 py-2 text-right tabular-nums font-medium ${item.priceChanged ? "text-warning" : ""}`}>
                              {fmtPrice(item.newPrice)}
                            </td>
                            <td className="px-3 py-2">
                              {item.isNew ? (
                                <Badge tone="muted">Nuevo</Badge>
                              ) : item.priceChanged ? (
                                <Badge tone="warning">Precio cambia</Badge>
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
                        {showAll
                          ? <><ChevronUp className="h-3 w-3" /> Mostrar menos</>
                          : <><ChevronDown className="h-3 w-3" /> Ver todos ({filteredItems.length})</>
                        }
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
