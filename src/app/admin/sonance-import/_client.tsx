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

  // Verificación de marcas disponibles en mySonance
  const [brandsCheck, setBrandsCheck] = useState<{
    brands: Array<{ name: string; urlSegment: string; productCount: number }>;
    totalAcrossAll: number;
    knownToSyncCount: number;
    unmappedBrands: Array<{ name: string; urlSegment: string; count: number }>;
  } | null>(null);
  const [checkingBrands, setCheckingBrands] = useState(false);

  async function checkBrands() {
    setCheckingBrands(true);
    try {
      const res = await fetch("/api/admin/sonance-import/brands");
      const data = await res.json();
      if (data.ok) setBrandsCheck(data);
    } catch { /* ignore */ } finally {
      setCheckingBrands(false);
    }
  }

  // Sample product para preview de mapping (un producto real del cached payload)
  const [sampleProduct, setSampleProduct] = useState<{
    sku: string;
    brand: string;
    productTitle: string;
    detail: unknown;
  } | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);

  async function loadSampleProduct(random: boolean) {
    setSampleLoading(true);
    setSampleError(null);
    try {
      const url = random
        ? "/api/admin/sonance-import/sample-product?random=1"
        : "/api/admin/sonance-import/sample-product";
      const res = await fetch(url);
      const ct = res.headers.get("content-type") ?? "";
      const text = await res.text();
      if (!ct.includes("application/json")) {
        throw new Error(`HTTP ${res.status} no-JSON: ${text.replace(/<[^>]+>/g, " ").slice(0, 150)}`);
      }
      const data = JSON.parse(text);
      if (!data.ok) throw new Error(data.error ?? "Error");
      setSampleProduct({
        sku: data.sku,
        brand: data.brand,
        productTitle: data.productTitle,
        detail: data.detail,
      });
    } catch (e) {
      setSampleError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSampleLoading(false);
    }
  }

  // Resolvedor inline (mirror del server portal-path-resolver)
  function resolvePath(detail: unknown, path: string): unknown {
    if (!path || detail == null) return null;
    if (path === "$root" || path === ".") return detail;

    if (path.startsWith("attr:")) {
      const wanted = path.slice(5).trim().toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attrs = ((detail as any).attributeTypes ?? []) as Array<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = attrs.find((a: any) => String(a.label ?? a.name ?? "").toLowerCase() === wanted);
      if (!found) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values = (found.attributeValues ?? []).map((v: any) => String(v.valueDisplay ?? v.value ?? "").trim()).filter((s: string) => s.length > 0);
      return values.length === 0 ? null : values.length === 1 ? values[0] : values;
    }

    const arrMatch = path.match(/^([^[\]]+)\[\](?:\.(.+))?$/);
    if (arrMatch) {
      const [, arrPath, subPath] = arrMatch;
      const arr = getNested(detail, arrPath);
      if (!Array.isArray(arr)) return [];
      if (!subPath) return arr;
      return arr.map((item) => getNested(item, subPath)).filter((v) => v != null);
    }

    return getNested(detail, path);
  }
  function getNested(obj: unknown, path: string): unknown {
    if (obj == null) return null;
    let cur: unknown = obj;
    for (const part of path.split(".")) {
      if (cur == null || typeof cur !== "object") return null;
      cur = (cur as Record<string, unknown>)[part];
      if (cur === undefined) return null;
    }
    return cur ?? null;
  }
  function formatSampleValue(v: unknown): string {
    if (v == null) return "—";
    if (typeof v === "string") return v.length > 80 ? v.slice(0, 80) + "…" : v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) {
      if (v.length === 0) return "[] (vacío)";
      const primitives = v.filter((x) => typeof x === "string" || typeof x === "number");
      if (primitives.length === v.length) {
        const s = primitives.slice(0, 3).join(" · ");
        return v.length > 3 ? `${s}  +${v.length - 3}` : s;
      }
      return `[${v.length} items]`;
    }
    if (typeof v === "object") {
      const keys = Object.keys(v as Record<string, unknown>);
      return `{${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", …" : ""}}`;
    }
    return String(v);
  }

  // DB columns disponibles para mapping
  const [dbColumns, setDbColumns] = useState<Array<{
    field: string;
    label: string;
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

  // Field mapping {dbField: apiPath}
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [apiPathGroups, setApiPathGroups] = useState<Array<{ group: string; paths: Array<{ path: string; label: string }> }>>([]);
  const [mappingLoaded, setMappingLoaded] = useState(false);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [applyingMapping, setApplyingMapping] = useState(false);
  const [applyMappingProgress, setApplyMappingProgress] = useState<{
    done: number;
    total: number;
    updated: number;
    created: number;
    skippedNoDetail: number;
    withSpecifications: number;
    withDocuments: number;
    withImageRels: number;
    withAccessoryRels: number;
    withCrossSellRels: number;
    withAlsoPurchasedRels: number;
  } | null>(null);
  const [applyMappingError, setApplyMappingError] = useState<string | null>(null);
  const [applyMappingCancelRef] = useState<{ canceled: boolean }>({ canceled: false });

  // Load mapping + API path catalog on mount + sample product para preview
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/sonance-import/mapping");
        const data = await res.json();
        if (data.ok) {
          setMapping(data.mapping ?? {});
          setApiPathGroups(data.apiPaths ?? []);
        }
      } catch { /* ignore */ } finally {
        setMappingLoaded(true);
      }
      // Sample product en paralelo (silenciosamente — sin error si no hay payload aún)
      try {
        const res = await fetch("/api/admin/sonance-import/sample-product");
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          const data = await res.json();
          if (data.ok) {
            setSampleProduct({
              sku: data.sku,
              brand: data.brand,
              productTitle: data.productTitle,
              detail: data.detail,
            });
          }
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // Debounced auto-save of mapping
  useEffect(() => {
    if (!mappingLoaded) return;
    const t = setTimeout(() => {
      setMappingSaving(true);
      void fetch("/api/admin/sonance-import/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping }),
      }).finally(() => setMappingSaving(false));
    }, 600);
    return () => clearTimeout(t);
  }, [mapping, mappingLoaded]);

  async function runApplyMapping() {
    setApplyingMapping(true);
    setApplyMappingError(null);
    applyMappingCancelRef.canceled = false;
    setApplyMappingProgress({
      done: 0, total: 0,
      updated: 0, created: 0, skippedNoDetail: 0,
      withSpecifications: 0, withDocuments: 0, withImageRels: 0,
      withAccessoryRels: 0, withCrossSellRels: 0, withAlsoPurchasedRels: 0,
    });
    try {
      let offset = 0;
      let total = 0;
      const acc = {
        updated: 0, created: 0, skippedNoDetail: 0,
        withSpecifications: 0, withDocuments: 0, withImageRels: 0,
        withAccessoryRels: 0, withCrossSellRels: 0, withAlsoPurchasedRels: 0,
      };
      while (!applyMappingCancelRef.canceled) {
        const res = await fetch("/api/admin/sonance-import/apply-mapping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, batchSize: 25 }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error ?? "Error en apply-mapping");
        total = data.totalProducts ?? 0;
        acc.updated += data.updated ?? 0;
        acc.created += data.created ?? 0;
        acc.skippedNoDetail += data.skippedNoDetail ?? 0;
        acc.withSpecifications += data.withSpecifications ?? 0;
        acc.withDocuments += data.withDocuments ?? 0;
        acc.withImageRels += data.withImageRels ?? 0;
        acc.withAccessoryRels += data.withAccessoryRels ?? 0;
        acc.withCrossSellRels += data.withCrossSellRels ?? 0;
        acc.withAlsoPurchasedRels += data.withAlsoPurchasedRels ?? 0;
        const newDone = data.nextOffset ?? total;
        setApplyMappingProgress({ done: newDone, total, ...acc });
        if (data.done || data.nextOffset === null) break;
        offset = data.nextOffset;
      }
    } catch (e) {
      setApplyMappingError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setApplyingMapping(false);
    }
  }

  function cancelApplyMapping() {
    applyMappingCancelRef.canceled = true;
  }

  // Preset de mapeo recomendado Sonance
  const [loadingPreset, setLoadingPreset] = useState(false);
  async function applyRecommendedMapping() {
    setLoadingPreset(true);
    try {
      const res = await fetch("/api/admin/sonance-import/preset-mapping");
      const data = await res.json();
      if (data.ok && data.mapping) {
        setMapping(data.mapping);
      }
    } catch { /* ignore */ } finally {
      setLoadingPreset(false);
    }
  }

  // Diagnóstico de marcas/accesorios/configurables en BD
  const [diag, setDiag] = useState<{
    summary: { totalProducts: number; activeProducts: number; productsWithImages: number; productsWithoutBrand: number };
    brands: Array<{
      id: string; name: string; slug: string; isActive: boolean;
      totalProducts: number; activeProducts: number; activeWithImages: number; willShowInSidebar: boolean;
    }>;
    accessories: {
      totalRelations: number;
      accessoryRels: number;
      crossSellRels: number;
      alsoPurchasedRels: number;
      productsWithAccessories: number;
      productsWithCrossSells: number;
      productsWithAlsoPurchased: number;
      productsAsAccessory: number;
    };
    configurable: { totalCustomizable: number; customizableWithoutOptions: number };
  } | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  async function loadDiag() {
    setDiagLoading(true);
    try {
      const res = await fetch("/api/admin/sonance-import/diagnostic");
      const data = await res.json();
      if (data.ok) setDiag(data);
    } catch { /* ignore */ } finally {
      setDiagLoading(false);
    }
  }

  // Sync full (batched: init listing + N detail batches con progreso)
  const [fullSync, setFullSync] = useState<{
    phase: "init" | "detail" | "done";
    total: number;
    processed: number;
  } | null>(null);
  const [fullSyncCancelRef] = useState<{ canceled: boolean }>({ canceled: false });

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

      // Loop de batches — skipExisting:true reusa detalles ya bajados
      // (relevante si re-sincronizás para llenar productos que faltaron)
      let offset = 0;
      while (!fullSyncCancelRef.canceled) {
        const r = await fetch("/api/admin/sonance-import/sync-full", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, batchSize: 25, skipExisting: true }),
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
      {/* Cómo funciona el flujo */}
      <Card>
        <CardContent className="p-4 text-xs space-y-1.5">
          <p className="text-sm font-medium">🧭 Cómo funciona</p>
          <ol className="list-decimal pl-5 space-y-0.5 text-muted-foreground">
            <li><strong>Paso 1 — Sincronizar</strong>: descarga el catálogo Sonance y los detalles completos (~113 campos por producto) al cache + Product.sourceMetadata.</li>
            <li><strong>Paso 2 — Ver columnas BD</strong>: te muestra la lista de todos los campos que tu Product puede llenar.</li>
            <li><strong>Paso 3 — Mapeo</strong>: por cada campo BD elegís qué ruta de la API la llena. Tenés preview en vivo con un producto real al lado.</li>
            <li><strong>Paso 4 — Aplicar mapping</strong>: actualiza/crea todos los productos en tu BD según tu mapeo. Aparecen después en <code>/admin/products</code>.</li>
          </ol>
          <p className="text-muted-foreground pt-1">
            ⚡ Nada usa OpenAI automáticamente. La traducción al ES solo corre cuando vos clickeás explícitamente alguno de los botones que la dispara.
          </p>
        </CardContent>
      </Card>

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

      {/* Verificación de marcas disponibles en mySonance */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 flex-1">
              <Badge tone="muted">Marcas</Badge>
              <div>
                <p className="text-sm font-medium">Marcas disponibles en mySonance</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Te dice cuántos productos hay por marca en el portal, y si alguna marca está
                  fuera de la sync (no se sincroniza porque su slug no está en el código).
                </p>
              </div>
            </div>
            <Button onClick={checkBrands} disabled={checkingBrands} size="sm" variant="outline">
              {checkingBrands ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Consultando…</>
              ) : brandsCheck ? (
                "Recargar"
              ) : (
                "Verificar marcas"
              )}
            </Button>
          </div>
          {brandsCheck && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Total productos en mySonance: <strong>{brandsCheck.totalAcrossAll}</strong> ·{" "}
                Sincronizados por el código: <strong>{brandsCheck.knownToSyncCount}</strong>
                {brandsCheck.unmappedBrands.length > 0 && (
                  <span className="text-warning">
                    {" "}· {brandsCheck.unmappedBrands.length} marca(s) NO sincronizadas
                  </span>
                )}
              </p>
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Marca</th>
                      <th className="px-3 py-1.5 text-left font-medium">Slug</th>
                      <th className="px-3 py-1.5 text-right font-medium">Productos</th>
                      <th className="px-3 py-1.5 text-center font-medium">¿Sincronizada?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {brandsCheck.brands.map((b) => {
                      const isKnown = ["pn-sonance", "pn-iport", "pn-blaze", "pn-james", "pn-trufig"].includes(
                        (b.urlSegment ?? "").toLowerCase()
                      );
                      return (
                        <tr key={b.urlSegment || b.name}>
                          <td className="px-3 py-1">{b.name}</td>
                          <td className="px-3 py-1 font-mono text-muted-foreground">{b.urlSegment || "(sin slug)"}</td>
                          <td className="px-3 py-1 text-right tabular-nums">{b.productCount}</td>
                          <td className="px-3 py-1 text-center">
                            {isKnown ? (
                              <span className="text-success">✓</span>
                            ) : (
                              <span className="text-warning">✗</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {brandsCheck.unmappedBrands.length > 0 && (
                <p className="text-[11px] text-warning">
                  ⚠️ Las marcas con ✗ no se sincronizan. Si querés incluirlas, agregá su slug a
                  <code> BRAND_SLUGS</code> en <code>src/services/sonance-portal.ts</code>.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diagnóstico BD — qué hay efectivamente en la base */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 flex-1">
              <Badge tone="warning">Diagnóstico</Badge>
              <div>
                <p className="text-sm font-medium">Estado actual de la base de datos</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Te muestra cuántos productos hay por marca, cuántos tienen accesorios linkeados
                  y cuántos están marcados como configurables. Útil para ver qué falta y qué inconsistencias hay.
                </p>
              </div>
            </div>
            <Button onClick={loadDiag} disabled={diagLoading} size="sm" variant="outline">
              {diagLoading ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Cargando…</>
              ) : diag ? (
                "Recargar"
              ) : (
                "Ver diagnóstico"
              )}
            </Button>
          </div>
          {diag && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded-md border border-border bg-muted/30 p-2">
                  <p className="text-muted-foreground">Total productos</p>
                  <p className="text-lg font-semibold tabular-nums">{diag.summary.totalProducts}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2">
                  <p className="text-muted-foreground">Activos</p>
                  <p className="text-lg font-semibold tabular-nums text-success">{diag.summary.activeProducts}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2">
                  <p className="text-muted-foreground">Con imágenes</p>
                  <p className="text-lg font-semibold tabular-nums">{diag.summary.productsWithImages}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2">
                  <p className="text-muted-foreground">Sin marca</p>
                  <p className={`text-lg font-semibold tabular-nums ${diag.summary.productsWithoutBrand > 0 ? "text-warning" : ""}`}>
                    {diag.summary.productsWithoutBrand}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium mb-1.5">Marcas en BD</p>
                <div className="border border-border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">Marca</th>
                        <th className="px-3 py-1.5 text-center font-medium">Activa</th>
                        <th className="px-3 py-1.5 text-right font-medium">Total</th>
                        <th className="px-3 py-1.5 text-right font-medium">Activos</th>
                        <th className="px-3 py-1.5 text-right font-medium">Con imágenes</th>
                        <th className="px-3 py-1.5 text-center font-medium">¿Aparece en sidebar?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {diag.brands.map((b) => (
                        <tr key={b.id} className={!b.willShowInSidebar ? "bg-warning/5" : ""}>
                          <td className="px-3 py-1">
                            <div>{b.name}</div>
                            <code className="text-[10px] text-muted-foreground">{b.slug}</code>
                          </td>
                          <td className="px-3 py-1 text-center">
                            {b.isActive ? (
                              <span className="text-success">✓</span>
                            ) : (
                              <span className="text-warning">✗</span>
                            )}
                          </td>
                          <td className="px-3 py-1 text-right tabular-nums">{b.totalProducts}</td>
                          <td className="px-3 py-1 text-right tabular-nums">{b.activeProducts}</td>
                          <td className="px-3 py-1 text-right tabular-nums">{b.activeWithImages}</td>
                          <td className="px-3 py-1 text-center">
                            {b.willShowInSidebar ? (
                              <span className="text-success">✓ Sí</span>
                            ) : (
                              <span className="text-warning">✗ No</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {diag.brands.some((b) => !b.willShowInSidebar) && (
                  <p className="text-[11px] text-warning mt-1.5">
                    ⚠️ Marcas con fondo amarillo no aparecen en el sidebar del catálogo. Razones posibles:
                    isActive=false, o cero productos activos linkeados a esa marca.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
                  <p className="text-xs font-medium">Relaciones producto-producto</p>
                  <p className="text-xs text-muted-foreground">
                    Accesorios: <strong className="text-foreground">{diag.accessories.accessoryRels}</strong> rels
                    {" · "}<strong className="text-foreground">{diag.accessories.productsWithAccessories}</strong> productos
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cross-sells: <strong className="text-foreground">{diag.accessories.crossSellRels}</strong> rels
                    {" · "}<strong className="text-foreground">{diag.accessories.productsWithCrossSells}</strong> productos
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Also-purchased: <strong className="text-foreground">{diag.accessories.alsoPurchasedRels}</strong> rels
                    {" · "}<strong className="text-foreground">{diag.accessories.productsWithAlsoPurchased}</strong> productos
                  </p>
                  <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                    Productos usados como accesorio (acumulado): <strong className="text-foreground">{diag.accessories.productsAsAccessory}</strong>
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
                  <p className="text-xs font-medium">Configurables</p>
                  <p className="text-xs text-muted-foreground">
                    Total marcados configurables: <strong className="text-foreground">{diag.configurable.totalCustomizable}</strong>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Configurables sin opciones ni accesorios:{" "}
                    <strong className={diag.configurable.customizableWithoutOptions > 0 ? "text-warning" : "text-foreground"}>
                      {diag.configurable.customizableWithoutOptions}
                    </strong>
                    {diag.configurable.customizableWithoutOptions > 0 && " (sospechosos)"}
                  </p>
                </div>
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
                  El mapeo se hace abajo con preview en vivo sobre un producto real.
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
                        <td className="px-3 py-1">
                          <div>{c.label}</div>
                          <code className="text-[10px] text-muted-foreground">{c.field}</code>
                        </td>
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

      {/* Mapeo de campos API → BD */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 flex-1 min-w-[260px]">
              <Badge tone="primary">Mapeo</Badge>
              <div>
                <p className="text-sm font-medium">Mapeo de campos API → BD</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Por cada columna de tu BD elegí qué campo de la API la llena. El valor de muestra
                  se calcula en vivo con un producto real del cached payload. Se autoguarda.
                  Después click "Aplicar mapping" para persistir a todos los productos.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {mappingSaving && (
                <span className="text-[11px] text-muted-foreground">guardando…</span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={applyRecommendedMapping}
                disabled={loadingPreset || applyingMapping}
                title="Carga el mapeo recomendado por defecto para Sonance (35+ campos)"
              >
                {loadingPreset ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Cargando…</>
                ) : (
                  <><Sparkles className="mr-1.5 h-3.5 w-3.5" />Aplicar mapeo recomendado</>
                )}
              </Button>
              {!applyingMapping ? (
                <Button
                  size="sm"
                  onClick={runApplyMapping}
                  disabled={Object.keys(mapping).length === 0}
                  title={Object.keys(mapping).length === 0 ? "Definí al menos un mapeo primero" : undefined}
                >
                  Aplicar mapping a todos los productos
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={cancelApplyMapping}>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Cancelar
                </Button>
              )}
            </div>
          </div>

          {/* Sample product banner */}
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
            <div className="flex-1 min-w-[200px]">
              {sampleProduct ? (
                <p className="text-xs">
                  <span className="text-muted-foreground">Producto de ejemplo:</span>{" "}
                  <code className="font-mono text-foreground">{sampleProduct.sku}</code>{" "}
                  <span className="text-muted-foreground">·</span>{" "}
                  <span className="text-foreground">{sampleProduct.productTitle}</span>{" "}
                  <Badge tone="muted">{sampleProduct.brand}</Badge>
                </p>
              ) : sampleLoading ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Cargando producto de ejemplo…
                </p>
              ) : sampleError ? (
                <p className="text-xs text-warning">{sampleError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Sin producto de ejemplo. Sincronizá primero para cargar el catálogo.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => loadSampleProduct(false)}
                disabled={sampleLoading}
              >
                Primer producto
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => loadSampleProduct(true)}
                disabled={sampleLoading}
              >
                Otro al azar
              </Button>
            </div>
          </div>

          {applyMappingError && <p className="text-xs text-destructive">{applyMappingError}</p>}
          {applyMappingProgress && applyMappingProgress.total > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Aplicando: {applyMappingProgress.done} / {applyMappingProgress.total} ·{" "}
                {applyMappingProgress.updated} actualizados ·{" "}
                {applyMappingProgress.created} creados
              </p>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (applyMappingProgress.done / Math.max(1, applyMappingProgress.total)) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="border border-border rounded-md overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Campo BD</th>
                    <th className="px-3 py-1.5 text-left font-medium">Tipo</th>
                    <th className="px-3 py-1.5 text-left font-medium">Mapear desde API</th>
                    <th className="px-3 py-1.5 text-left font-medium">Valor de ejemplo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(dbColumns ?? []).map((col) => {
                    const current = mapping[col.field] ?? "";
                    const sampleValue =
                      current && sampleProduct
                        ? formatSampleValue(resolvePath(sampleProduct.detail, current))
                        : null;
                    return (
                      <tr key={col.field}>
                        <td className="px-3 py-1 align-top max-w-[240px]">
                          <div className="font-medium">{col.label}</div>
                          <code className="text-[10px] text-muted-foreground">{col.field}</code>
                          {col.description && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {col.description}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-1 text-muted-foreground align-top">{col.type}</td>
                        <td className="px-3 py-1 align-top">
                          <select
                            value={current}
                            onChange={(e) =>
                              setMapping((prev) => {
                                const next = { ...prev };
                                if (e.target.value) next[col.field] = e.target.value;
                                else delete next[col.field];
                                return next;
                              })
                            }
                            className="h-7 w-full max-w-[360px] rounded border border-border bg-background px-2 text-xs"
                          >
                            <option value="">— sin mapear —</option>
                            {apiPathGroups.map((g) => (
                              <optgroup key={g.group} label={g.group}>
                                {g.paths.map((p) => (
                                  <option key={p.path} value={p.path}>
                                    {p.label}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-1 align-top max-w-[300px]">
                          {!current ? (
                            <span className="text-muted-foreground">—</span>
                          ) : sampleProduct == null ? (
                            <span className="text-muted-foreground italic">sin sample</span>
                          ) : sampleValue === "—" ? (
                            <span className="text-warning">vacío / null</span>
                          ) : (
                            <span className="font-mono text-foreground break-words text-[11px]">
                              {sampleValue}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {dbColumns == null && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground text-xs">
                        Click "Ver columnas BD" arriba para cargar la lista de campos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {Object.keys(mapping).length} campos mapeados · Autosave activo · Reemplaza imágenes y accesorios al aplicar.
          </p>
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

      {/* Apply mapping success banner */}
      {applyMappingProgress != null && applyMappingProgress.total > 0 && !applyingMapping && applyMappingProgress.done >= applyMappingProgress.total && (
        <Card>
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <p className="text-sm font-medium">
                Mapping aplicado: {applyMappingProgress.updated} actualizados
                {applyMappingProgress.created > 0 ? `, ${applyMappingProgress.created} creados` : ""}
                {applyMappingProgress.skippedNoDetail > 0 ? `, ${applyMappingProgress.skippedNoDetail} saltados` : ""}
                {" "}de {applyMappingProgress.total} totales.
              </p>
            </div>
            <p className="text-xs text-muted-foreground pl-6">
              Datos escritos por tipo:{" "}
              <strong>{applyMappingProgress.withSpecifications}</strong> con specs ·{" "}
              <strong>{applyMappingProgress.withDocuments}</strong> con docs ·{" "}
              <strong>{applyMappingProgress.withImageRels}</strong> con imágenes.
            </p>
            <p className="text-xs text-muted-foreground pl-6">
              Relaciones producto-producto:{" "}
              <strong>{applyMappingProgress.withAccessoryRels}</strong> con accesorios ·{" "}
              <strong>{applyMappingProgress.withCrossSellRels}</strong> con cross-sells ·{" "}
              <strong>{applyMappingProgress.withAlsoPurchasedRels}</strong> con also-purchased.
            </p>
            {applyMappingProgress.skippedNoDetail > 0 && (
              <p className="text-xs text-warning pl-6">
                ⚠️ {applyMappingProgress.skippedNoDetail} productos se saltaron porque su detalle V1 NO está descargado.
                Re-sincronizá para completarlos.
              </p>
            )}
            <p className="text-xs text-muted-foreground pl-6">
              Andá a <code>/admin/products</code> para verlos.
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
