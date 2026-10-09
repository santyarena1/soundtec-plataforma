"use client";

/**
 * Panel derecho del Room Builder, en pestañas:
 * - Equipos: qué falta elegir y, en el equipo abierto, los productos sugeridos.
 * - Sala: medidas y plano.
 * - Integración: procesadores, teclas y accesorios que pide lo elegido.
 * - Guía: qué plataforma y audio convienen para este ambiente.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { furnitureGroups, resolveSceneFurniture, type FurnitureOverrides } from "@/services/room-builder/furnishing";
import { Check, ChevronDown, Loader2, Minus, Plus, Search, Trash2, X } from "lucide-react";
import { CatalogSearch } from "./catalog-search";
import { MAX_UNITS } from "@/services/room-builder/units";
import type { MountOption, RankSortMode } from "@/services/room-builder/types";
import type { CatalogHit } from "@/services/room-builder/custom-devices";
import type { RoomScene } from "@/services/room-builder/scene";
import { PlatformGuideCard } from "./platform-guide-card";
import { PlanPanel } from "./plan-panel";
import { DimensionsPanel } from "./dimensions-panel";
import { InterconnectPanel } from "./interconnect-panel";
import { SystemPanel, useSystemCheck } from "./system-panel";
import { CablingPanel } from "./cabling/cabling-panel";
import type { CablingState } from "./cabling/use-cabling";

export type RankRow = {
  productId: string;
  name: string;
  sku: string | null;
  brand: string | null;
  imageUrl: string | null;
  score: number;
  compatible: boolean;
  hardRejectReason?: string;
  priceUsd: number | null;
  coverageFit: number | null;
  stockScore: number;
  listPriceUsd: number | null;
  /** De una marca elegida en el relevamiento. */
  preferredBrand?: boolean;
};

export type StagedProduct = {
  productId: string;
  name: string;
  brand: string | null;
  role: string;
};

export const ROLE_LABELS: Record<string, string> = {
  camera: "Cámara",
  mic: "Micrófono",
  display: "Pantalla",
  speaker: "Parlante",
  touch: "Panel táctil",
  codec: "Códec / PC de sala",
  processor: "Procesador",
  furniture: "Mueble",
  other: "Otro",
};

const MOUNT_LABELS: Record<string, string> = {
  wall: "en pared",
  ceiling: "en techo",
  table: "sobre mesa",
  rack: "en rack",
  floor: "de piso",
};

const SORT_LABELS: Record<RankSortMode, string> = {
  recommended: "Recomendados",
  price_asc: "Más económicos",
  coverage: "Mejor cobertura",
  stock: "Con stock",
  premium: "Premium",
};

type Tab = "equipos" | "sala" | "sistema" | "cableado" | "guia";

export function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role;
}

function Thumb({ src, size = "h-10 w-10" }: { src?: string | null; size?: string }) {
  return (
    <div className={`${size} shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-contain p-0.5" draggable={false} />
      ) : null}
    </div>
  );
}

function ProductOption({
  row,
  highlight,
  active,
  disabled,
  onPick,
}: {
  row: RankRow;
  highlight: boolean;
  active: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const fit = Math.max(0, Math.min(100, Math.round(row.score)));
  return (
    <button
      type="button"
      disabled={!row.compatible || disabled}
      onClick={onPick}
      className={`group flex w-full gap-2.5 rounded-lg border p-2 text-left transition hover:border-[#1e3553]/50 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-55 ${
        active ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white"
      }`}
    >
      <Thumb src={row.imageUrl} size="h-12 w-12" />
      <div className="min-w-0 flex-1">
        {row.brand ? <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">{row.brand}</p> : null}
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-slate-900">{row.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
          {highlight ? <span className="rounded bg-[#1e3553] px-1.5 py-0.5 font-semibold text-white">Recomendado</span> : null}
          {row.preferredBrand ? <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-800">Marca elegida</span> : null}
          {row.priceUsd != null ? <span className="font-semibold text-slate-700">USD {row.priceUsd.toFixed(0)}</span> : null}
          {row.coverageFit != null ? <span className="text-slate-500">Cobertura {(row.coverageFit * 100).toFixed(0)}%</span> : null}
          <span className="flex items-center gap-1 text-slate-400" title="Qué tan bien encaja con este ambiente">
            <span className="h-1 w-10 overflow-hidden rounded-full bg-slate-200">
              <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${fit}%` }} />
            </span>
            {fit}
          </span>
        </div>
        {!row.compatible ? <p className="mt-1 text-[11px] text-red-600">{row.hardRejectReason || "No compatible con este lugar"}</p> : null}
      </div>
    </button>
  );
}

