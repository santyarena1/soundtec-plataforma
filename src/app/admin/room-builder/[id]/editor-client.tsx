"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  FileSpreadsheet,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import type {
  CameraPreset,
  CoverageViewMode,
  RankSortMode,
} from "@/services/room-builder/types";
import {
  parseScene,
  type RoomScene,
} from "@/services/room-builder/scene";
import { relayoutSceneAnchors } from "@/services/room-builder/slot-layout";
import { PlanPanel } from "@/components/room-builder/plan-panel";
import { DimensionsPanel } from "@/components/room-builder/dimensions-panel";
import { InterconnectPanel } from "@/components/room-builder/interconnect-panel";

const RoomViewport = dynamic(
  () =>
    import("@/components/room-builder/room-viewport").then(
      (m) => m.RoomViewport,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-0 items-center justify-center bg-slate-200 text-sm text-slate-500">
        Cargando vista 3D…
      </div>
    ),
  },
);

type Project = {
  id: string;
  name: string;
  kind: string;
  category: string;
  templateKey: string;
  status: string;
  unitCount: number;
  platform: string | null;
  areaM2: string | number;
  heightM: string | number;
  sceneJson: unknown;
  quoteId: string | null;
  quote?: { id: string; number: string } | null;
  parent?: { id: string; name: string } | null;
  children: Array<{
    id: string;
    name: string;
    templateKey: string;
    unitCount: number;
    status: string;
    _count: { devices: number };
  }>;
  devices: Array<{
    id: string;
    slotKey: string | null;
    designRole: string | null;
    quantity: number;
    productId: string | null;
    product?: {
      id: string;
      normalizedName: string;
      brand?: { name: string } | null;
    } | null;
  }>;
};

type RankRow = {
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
};

function emptyScene(): RoomScene {
  return {
    version: 1,
    templateKey: "",
    widthM: 4,
    depthM: 3,
    heightM: 2.7,
    areaM2: 12,
    cameraPreset: "general",
    coverageView: "zones",
    selectedSlotKey: null,
    slots: [],
    devices: [],
  };
}

