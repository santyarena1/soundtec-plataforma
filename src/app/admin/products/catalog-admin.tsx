"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatUsd } from "@/lib/utils";
import {
  Eye,
  ImageIcon,
  Loader2,
  Search,
  Settings2,
  Sparkles,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { bulkUpdateProducts } from "@/server/actions/admin-catalog";
import { bulkGenerateDescriptions, bulkSearchImages } from "@/server/actions/product-enrichment";

type Option = { id: string; name: string };

interface Row {
  id: string;
  sku: string;
  supplierSku: string;
  name: string;
  originalName: string;
  primaryImage: string | null;
  brand: string | null;
  brandId: string | null;
  category: string | null;
  categoryId: string | null;
  family: string | null;
  familyId: string | null;
  distributor: string | null;
  distributorId: string | null;
  cost: number;
  discountPercent: number | null;
  tariffPosition: string | null;
  tariffDutyPercent: number | null;
  stockStatus: string;
  stockQuantity: number | null;
  isActive: boolean;
  isCustomizable: boolean;
  kind: "PRINCIPAL" | "ACCESORIO";
  shortDescription: string | null;
  longDescription: string | null;
  aiGeneratedDescription: boolean;
  updatedAt: string;
}

interface Filters {
  q: string;
  brandIds: string[];
  categoryIds: string[];
  familyIds: string[];
  distributorIds: string[];
  stockStatuses: string[];
  active: string;
  nocat: boolean;
  noimg: boolean;
  nodesc: boolean;
  sort: string;
}

interface Props {
  rows: Row[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  showPrices: boolean;
  filters: Filters;
  brands: Option[];
  categories: Option[];
  families: Option[];
  distributors: Option[];
}

type ColumnKey =
  | "image"
  | "name"
  | "originalName"
  | "sku"
  | "supplierSku"
  | "brand"
  | "category"
  | "family"
  | "distributor"
  | "kind"
  | "customizable"
  | "cost"
  | "discount"
  | "tariff"
  | "stock"
  | "active"
  | "shortDesc"
  | "aiDesc"
  | "updated"
  | "actions";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  requiresPrices?: boolean;
  fixed?: boolean;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "image", label: "Imagen" },
  { key: "name", label: "Producto", fixed: true },
  { key: "originalName", label: "Nombre original" },
  { key: "sku", label: "SKU interno" },
  { key: "supplierSku", label: "SKU proveedor" },
  { key: "brand", label: "Marca" },
  { key: "category", label: "Categoría" },
  { key: "family", label: "Familia" },
  { key: "distributor", label: "Distribuidor" },
  { key: "kind", label: "Tipo" },
  { key: "customizable", label: "Configurable" },
  { key: "cost", label: "Costo USD", requiresPrices: true },
  { key: "discount", label: "Descuento %", requiresPrices: true },
  { key: "tariff", label: "Pos. arancelaria", requiresPrices: true },
  { key: "stock", label: "Stock" },
  { key: "active", label: "Activo" },
  { key: "shortDesc", label: "Descripción corta" },
  { key: "aiDesc", label: "Desc. IA" },
  { key: "updated", label: "Actualizado" },
  { key: "actions", label: "Acciones", fixed: true },
];

const DEFAULT_COLUMNS: ColumnKey[] = [
  "image",
  "name",
  "sku",
  "brand",
  "category",
  "cost",
  "discount",
  "stock",
  "active",
  "actions",
];

const STORAGE_KEY = "soundtec.admin.products.columns";