function ProductPicker({
  device,
  ranked,
  ranking,
  query,
  rankMode,
  staged,
  pending,
  onQuery,
  onRankMode,
  onPick,
  onClear,
  onQuantity,
  onPickAny,
  onRemove,
}: {
  device: RoomScene["devices"][number] | undefined;
  ranked: RankRow[];
  ranking: boolean;
  query: string;
  rankMode: RankSortMode;
  staged: StagedProduct | null;
  pending: boolean;
  onQuery: (q: string) => void;
  onRankMode: (m: RankSortMode) => void;
  onPick: (row: RankRow) => void;
  onClear: () => void;
  onQuantity: (n: number) => void;
  /** Cualquier producto del catálogo (búsqueda libre). */
  onPickAny: (productId: string) => void;
  /** Solo para equipos agregados a mano. */
  onRemove?: () => void;
}) {
  const firstCompatible = ranked.find((r) => r.compatible)?.productId;
  const [source, setSource] = useState<"sugeridos" | "catalogo">("sugeridos");
  return (
    <div className="space-y-2.5 border-t border-slate-200 bg-slate-50/70 p-2.5">
      {device ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
          <div>
            <p className="text-xs font-semibold text-slate-800">Cantidad en la sala</p>
            <p className="text-[10.5px] text-slate-500">Arrastrá cada una en el 3D para ubicarla</p>
          </div>
          <div className="flex items-center rounded-lg border border-slate-300">
            <button
              type="button"
              disabled={pending || device.quantity <= 1}
              onClick={() => onQuantity(device.quantity - 1)}
              className="p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-30"
              aria-label="Una menos"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[1.75rem] text-center text-sm font-semibold tabular-nums">{device.quantity}</span>
            <button
              type="button"
              disabled={pending || device.quantity >= MAX_UNITS}
              onClick={() => onQuantity(device.quantity + 1)}
              className="p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-30"
              aria-label="Una más"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
      {device?.productName ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white p-2">
          <Thumb src={device.imageUrl} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Elegido</p>
            <p className="truncate text-xs font-medium text-slate-900">
              {device.brandName ? `${device.brandName} · ` : ""}
              {device.productName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            disabled={pending}
            className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
            title="Quitar el producto de este equipo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-700">{device?.productName ? "Cambiar por otro" : "Elegí el producto"}</p>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] font-semibold">
          {(
            [
              ["sugeridos", "Sugeridos"],
              ["catalogo", "Todo el catálogo"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setSource(m)}
              className={`rounded-md px-2 py-1 ${source === m ? "bg-[#1e3553] text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {source === "catalogo" ? (
        <CatalogSearch onPick={(hit) => onPickAny(hit.productId)} disabled={pending} autoFocus />
      ) : (
        <>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder="Buscar marca o modelo…"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-7 pr-2 text-sm focus:border-[#1e3553] focus:outline-none focus:ring-2 focus:ring-[#1e3553]/15"
              />
            </div>
            <select
              value={rankMode}
              onChange={(e) => onRankMode(e.target.value as RankSortMode)}
              className="rounded-lg border border-slate-300 bg-white px-2 text-xs"
              aria-label="Ordenar"
            >
              {(Object.keys(SORT_LABELS) as RankSortMode[]).map((m) => (
                <option key={m} value={m}>
                  {SORT_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            {ranking ? (
              <p className="flex items-center gap-2 py-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando los que mejor encajan…
              </p>
            ) : null}
            {!ranking && ranked.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-center text-xs text-slate-500">
                No hay sugeridos para este equipo.{" "}
                <button type="button" onClick={() => setSource("catalogo")} className="font-semibold text-[#1e3553] underline">
                  Buscar en todo el catálogo
                </button>
              </div>
            ) : null}
            {ranked.map((row) => (
              <ProductOption
                key={row.productId}
                row={row}
                highlight={rankMode === "recommended" && row.productId === firstCompatible && !query}
                active={staged?.productId === row.productId || device?.productId === row.productId}
                disabled={pending}
                onPick={() => onPick(row)}
              />
            ))}
            {!ranking && ranked.length > 0 ? (
              <button type="button" onClick={() => setSource("catalogo")} className="w-full pt-1 text-center text-[11px] font-semibold text-[#1e3553] underline">
                ¿No está? Buscar en todo el catálogo
              </button>
            ) : null}
          </div>
        </>
      )}

      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={pending}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Quitar este equipo del ambiente
        </button>
      ) : null}
    </div>
  );
}

const MOUNT_CHOICES: Array<[MountOption, string]> = [
  ["ceiling", "Techo"],
  ["wall", "Pared"],
  ["table", "Mesa / mueble"],
  ["floor", "Piso"],
  ["rack", "Rack"],
];

/** Agregar cualquier producto del catálogo al ambiente, con el montaje elegido. */
function AddDevicePanel({
  pending,
  onAdd,
  onClose,
}: {
  pending: boolean;
  onAdd: (productId: string, mount: MountOption, quantity: number) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<CatalogHit | null>(null);
  const [mount, setMount] = useState<MountOption>("ceiling");
  const [quantity, setQuantity] = useState(1);
  return (
    <div className="space-y-2.5 rounded-xl border border-[#1e3553]/30 bg-slate-50 p-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-900">Agregar equipo al ambiente</p>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-200" aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </div>
      {!picked ? (
        <CatalogSearch
          autoFocus
          disabled={pending}
          onPick={(hit) => {
            setPicked(hit);
            setMount(hit.mount);
          }}
        />
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
            <Thumb src={picked.imageUrl} />
            <div className="min-w-0 flex-1">
              {picked.brand ? <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">{picked.brand}</p> : null}
              <p className="truncate text-xs font-medium text-slate-900">{picked.name}</p>
            </div>
            <button type="button" onClick={() => setPicked(null)} className="text-[11px] font-semibold text-[#1e3553] underline">
              Cambiar
            </button>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold text-slate-700">¿Dónde va?</p>
            <div className="flex flex-wrap gap-1">
              {MOUNT_CHOICES.map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMount(m)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${mount === m ? "border-[#1e3553] bg-[#1e3553] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-slate-700">Cantidad</p>
            <div className="flex items-center rounded-lg border border-slate-300 bg-white">
              <button type="button" disabled={quantity <= 1} onClick={() => setQuantity((q) => q - 1)} className="p-1.5 text-slate-600 disabled:opacity-30" aria-label="Una menos">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[1.75rem] text-center text-sm font-semibold tabular-nums">{quantity}</span>
              <button type="button" disabled={quantity >= MAX_UNITS} onClick={() => setQuantity((q) => q + 1)} className="p-1.5 text-slate-600 disabled:opacity-30" aria-label="Una más">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => onAdd(picked.productId, mount, quantity)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#1e3553] py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Agregar y ubicar en el 3D
          </button>
          <p className="text-[10.5px] text-slate-500">Después lo arrastrás en el 3D al lugar exacto.</p>
        </div>
      )}
    </div>
  );
}

/** Muebles y objetos de la sala, por grupo: quitar o volver a poner. */
function FurnitureList({ scene, category, onChange }: { scene: RoomScene; category: string; onChange: (next: FurnitureOverrides) => void }) {
  const groups = useMemo(() => furnitureGroups(resolveSceneFurniture(scene, category)), [scene, category]);
  const removed = new Set(scene.furniture?.removed ?? []);
  const touched = removed.size > 0 || Object.keys(scene.furniture?.moved ?? {}).length > 0;
  const setGroup = (ids: string[], show: boolean) => {
    const next = new Set(removed);
    for (const id of ids) {
      if (show) next.delete(id);
      else next.add(id);
    }
    onChange({ ...(scene.furniture ?? {}), removed: [...next] });
  };
  if (!groups.length) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Muebles y objetos</h3>
        {touched ? (
          <button type="button" onClick={() => onChange({})} className="text-[11px] font-semibold text-[#1e3553] underline">
            Restaurar todo
          </button>
        ) : null}
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">Tocá un mueble en el 3D para moverlo, girarlo o quitarlo. Acá los volvés a poner.</p>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {groups.map((g) => {
          const removedHere = g.ids.filter((id) => removed.has(id)).length;
          const allRemoved = removedHere === g.ids.length;
          return (
            <li key={g.group} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <div className="min-w-0">
                <p className={`truncate text-xs font-medium ${allRemoved ? "text-slate-400 line-through" : "text-slate-800"}`}>
                  {g.group}
                  {g.ids.length > 1 ? <span className="ml-1 font-normal text-slate-400">×{g.visible}{g.visible !== g.ids.length ? ` de ${g.ids.length}` : ""}</span> : null}
                </p>
                {g.hiddenByDisplay ? <p className="text-[10.5px] text-sky-700">Lo tapa una pantalla</p> : null}
              </div>
              <button
                type="button"
                onClick={() => setGroup(g.ids, removedHere > 0)}
                className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
              >
                {removedHere > 0 ? "Volver a poner" : "Quitar"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function EditorSidebar({
  projectId,
  category,
  platform,
  scene,
  staged,
  ranked,
  ranking,
  query,
  rankMode,
  pending,
  onSelectSlot,
  onCancelStaged,
  onQuery,
  onRankMode,
  onPickProduct,
  onClearProduct,
  onQuantity,
  onFurnitureChange,
  onReload,
  onPickAny,
  onAddDevice,
  onRemoveDevice,
  cabling,
  showCables = false,
  onShowCables = () => {},
}: {
  projectId: string;
  category: string;
  platform: string | null;
  scene: RoomScene;
  staged: StagedProduct | null;
  ranked: RankRow[];
  ranking: boolean;
  query: string;
  rankMode: RankSortMode;
  pending: boolean;
  onSelectSlot: (slotKey: string) => void;
  onCancelStaged: () => void;
  onQuery: (q: string) => void;
  onRankMode: (m: RankSortMode) => void;
  onPickProduct: (row: RankRow) => void;
  onClearProduct: () => void;
  onQuantity: (slotKey: string, quantity: number) => void;
  onFurnitureChange: (next: FurnitureOverrides) => void;
  onReload: () => void;
  /** Cualquier producto del catálogo en un equipo existente. */
  onPickAny: (slotKey: string, productId: string) => void;
  /** Equipo nuevo, de cualquier producto y con cualquier montaje. */
  onAddDevice: (productId: string, mount: MountOption, quantity: number) => void;
  onRemoveDevice: (slotKey: string) => void;
  /** Cableado del ambiente (pestaña Cableado). */
  cabling?: CablingState;
  showCables?: boolean;
  onShowCables?: (v: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("equipos");
  const [adding, setAdding] = useState(false);
  /** Equipo cerrado a mano aunque esté seleccionado (tocar el abierto lo colapsa). */
  const [collapsedKey, setCollapsedKey] = useState<string | null>(null);
  const openRef = useRef<HTMLLIElement>(null);
  const devicesKey = scene.devices.map((d) => `${d.slotKey}:${d.productId ?? ""}:${d.quantity}`).join("|");
  const system = useSystemCheck(projectId, devicesKey);
  const problems = system.findings?.filter((f) => f.level === "error" || f.level === "warn").length ?? 0;
  const cableIssues = cabling?.plan?.findings.filter((f) => f.level === "error" || f.level === "warn").length ?? 0;
  const total = scene.slots.length;
  const done = scene.slots.filter((s) => scene.devices.some((d) => d.slotKey === s.key && d.productId)).length;

  // Tocar un equipo en el 3D abre su ficha acá.
  useEffect(() => {
    if (!scene.selectedSlotKey) return;
    setTab("equipos");
    setCollapsedKey(null);
    const t = setTimeout(() => openRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
    return () => clearTimeout(t);
  }, [scene.selectedSlotKey]);

  const tabs: Array<[Tab, string]> = [
    ["equipos", `Equipos ${done}/${total}`],
    ["sala", "Sala"],
    ["sistema", problems ? `Sistema · ${problems}` : "Sistema"],
    ["cableado", cableIssues ? `Cableado · ${cableIssues}` : "Cableado"],
    ["guia", "Guía"],
  ];

  return (
    <aside className="flex max-h-[46vh] w-full shrink-0 flex-col overflow-hidden border-t border-slate-200 bg-white xl:h-full xl:max-h-none xl:w-[380px] xl:border-l xl:border-t-0">
      <nav className="flex shrink-0 gap-1 border-b border-slate-200 bg-white px-2 pt-2" aria-label="Secciones del proyecto">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px rounded-t-lg border-b-2 px-2.5 py-2 text-xs font-semibold transition ${
              tab === key ? "border-[#1e3553] text-[#1e3553]" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === "equipos" ? (
          <div className="space-y-3 p-3">
            <div>
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Equipos de la sala</h2>
                <button
                  type="button"
                  onClick={() => setAdding((v) => !v)}
                  className="ml-auto mr-2 inline-flex items-center gap-1 rounded-lg bg-[#1e3553] px-2 py-1 text-[11px] font-semibold text-white"
                >
                  <Plus className="h-3.5 w-3.5" /> Agregar equipo
                </button>
                <span className="text-[11px] font-medium text-slate-500">
                  {done} de {total} elegidos
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Abrí un equipo (acá o tocándolo en el 3D) y elegí el producto. Con <b>Autocompletar</b> se eligen todos solos.
              </p>
            </div>

            {adding ? (
              <AddDevicePanel
                pending={pending}
                onClose={() => setAdding(false)}
                onAdd={(productId, mount, quantity) => {
                  onAddDevice(productId, mount, quantity);
                  setAdding(false);
                }}
              />
            ) : null}

            {staged ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-[11px] text-emerald-900">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {staged.brand ? `${staged.brand} · ` : ""}
                    {staged.name}
                  </p>
                  <p className="mt-0.5">Tocá otro lugar verde (en la lista o en el 3D) para poner uno más igual.</p>
                </div>
                <button type="button" onClick={onCancelStaged} className="shrink-0 font-semibold underline">
                  Listo
                </button>
              </div>
            ) : null}

            <ul className="space-y-1.5">
              {scene.slots.map((slot) => {
                const device = scene.devices.find((d) => d.slotKey === slot.key);
                const open = scene.selectedSlotKey === slot.key && !staged && collapsedKey !== slot.key;
                const canPlace = staged != null && slot.role === staged.role;
                const chosen = Boolean(device?.productId);
                return (
                  <li
                    key={slot.key}
                    ref={open ? openRef : undefined}
                    className={`overflow-hidden rounded-xl border transition ${
                      canPlace ? "border-emerald-400 ring-2 ring-emerald-200" : open ? "border-[#1e3553]/40 shadow-md" : "border-slate-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (open) {
                          setCollapsedKey(slot.key);
                          return;
                        }
                        setCollapsedKey(null);
                        if (scene.selectedSlotKey !== slot.key || staged) onSelectSlot(slot.key);
                      }}
                      aria-expanded={open}
                      className={`flex w-full items-center gap-2.5 p-2 text-left ${canPlace ? "bg-emerald-50" : open ? "bg-white" : "bg-white hover:bg-slate-50"}`}
                    >
                      {chosen ? (
                        <Thumb src={device?.imageUrl} />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-300 text-[10px] font-semibold text-slate-400">
                          {roleLabel(slot.role).slice(0, 3)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-slate-900">{slot.label}</p>
                        <p className={`truncate text-[11px] ${chosen ? "text-slate-600" : "text-amber-700"}`}>
                          {canPlace
                            ? "Tocá para ponerlo acá"
                            : chosen
                              ? `${(device?.quantity ?? 1) > 1 ? `${device?.quantity} × ` : ""}${device?.brandName ? `${device.brandName} · ` : ""}${device?.productName ?? ""}`
                              : `Falta elegir · ${roleLabel(slot.role).toLowerCase()} ${MOUNT_LABELS[slot.mount] ?? ""}`}
                        </p>
                      </div>
                      {chosen ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : null}
                      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
                    </button>
                    {open ? (
                      <ProductPicker
                        device={device}
                        ranked={ranked}
                        ranking={ranking}
                        query={query}
                        rankMode={rankMode}
                        staged={staged}
                        pending={pending}
                        onQuery={onQuery}
                        onRankMode={onRankMode}
                        onPick={onPickProduct}
                        onClear={onClearProduct}
                        onQuantity={(n) => onQuantity(slot.key, n)}
                        onPickAny={(productId) => onPickAny(slot.key, productId)}
                        onRemove={slot.key.startsWith("custom_") || slot.key.startsWith("bom_") ? () => onRemoveDevice(slot.key) : undefined}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {tab === "sala" ? (
          <div className="space-y-4 p-3">
            <p className="text-[11px] leading-relaxed text-slate-500">
              Medidas reales del ambiente. Al cambiarlas se reubican los equipos y se recalcula la cobertura.
            </p>
            <DimensionsPanel
              projectId={projectId}
              widthM={scene.widthM}
              depthM={scene.depthM}
              heightM={scene.heightM}
              onUpdated={onReload}
            />
            <FurnitureList scene={scene} category={category} onChange={onFurnitureChange} />
            <PlanPanel projectId={projectId} planImageUrl={scene.plan?.imageUrl} onUpdated={onReload} />
          </div>
        ) : null}

        {tab === "sistema" ? (
          <div className="space-y-5 p-3">
            <SystemPanel
              projectId={projectId}
              findings={system.findings}
              loading={system.loading}
              onReload={() => void system.reload()}
              onProjectChanged={onReload}
            />
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">Accesorios del catálogo</h3>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Accesorios incluidos o recomendados de lo elegido (cajas de embutir, fuentes, teclas). Tildá lo que querés sumar.
              </p>
              <InterconnectPanel projectId={projectId} onUpdated={onReload} />
            </div>
          </div>
        ) : null}

        {tab === "cableado" && cabling ? <CablingPanel state={cabling} show3d={showCables} onShow3d={onShowCables} /> : null}
        {tab === "guia" ? (
          <div className="space-y-3 p-3">
            <PlatformGuideCard category={category} platform={platform} />
            <div className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
              <p className="font-semibold text-slate-800">Cómo moverte en el 3D</p>
              <p className="mt-1">
                Arrastrá para girar, rueda o pellizco para acercar, clic derecho o dos dedos para desplazar. Las vistas de arriba (General, Cine,
                Planta…) llevan la cámara sola. Tocá un equipo para ver su ficha.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