export function RoomBuilderEditor({
  initialProject,
}: {
  initialProject: Project;
}) {
  const [project, setProject] = useState(initialProject);
  const [scene, setScene] = useState<RoomScene>(() => {
    const parsed = parseScene(initialProject.sceneJson) ?? emptyScene();
    if (!parsed.templateKey) parsed.templateKey = initialProject.templateKey;
    const { scene: laid } = relayoutSceneAnchors(parsed);
    if (!laid.selectedSlotKey && laid.slots[0]) {
      laid.selectedSlotKey = laid.slots[0].key;
    }
    return laid;
  });
  const [ranked, setRanked] = useState<RankRow[]>([]);
  const [rankMode, setRankMode] = useState<RankSortMode>("recommended");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [ranking, setRanking] = useState(false);
  /** Producto elegido para ubicar en un slot (flujo producto → click slot). */
  const [staged, setStaged] = useState<{
    productId: string;
    name: string;
    brand: string | null;
    role: string;
  } | null>(null);

  const selectedSlot = useMemo(
    () => scene.slots.find((s) => s.key === scene.selectedSlotKey) ?? null,
    [scene],
  );

  const selectedDevice = useMemo(
    () =>
      scene.devices.find((d) => d.slotKey === scene.selectedSlotKey) ?? null,
    [scene],
  );

  const placementSlotKeys = useMemo(() => {
    if (!staged) return [];
    return scene.slots
      .filter((s) => s.role === staged.role)
      .map((s) => s.key);
  }, [staged, scene.slots]);

  const persistScene = useCallback(
    async (next: RoomScene, patch?: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/room-builder/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: next, ...patch }),
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error || "No se pudo guardar");
        return;
      }
      setProject(json.project);
      const parsed = parseScene(json.project.sceneJson) ?? next;
      setScene(relayoutSceneAnchors(parsed).scene);
    },
    [project.id],
  );

  // Persistir re-anclaje de poses viejas (proyectos creados con coords fijas).
  useEffect(() => {
    const raw = parseScene(initialProject.sceneJson);
    if (!raw) return;
    if (!raw.templateKey) raw.templateKey = initialProject.templateKey;
    const { scene: laid, changed } = relayoutSceneAnchors(raw);
    if (!changed) return;
    void persistScene(laid);
    // solo al montar / cambiar de proyecto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProject.id]);

  const loadRank = useCallback(async () => {
    if (!selectedSlot || project.kind === "hub") {
      setRanked([]);
      return;
    }
    setRanking(true);
    try {
      const params = new URLSearchParams({
        slotKey: selectedSlot.key,
        mode: rankMode,
      });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(
        `/api/admin/room-builder/projects/${project.id}/rank?${params}`,
      );
      const json = await res.json();
      if (json.ok) setRanked(json.ranked);
      else toast.error(json.error || "No se pudo rankear");
    } finally {
      setRanking(false);
    }
  }, [selectedSlot, project.id, project.kind, rankMode, query]);

  useEffect(() => {
    void loadRank();
  }, [loadRank]);

  function assignToSlot(
    slotKey: string,
    productId: string | null,
    opts?: { keepStaged?: boolean },
  ) {
    const device = scene.devices.find((d) => d.slotKey === slotKey);
    startTransition(async () => {
      const res = await fetch(
        `/api/admin/room-builder/projects/${project.id}/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slotKey,
            productId,
            quantity: device?.quantity,
          }),
        },
      );
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error || "No se pudo ubicar");
        return;
      }
      setProject(json.project);
      const nextScene = parseScene(json.project.sceneJson) ?? scene;
      nextScene.selectedSlotKey = slotKey;
      setScene(nextScene);
      if (!opts?.keepStaged) setStaged(null);
      toast.success(productId ? "Producto ubicado en el slot" : "Slot liberado");
    });
  }

  function onSelectSlot(slotKey: string) {
    // Si hay producto en mano, el click EN LA ESCENA lo ubica ahí.
    if (staged) {
      const slot = scene.slots.find((s) => s.key === slotKey);
      if (!slot) return;
      if (slot.role !== staged.role) {
        toast.error(
          `Ese slot es ${slot.role}; el producto es ${staged.role}. Elegí un slot marcado en verde.`,
        );
        return;
      }
      assignToSlot(slotKey, staged.productId);
      return;
    }
    const next = { ...scene, selectedSlotKey: slotKey };
    setScene(next);
    void persistScene(next);
  }

  function onCameraPreset(preset: CameraPreset) {
    const next = { ...scene, cameraPreset: preset };
    setScene(next);
    void persistScene(next);
  }

  function onCoverageView(mode: CoverageViewMode) {
    const next = { ...scene, coverageView: mode };
    setScene(next);
    void persistScene(next);
  }

  /**
   * Click en producto del ranking:
   * - con slot seleccionado → lo ubica ahí;
   * - si hay varios slots del mismo rol, también queda en mano para
   *   reubicarlo con click en otro slot verde (lista o 3D).
   */
  function pickProductForPlacement(row: RankRow) {
    if (!row.compatible) {
      toast.error(row.hardRejectReason || "No compatible");
      return;
    }
    if (!selectedSlot) {
      toast.error(
        "Seleccioná un slot de la lista (Display, Cámara, etc.) y después el producto",
      );
      return;
    }
    const role = selectedSlot.role;
    const targets = scene.slots.filter((s) => s.role === role);
    const multi = targets.length > 1;

    if (multi) {
      setStaged({
        productId: row.productId,
        name: row.name,
        brand: row.brand,
        role,
      });
    }

    assignToSlot(selectedSlot.key, row.productId, { keepStaged: multi });
  }

  function assignProduct(productId: string | null) {
    if (!selectedSlot) {
      toast.error("Seleccioná un slot o tomá un producto y ubicarlo en la escena");
      return;
    }
    assignToSlot(selectedSlot.key, productId);
  }

  function createQuote() {
    startTransition(async () => {
      const res = await fetch(
        `/api/admin/room-builder/projects/${project.id}/quote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error || "No se pudo cotizar");
        return;
      }
      toast.success(`Cotización ${json.number} creada`);
      window.location.href = `/admin/quotes/${json.quoteId}`;
    });
  }

  function autoFill() {
    startTransition(async () => {
      const res = await fetch(
        `/api/admin/room-builder/projects/${project.id}/autofill`,
        { method: "POST" },
      );
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error || "No se pudo autocompletar");
        return;
      }
      setProject(json.project);
      setScene(parseScene(json.project.sceneJson) ?? scene);
      toast.success(
        `Autocompletado: ${json.filled}/${json.attempted} slots`,
      );
    });
  }

  async function reloadProject() {
    const res = await fetch(`/api/admin/room-builder/projects/${project.id}`);
    const json = await res.json();
    if (json.ok) {
      setProject(json.project);
      setScene(parseScene(json.project.sceneJson) ?? scene);
    }
  }

  if (project.kind === "hub") {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <Link
          href="/admin/room-builder"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {project.name}
            </h1>
            <p className="text-sm text-slate-500">
              Hub multi-espacio · {project.category} · {project.children.length}{" "}
              ambientes
            </p>
          </div>
          <button
            type="button"
            onClick={createQuote}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1e3553] px-4 py-2 text-sm font-semibold text-white"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Generar cotización agregada
          </button>
        </header>

        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {project.children.map((child) => (
            <div
              key={child.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="font-medium text-slate-900">{child.name}</p>
                <p className="text-xs text-slate-500">
                  {child.templateKey} · ×{child.unitCount} · {child._count.devices}{" "}
                  slots · {child.status}
                </p>
              </div>
              <Link
                href={`/admin/room-builder/${child.id}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                Entrar al espacio
              </Link>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="-m-3 flex h-[calc(100dvh-3.25rem)] flex-col overflow-hidden bg-slate-100 sm:-m-6 lg:-m-10 xl:h-dvh xl:flex-row">
      {/* Columna 3D: ocupa todo el alto, sin scroll de página */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <div className="min-w-0">
            <Link
              href={
                project.parent
                  ? `/admin/room-builder/${project.parent.id}`
                  : "/admin/room-builder"
              }
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {project.parent ? project.parent.name : "Room Builder"}
            </Link>
            <h1 className="truncate text-base font-semibold leading-tight text-slate-900">
              {project.name}
            </h1>
            <p className="truncate text-[11px] text-slate-500">
              {project.category} · {project.templateKey} · ×{project.unitCount}
              {project.quote ? ` · COT ${project.quote.number}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <button
              type="button"
              onClick={autoFill}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Autocompletar
            </button>
            <button
              type="button"
              onClick={createQuote}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#1e3553] px-2.5 py-1.5 text-xs font-semibold text-white"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5" />
              )}
              Cotizar
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          <RoomViewport
            scene={scene}
            category={project.category}
            templateKey={project.templateKey}
            placementSlotKeys={placementSlotKeys}
            placementHint={
              staged
                ? `Producto en mano: ${staged.brand ? `${staged.brand} · ` : ""}${staged.name} — click en un slot verde`
                : null
            }
            onSelectSlot={onSelectSlot}
            onCameraPreset={onCameraPreset}
            onCoverageView={onCoverageView}
          />
        </div>
      </div>

      {/* Sidebar: único scroll de la pantalla */}
      <aside className="flex max-h-[42vh] w-full shrink-0 flex-col overflow-hidden border-t border-slate-200 bg-white xl:max-h-none xl:h-full xl:w-[360px] xl:border-l xl:border-t-0">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="space-y-3 border-b border-slate-100 p-3">
            <DimensionsPanel
              projectId={project.id}
              widthM={scene.widthM}
              depthM={scene.depthM}
              heightM={scene.heightM}
              onUpdated={() => void reloadProject()}
            />
            <InterconnectPanel
              projectId={project.id}
              onUpdated={() => void reloadProject()}
            />
          </div>

          <div className="border-b border-slate-100 p-3">
            <h2 className="text-sm font-semibold text-slate-900">Slots</h2>
            {staged ? (
              <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-900">
                <p className="font-semibold">
                  En mano: {staged.brand ? `${staged.brand} · ` : ""}
                  {staged.name}
                </p>
                <p className="mt-0.5">
                  Click en un slot verde (lista o 3D) para ubicarlo.
                </p>
                <button
                  type="button"
                  className="mt-1 underline"
                  onClick={() => setStaged(null)}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">
                Seleccioná un slot y un producto del ranking para ubicarlo.
              </p>
            )}
            <div className="mt-2 space-y-1">
              {scene.slots.map((slot) => {
                const device = scene.devices.find((d) => d.slotKey === slot.key);
                const active = scene.selectedSlotKey === slot.key;
                const canPlace = staged != null && slot.role === staged.role;
                return (
                  <button
                    key={slot.key}
                    type="button"
                    onClick={() => onSelectSlot(slot.key)}
                    className={`flex w-full items-start justify-between rounded-lg px-2.5 py-1.5 text-left text-sm ${
                      canPlace
                        ? "border border-emerald-400 bg-emerald-50 text-emerald-950"
                        : active
                          ? "bg-slate-900 text-white"
                          : "hover:bg-slate-50 text-slate-800"
                    }`}
                  >
                    <span>
                      <span className="font-medium">{slot.label}</span>
                      <span
                        className={`block text-[11px] ${
                          canPlace
                            ? "text-emerald-700"
                            : active
                              ? "text-slate-300"
                              : "text-slate-500"
                        }`}
                      >
                        {slot.role} · {slot.mount}
                        {canPlace ? " · click para ubicar" : ""}
                      </span>
                    </span>
                    {device?.productId ? (
                      <Check
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          active && !canPlace
                            ? "text-emerald-300"
                            : "text-emerald-600"
                        }`}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 p-3">
            <PlanPanel
              projectId={project.id}
              planImageUrl={scene.plan?.imageUrl}
              onUpdated={() => void reloadProject()}
            />

            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {selectedSlot ? selectedSlot.label : "Seleccioná un slot"}
              </h3>
              {selectedDevice?.productName ? (
                <p className="mt-1 text-xs text-slate-600">
                  Actual:{" "}
                  {selectedDevice.brandName
                    ? `${selectedDevice.brandName} · `
                    : ""}
                  {selectedDevice.productName}
                  <button
                    type="button"
                    onClick={() => assignProduct(null)}
                    className="ml-2 text-red-600 underline"
                  >
                    quitar
                  </button>
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  Sin producto asignado
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar en catálogo…"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-7 pr-2 text-sm"
                />
              </div>
              <select
                value={rankMode}
                onChange={(e) => setRankMode(e.target.value as RankSortMode)}
                className="rounded-lg border border-slate-300 px-2 text-xs"
              >
                <option value="recommended">Recomendado</option>
                <option value="price_asc">Precio</option>
                <option value="coverage">Cobertura</option>
                <option value="stock">Stock</option>
                <option value="premium">Premium</option>
              </select>
            </div>

            <div className="space-y-2 pb-4">
              {ranking ? (
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rankeando…
                </p>
              ) : null}
              {!ranking && ranked.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No hay candidatos. Generá perfiles de diseño desde la home del
                  Room Builder.
                </p>
              ) : null}
              {ranked.map((row) => (
                <button
                  key={row.productId}
                  type="button"
                  disabled={!row.compatible || pending}
                  onClick={() => pickProductForPlacement(row)}
                  className={`flex w-full gap-2 rounded-lg border p-2 text-left hover:border-slate-400 disabled:opacity-50 ${
                    staged?.productId === row.productId
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200"
                  }`}
                >
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded bg-slate-100">
                    {row.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.imageUrl}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {row.brand ? `${row.brand} · ` : ""}
                      {row.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      score {row.score}
                      {row.priceUsd != null
                        ? ` · $${row.priceUsd.toFixed(0)}`
                        : ""}
                      {row.coverageFit != null
                        ? ` · ${(row.coverageFit * 100).toFixed(0)}%`
                        : ""}
                    </p>
                    {!row.compatible ? (
                      <p className="text-[11px] text-red-600">
                        {row.hardRejectReason}
                      </p>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