export function ProductsCatalogAdmin(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string>("activate");
  const [bulkBrandId, setBulkBrandId] = useState("");
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkDiscount, setBulkDiscount] = useState("");
  const [pending, start] = useTransition();
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);

  const [activeCols, setActiveCols] = useState<ColumnKey[]>(() => {
    if (typeof window === "undefined") return DEFAULT_COLUMNS;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        const valid = parsed.filter((p): p is ColumnKey => ALL_COLUMNS.some((c) => c.key === p));
        if (valid.length > 0) return valid as ColumnKey[];
      }
    } catch {}
    return DEFAULT_COLUMNS;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(activeCols));
    } catch {}
  }, [activeCols]);

  function toggleColumn(key: ColumnKey) {
    setActiveCols((prev) => {
      if (prev.includes(key)) return prev.filter((c) => c !== key);
      const idx = ALL_COLUMNS.findIndex((c) => c.key === key);
      const ordered = ALL_COLUMNS.filter((c) => prev.includes(c.key) || c.key === key).map((c) => c.key);
      return ordered;
    });
  }

  const visibleColumns = useMemo(
    () =>
      ALL_COLUMNS.filter(
        (c) => (activeCols.includes(c.key) || c.fixed) && (props.showPrices || !c.requiresPrices)
      ),
    [activeCols, props.showPrices]
  );

  const qFromUrl = search.get("q") || "";
  const brandIdsFromUrl = search.getAll("brand");
  const categoryIdsFromUrl = search.getAll("category");
  const familyIdsFromUrl = search.getAll("family");
  const distributorIdsFromUrl = search.getAll("distributor");
  const stockFromUrl = search.getAll("stock");
  const activeFromUrl = search.get("active") || "";
  const sortFromUrl = search.get("sort") || "updated_desc";

  const [qInput, setQInput] = useState(qFromUrl);
  const debouncedQ = useDebouncedValue(qInput, 350);

  useEffect(() => { setQInput(qFromUrl); }, [qFromUrl]);

  type FilterPatch = Partial<{
    q: string; brand: string[]; category: string[]; family: string[];
    distributor: string[]; stock: string[]; active: string; sort: string;
    nocat: string; noimg: string; nodesc: string; page: string;
  }>;

  const pushFilters = useCallback(
    (patch: FilterPatch) => {
      const sp = new URLSearchParams(search.toString());
      if (patch.q !== undefined) { patch.q.trim() ? sp.set("q", patch.q.trim()) : sp.delete("q"); }
      for (const key of ["brand", "category", "family", "distributor", "stock"] as const) {
        if (patch[key] !== undefined) {
          sp.delete(key);
          for (const id of patch[key]!) sp.append(key, id);
        }
      }
      if (patch.active !== undefined) { patch.active ? sp.set("active", patch.active) : sp.delete("active"); }
      if (patch.sort !== undefined) { patch.sort && patch.sort !== "updated_desc" ? sp.set("sort", patch.sort) : sp.delete("sort"); }
      for (const key of ["nocat", "noimg", "nodesc"] as const) {
        if (patch[key] !== undefined) { patch[key] === "1" ? sp.set(key, "1") : sp.delete(key); }
      }
      sp.set("page", patch.page ?? "1");
      if (!sp.has("pageSize")) sp.set("pageSize", String(props.pageSize));
      start(() => router.push(`${pathname}?${sp.toString()}`));
    },
    [search, pathname, props.pageSize, router, start]
  );

  useEffect(() => {
    const next = debouncedQ.trim();
    if (next === qFromUrl.trim()) return;
    pushFilters({ q: next });
  }, [debouncedQ, qFromUrl, pushFilters]);

  function buildHref(updates: Record<string, string | string[] | undefined>) {
    const sp = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(updates)) {
      sp.delete(k);
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        for (const it of v) sp.append(k, it);
      } else {
        sp.set(k, v);
      }
    }
    return `${pathname}?${sp.toString()}`;
  }

  const previewRow = props.rows.find((r) => r.id === previewId) || null;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setSelected((s) => (s.size === props.rows.length ? new Set() : new Set(props.rows.map((r) => r.id))));
  }

  function applyBulk() {
    if (selected.size === 0) return;
    if (!window.confirm(`Aplicar "${bulkAction}" a ${selected.size} producto(s)?`)) return;
    setBulkMsg(null);
    start(async () => {
      const r = await bulkUpdateProducts({
        productIds: [...selected],
        action: bulkAction as "activate" | "deactivate" | "set_brand" | "set_category" | "set_discount",
        brandId: bulkBrandId || null,
        categoryId: bulkCategoryId || null,
        discountPercent: bulkDiscount ? Number(bulkDiscount) : null,
      });
      if (r?.ok) {
        setBulkMsg(`Aplicado a ${selected.size} producto(s).`);
        setSelected(new Set());
        router.refresh();
      } else {
        setBulkMsg(r?.error || "Error");
      }
    });
  }

  function aiDescribe() {
    if (selected.size === 0) return;
    if (!window.confirm(`Generar descripciones IA para ${selected.size} producto(s)? Esto puede consumir tokens.`)) return;
    setBulkMsg(null);
    start(async () => {
      const r = await bulkGenerateDescriptions([...selected]);
      setBulkMsg(r.ok ? `Descripciones generadas: ${r.processed} (errores: ${r.errors})` : "Error en generación masiva");
      setSelected(new Set());
      router.refresh();
    });
  }

  function bulkImages() {
    if (selected.size === 0) return;
    if (!window.confirm(`Buscar y adjuntar imagen Serper para ${selected.size} producto(s) sin imágenes?`)) return;
    setBulkMsg(null);
    start(async () => {
      const r = await bulkSearchImages([...selected]);
      setBulkMsg(r.ok ? `Imágenes adjuntadas: ${r.processed} (omitidos: ${r.skipped})` : "Error en búsqueda masiva");
      setSelected(new Set());
      router.refresh();
    });
  }

  const STOCK_OPTIONS = [
    { id: "IN_STOCK", name: "En stock" },
    { id: "LOW_STOCK", name: "Stock bajo" },
    { id: "OUT_OF_STOCK", name: "Sin stock" },
    { id: "ON_REQUEST", name: "Bajo pedido" },
    { id: "UNKNOWN", name: "Desconocido" },
  ];

  const SORT_OPTIONS = [
    { value: "updated_desc", label: "Más reciente" },
    { value: "updated_asc", label: "Más antiguo" },
    { value: "name_asc", label: "Nombre A→Z" },
    { value: "name_desc", label: "Nombre Z→A" },
    { value: "cost_asc", label: "Precio ↑" },
    { value: "cost_desc", label: "Precio ↓" },
    { value: "sku_asc", label: "SKU A→Z" },
  ];

  const nocatActive = search.get("nocat") === "1";
  const noimgActive = search.get("noimg") === "1";
  const nodescActive = search.get("nodesc") === "1";

  return (
    <div className="space-y-3">
      {/* Fila 1: búsqueda + orden */}
      <div className="flex flex-wrap gap-2 rounded-md border border-border bg-card p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Buscar por SKU, nombre o SKU proveedor"
            className="pl-9"
            aria-label="Buscar productos"
          />
        </div>
        <Select
          value={sortFromUrl}
          onChange={(e) => pushFilters({ sort: e.target.value })}
          className="h-10 w-44 text-sm"
          aria-label="Ordenar por"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        {pending ? <Loader2 className="h-5 w-5 animate-spin self-center text-muted-foreground" /> : null}
      </div>

      {/* Fila 2: filtros multi-select */}
      <div className="grid gap-2 rounded-md border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        <MultiSelectFilter
          label="Marcas"
          options={props.brands}
          values={brandIdsFromUrl}
          onChange={(ids) => pushFilters({ brand: ids })}
        />
        <MultiSelectFilter
          label="Categorías"
          options={props.categories}
          values={categoryIdsFromUrl}
          onChange={(ids) => pushFilters({ category: ids })}
        />
        <MultiSelectFilter
          label="Familias"
          options={props.families}
          values={familyIdsFromUrl}
          onChange={(ids) => pushFilters({ family: ids })}
        />
        <MultiSelectFilter
          label="Distribuidores"
          options={props.distributors}
          values={distributorIdsFromUrl}
          onChange={(ids) => pushFilters({ distributor: ids })}
        />
      </div>

      {/* Fila 3: filtros rápidos */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Filtros rápidos:</span>
        <MultiSelectFilter
          label="Stock"
          options={STOCK_OPTIONS}
          values={stockFromUrl}
          onChange={(ids) => pushFilters({ stock: ids })}
          compact
        />
        <Select
          value={activeFromUrl}
          onChange={(e) => pushFilters({ active: e.target.value })}
          className="h-8 w-36 text-xs"
          aria-label="Estado activo"
        >
          <option value="">Activo: todos</option>
          <option value="yes">Solo activos</option>
          <option value="no">Solo inactivos</option>
        </Select>
        <button
          onClick={() => pushFilters({ nocat: nocatActive ? "" : "1" })}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${nocatActive ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:bg-secondary"}`}
        >
          Sin categoría
        </button>
        <button
          onClick={() => pushFilters({ noimg: noimgActive ? "" : "1" })}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${noimgActive ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:bg-secondary"}`}
        >
          Sin imagen
        </button>
        <button
          onClick={() => pushFilters({ nodesc: nodescActive ? "" : "1" })}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${nodescActive ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:bg-secondary"}`}
        >
          Sin desc. IA
        </button>
        {(brandIdsFromUrl.length || categoryIdsFromUrl.length || familyIdsFromUrl.length ||
          distributorIdsFromUrl.length || stockFromUrl.length || activeFromUrl ||
          nocatActive || noimgActive || nodescActive || qFromUrl) ? (
          <button
            onClick={() => pushFilters({ q: "", brand: [], category: [], family: [], distributor: [], stock: [], active: "", nocat: "", noimg: "", nodesc: "" })}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Limpiar filtros
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card p-3">
        <div className="text-sm">
          <span className="font-medium">{selected.size}</span> seleccionado(s)
        </div>
        <Select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)} className="h-9 w-44 text-xs">
          <option value="activate">Activar</option>
          <option value="deactivate">Desactivar</option>
          <option value="set_brand">Asignar marca</option>
          <option value="set_category">Asignar categoría</option>
          {props.showPrices ? <option value="set_discount">Aplicar descuento %</option> : null}
        </Select>
        {bulkAction === "set_brand" ? (
          <Select value={bulkBrandId} onChange={(e) => setBulkBrandId(e.target.value)} className="h-9 w-44 text-xs">
            <option value="">Sin marca</option>
            {props.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        ) : null}
        {bulkAction === "set_category" ? (
          <Select value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)} className="h-9 w-44 text-xs">
            <option value="">Sin categoría</option>
            {props.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        ) : null}
        {bulkAction === "set_discount" && props.showPrices ? (
          <Input
            type="number"
            value={bulkDiscount}
            onChange={(e) => setBulkDiscount(e.target.value)}
            min={0}
            max={100}
            step="0.1"
            placeholder="%"
            className="h-9 w-24"
          />
        ) : null}
        <Button onClick={applyBulk} disabled={pending || selected.size === 0} size="sm">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Aplicar
        </Button>
        <Button onClick={aiDescribe} disabled={pending || selected.size === 0} size="sm" variant="outline">
          <Sparkles className="h-3.5 w-3.5" /> Descripciones IA
        </Button>
        <Button onClick={bulkImages} disabled={pending || selected.size === 0} size="sm" variant="outline">
          <ImageIcon className="h-3.5 w-3.5" /> Imágenes Serper
        </Button>
        {bulkMsg ? <span className="text-xs text-muted-foreground">{bulkMsg}</span> : null}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Button
              onClick={() => setColumnPickerOpen((s) => !s)}
              variant="outline"
              size="sm"
              type="button"
            >
              <Settings2 className="h-3.5 w-3.5" /> Columnas
            </Button>
            {columnPickerOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-64 rounded-md border border-border bg-card p-3 shadow-lg">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Mostrar columnas</p>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {ALL_COLUMNS.map((c) => {
                    if (c.fixed) return null;
                    if (c.requiresPrices && !props.showPrices) return null;
                    const checked = activeCols.includes(c.key);
                    return (
                      <label key={c.key} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={checked} onChange={() => toggleColumn(c.key)} />
                        {c.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <Select
            value={String(props.pageSize)}
            onChange={(e) => router.push(buildHref({ pageSize: e.target.value, page: "1" }))}
            className="h-9 w-32 text-xs"
          >
            {[12, 25, 50, 100, 200].map((n) => (
              <option key={n} value={String(n)}>
                {n} por página
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <THead>
            <TR>
              <TH className="w-10">
                <input
                  type="checkbox"
                  checked={selected.size === props.rows.length && props.rows.length > 0}
                  onChange={toggleAll}
                />
              </TH>
              {visibleColumns.map((c) => (
                <TH key={c.key}>{c.label}</TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {props.rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </TD>
                {visibleColumns.map((c) => (
                  <TD key={c.key}>{renderCell(c.key, r, props.showPrices, setPreviewId)}</TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="muted-text">
          Mostrando {(props.page - 1) * props.pageSize + 1}-
          {Math.min(props.page * props.pageSize, props.total)} de {props.total}
        </p>
        <div className="flex gap-2">
          {props.page > 1 ? (
            <Link
              href={buildHref({ page: String(props.page - 1) })}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Anterior
            </Link>
          ) : null}
          {props.page < props.totalPages ? (
            <Link
              href={buildHref({ page: String(props.page + 1) })}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Siguiente <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </div>

      {previewRow ? <ProductPreviewModal row={previewRow} showPrices={props.showPrices} onClose={() => setPreviewId(null)} /> : null}
    </div>
  );
}

function renderCell(
  key: ColumnKey,
  r: Row,
  showPrices: boolean,
  setPreviewId: (id: string | null) => void
) {
  switch (key) {
    case "image":
      return r.primaryImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={r.primaryImage}
          alt={r.name}
          className="h-12 w-12 rounded border border-border object-contain p-0.5"
        />
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded border border-dashed border-border text-xs text-muted-foreground">
          —
        </span>
      );
    case "name":
      return (
        <div className="min-w-[160px]">
          <Link href={`/admin/products/${r.id}`} className="font-medium hover:underline">
            {r.name}
          </Link>
          <p className="text-xs text-muted-foreground">
            {r.kind === "ACCESORIO" ? "Accesorio" : "Principal"}
            {r.isCustomizable ? " · Configurable" : ""}
          </p>
        </div>
      );
    case "sku":
      return r.sku || "—";
    case "supplierSku":
      return r.supplierSku || "—";
    case "brand":
      return r.brand || "—";
    case "category":
      return r.category || "—";
    case "family":
      return r.family || "—";
    case "distributor":
      return r.distributor || "—";
    case "kind":
      return (
        <Badge tone={r.kind === "ACCESORIO" ? "warning" : "primary"}>
          {r.kind === "ACCESORIO" ? "Accesorio" : "Principal"}
        </Badge>
      );
    case "originalName":
      return <span className="max-w-[140px] truncate text-xs">{r.originalName || "—"}</span>;
    case "customizable":
      return r.isCustomizable ? <Badge tone="accent">Sí</Badge> : <span className="text-xs text-muted-foreground">No</span>;
    case "shortDesc":
      return <span className="line-clamp-2 max-w-[180px] text-xs">{r.shortDescription || "—"}</span>;
    case "aiDesc":
      return r.aiGeneratedDescription ? <Badge tone="accent">IA</Badge> : <span className="text-xs text-muted-foreground">—</span>;
    case "updated":
      return <span className="text-xs text-muted-foreground">{new Date(r.updatedAt).toLocaleDateString("es-AR")}</span>;
    case "cost":
      return showPrices ? formatUsd(r.cost) : "—";
    case "discount":
      return showPrices ? (r.discountPercent ? `${r.discountPercent}%` : "—") : "—";
    case "tariff":
      if (!showPrices) return "—";
      if (!r.tariffPosition && !r.tariffDutyPercent) return "—";
      return (
        <span className="text-xs">
          {r.tariffPosition || "—"}
          {r.tariffDutyPercent ? ` · ${r.tariffDutyPercent}%` : ""}
        </span>
      );
    case "stock":
      return <Badge tone="muted">{r.stockStatus}</Badge>;
    case "active":
      return r.isActive ? <Badge tone="success">Sí</Badge> : <Badge tone="muted">No</Badge>;
    case "actions":
      return (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => setPreviewId(r.id)}
            className="h-7 w-7 p-0"
            title="Vista rápida"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Link href={`/admin/products/${r.id}`} className="text-xs text-accent hover:underline">
            Editar
          </Link>
        </div>
      );
    default:
      return null;
  }
}

function ProductPreviewModal({
  row,
  showPrices,
  onClose,
}: {
  row: Row;
  showPrices: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{row.name}</h3>
            <p className="truncate text-xs text-muted-foreground">SKU: {row.sku || "—"}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-[200px_1fr]">
          <div>
            {row.primaryImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.primaryImage}
                alt={row.name}
                className="h-48 w-full rounded border border-border object-contain"
              />
            ) : (
              <div className="flex h-48 items-center justify-center rounded border border-dashed border-border text-xs text-muted-foreground">
                Sin imagen
              </div>
            )}
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label="Marca" value={row.brand} />
              <Info label="Categoría" value={row.category} />
              <Info label="Familia" value={row.family} />
              <Info label="Distribuidor" value={row.distributor} />
              <Info label="SKU proveedor" value={row.supplierSku || "—"} />
              <Info label="Tipo" value={row.kind === "ACCESORIO" ? "Accesorio" : "Principal"} />
              <Info label="Stock" value={`${row.stockStatus}${row.stockQuantity != null ? ` (${row.stockQuantity})` : ""}`} />
              <Info label="Activo" value={row.isActive ? "Sí" : "No"} />
              {showPrices ? <Info label="Costo USD" value={formatUsd(row.cost)} /> : null}
              {showPrices ? <Info label="Descuento" value={row.discountPercent ? `${row.discountPercent}%` : "—"} /> : null}
              {showPrices ? <Info label="Pos. arancelaria" value={row.tariffPosition || "—"} /> : null}
              {showPrices ? <Info label="Derecho arancelario" value={row.tariffDutyPercent ? `${row.tariffDutyPercent}%` : "—"} /> : null}
            </div>
            {row.shortDescription ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Descripción corta</p>
                <p className="text-sm">{row.shortDescription}</p>
              </div>
            ) : null}
            {row.longDescription ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">
                  Descripción larga {row.aiGeneratedDescription ? "(IA)" : ""}
                </p>
                <p className="whitespace-pre-wrap text-sm">{row.longDescription}</p>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-3">
          <Button variant="outline" type="button" onClick={onClose}>
            Cerrar
          </Button>
          <Link
            href={`/admin/products/${row.id}`}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Editar producto
          </Link>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

function MultiSelectFilter({
  label,
  options,
  values,
  onChange,
  compact,
}: {
  label: string;
  options: Option[];
  values: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = useMemo(() => new Set(values), [values]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, search]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  function clearAll() {
    onChange([]);
    setSearch("");
  }

  function toggleFiltered() {
    const ids = filtered.map((o) => o.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    const next = new Set(selected);
    if (allOn) {
      for (const id of ids) next.delete(id);
    } else {
      for (const id of ids) next.add(id);
    }
    onChange([...next]);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className={`flex items-center justify-between rounded-md border border-input bg-card px-3 hover:bg-secondary ${compact ? "h-8 text-xs w-28" : "h-10 w-full text-sm"}`}
      >
        <span className="truncate">
          {label}
          {selected.size > 0 ? <Badge tone="primary" className="ml-2">{selected.size}</Badge> : null}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-72 rounded-md border border-border bg-card p-2 shadow-lg">
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="mt-2 max-h-64 space-y-0.5 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">Sin resultados.</p>
            ) : (
              filtered.map((o) => (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-secondary"
                >
                  <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                  {o.name}
                </label>
              ))
            )}
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
              Limpiar
            </Button>
            <div className="flex gap-1">
              {filtered.length > 0 ? (
                <Button type="button" variant="ghost" size="sm" onClick={toggleFiltered}>
                  {filtered.every((o) => selected.has(o.id)) ? "Quitar filtrados" : "Marcar filtrados"}
                </Button>
              ) : null}
              <Button type="button" size="sm" onClick={() => setOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
