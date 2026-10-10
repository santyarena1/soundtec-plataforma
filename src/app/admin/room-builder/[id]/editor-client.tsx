"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Cable,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type {
  CameraPreset,
  CoverageViewMode,
  MountOption,
  RankSortMode,
} from "@/services/room-builder/types";
import {
  parseScene,
  type RoomScene,
} from "@/services/room-builder/scene";
import { rankModeForTier } from "@/services/room-builder/brief";
import { HubPlan, readHubPlan } from "@/components/room-builder/plan/hub-plan";
import { HubSpaces } from "@/components/room-builder/plan/hub-spaces";
import { ProjectSystemPanel } from "@/components/room-builder/plan/project-system-panel";
import { useCabling } from "@/components/room-builder/cabling/use-cabling";
import { TechnicalPlan } from "@/components/room-builder/technical/technical-plan";
import { ProjectTechnicalView } from "@/components/room-builder/technical/project-technical";
import type { SnapshotFn } from "@/components/room-builder/three/snapshot-bridge";

/** Tiempo para que la cámara llegue a la vista antes de capturarla (ms). */
const SNAPSHOT_SETTLE_MS = 1600;
import { normalizeDeviceUnits, sceneDims, type DeviceUnit } from "@/services/room-builder/units";
import type { FurnitureOverrides } from "@/services/room-builder/furnishing";
import {
  hydrateRoomScene,
  rebuildSceneKeepingProducts,
} from "@/services/room-builder/hydrate-scene";
import {
  EditorSidebar,
  roleLabel,
  type RankRow,
  type StagedProduct,
} from "@/components/room-builder/editor-sidebar";

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
    const parsed = parseScene(initialProject.sceneJson);
    try {
      return hydrateRoomScene(parsed, {
        templateKey: initialProject.templateKey,
        heightM: Number(initialProject.heightM) || undefined,
      }).scene;
    } catch {
      return parsed ?? emptyScene();
    }
  });
  const [ranked, setRanked] = useState<RankRow[]>([]);
  const [rankMode, setRankMode] = useState<RankSortMode>(() => {
    const brief = parseScene(initialProject.sceneJson)?.brief;
    return brief ? rankModeForTier(brief.tier) : "recommended";
  });
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [ranking, setRanking] = useState(false);
  /** Producto elegido para ubicar en un slot (flujo producto → click slot). */
  const [staged, setStaged] = useState<StagedProduct | null>(null);
  const cabling = useCabling(project.id, scene, project.category);
  const [showCables, setShowCables] = useState(false);
  /** Vista principal: el modelo 3D o el plano técnico (planta, diagrama de señal y cableado), en la misma pantalla. */
  const [view, setView] = useState<"3d" | "tecnico">("3d");
  // ?view=tecnico abre directo en el plano técnico (se lee en el navegador, después de hidratar).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "tecnico") setView("tecnico");
  }, []);
  const [proposalBusy, setProposalBusy] = useState(false);
  const snapshotRef = useRef<SnapshotFn | null>(null);

  const selectedSlot = useMemo(
    () => scene.slots.find((s) => s.key === scene.selectedSlotKey) ?? null,
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
      setScene(
        hydrateRoomScene(parsed, {
          templateKey: json.project.templateKey || project.templateKey,
          heightM: Number(json.project.heightM) || undefined,
        }).scene,
      );
    },
    [project.id, project.templateKey],
  );

  // Reparar y persistir escenas viejas / corruptas al abrir.
  useEffect(() => {
    // El proyecto contenedor no tiene sala propia: su escena guarda el plano y los ambientes.
    if (initialProject.kind === "hub") return;
    const raw = parseScene(initialProject.sceneJson);
    try {
      const { scene: laid, changed } = hydrateRoomScene(raw, {
        templateKey: initialProject.templateKey,
        heightM: Number(initialProject.heightM) || undefined,
      });
      if (!changed) return;
      setScene(laid);
      void persistScene(laid);
    } catch {
      // template desconocido
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProject.id]);

  function repairLayout() {
    try {
      const repaired = rebuildSceneKeepingProducts(
        scene,
        project.templateKey,
      );
      setScene(repaired);
      void persistScene(repaired);
      toast.success(
        "Layout 3D reparado: muebles y equipos reubicados (productos conservados)",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reparar");
    }
  }

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
      toast.success(productId ? "Producto elegido" : "Producto quitado");
    });
  }

  function onSelectSlot(slotKey: string) {
    // Si hay producto en mano, el click EN LA ESCENA lo ubica ahí.
    if (staged) {
      const slot = scene.slots.find((s) => s.key === slotKey);
      if (!slot) return;
      if (slot.role !== staged.role) {
        toast.error(
          `Ese lugar es para ${roleLabel(slot.role).toLowerCase()} y el producto es ${roleLabel(staged.role).toLowerCase()}. Elegí uno marcado en verde.`,
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

  /** Unidades movidas / giradas / duplicadas / quitadas en el 3D. */
  function onUnitsChange(slotKey: string, units: DeviceUnit[]) {
    if (!units.length) return;
    const next: RoomScene = {
      ...scene,
      devices: scene.devices.map((d) =>
        d.slotKey === slotKey ? { ...d, units, quantity: units.length, pose: units[0].pose } : d,
      ),
    };
    setScene(next);
    void persistScene(next);
  }

  /** Agrega o quita equipos libres (cualquier producto, cualquier montaje). */
  function changeCustomDevice(init: RequestInit & { query?: string }, done: string) {
    startTransition(async () => {
      const res = await fetch(`/api/admin/room-builder/projects/${project.id}/devices${init.query ?? ""}`, init);
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        toast.error(json?.error || "No se pudo actualizar el equipo");
        return;
      }
      setProject(json.project);
      setScene(parseScene(json.project.sceneJson) ?? scene);
      toast.success(done);
    });
  }

  function onAddDevice(productId: string, mount: MountOption, quantity: number) {
    changeCustomDevice(
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, mount, quantity }) },
      "Equipo agregado: arrastralo en el 3D a su lugar",
    );
  }

  function onAddGeneric(key: string, mount: MountOption, quantity: number, name: string) {
    changeCustomDevice(
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generic: key, mount, quantity, name }) },
      "Genérico agregado: completá precio y descripción para cotizarlo",
    );
  }

  function onUpdateGeneric(slotKey: string, patch: { name: string; description: string | null; priceUsd: number | null }) {
    changeCustomDevice({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotKey, ...patch }) }, "Genérico guardado");
  }

  function onRemoveDevice(slotKey: string) {
    changeCustomDevice({ method: "DELETE", query: `?slotKey=${encodeURIComponent(slotKey)}` }, "Equipo quitado");
  }

  /** Muebles quitados, movidos o devueltos a la sala. */
  function onFurnitureChange(next: FurnitureOverrides) {
    const updated: RoomScene = { ...scene, furniture: next };
    setScene(updated);
    void persistScene(updated);
  }

  /** Cantidad desde el panel: agrega o quita unidades (las nuevas se reparten solas). */
  function onQuantity(slotKey: string, quantity: number) {
    const slot = scene.slots.find((s) => s.key === slotKey);
    const dims = sceneDims(scene);
    const next: RoomScene = {
      ...scene,
      devices: scene.devices.map((d) =>
        d.slotKey === slotKey ? normalizeDeviceUnits({ ...d, quantity }, slot, dims) : d,
      ),
    };
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
   * Click en producto del ranking: se asigna al equipo abierto y listo. (Antes
   * quedaba "en mano" si había varios lugares del mismo tipo y cada click en el
   * 3D lo reubicaba: confundía y parecía que no se podía fijar.)
   */
  function pickProductForPlacement(row: RankRow) {
    if (!row.compatible) {
      toast.error(row.hardRejectReason || "No compatible");
      return;
    }
    if (!selectedSlot) {
      toast.error(
        "Primero abrí un equipo de la lista (Pantalla, Cámara…) y después elegí el producto",
      );
      return;
    }
    setStaged(null);
    assignToSlot(selectedSlot.key, row.productId);
  }

  function assignProduct(productId: string | null) {
    if (!selectedSlot) {
      toast.error("Seleccioná un slot o tomá un producto y ubicarlo en la escena");
      return;
    }
    assignToSlot(selectedSlot.key, productId);
  }

  /** Propuesta técnica en PDF: captura dos vistas del 3D y la arma en el servidor. */
  async function downloadProposal() {
    if (proposalBusy) return;
    setProposalBusy(true);
    const original = scene.cameraPreset;
    const shots: Array<{ label: string; dataUrl: string }> = [];
    try {
      for (const [preset, label] of [
        ["general", "Vista general"],
        ["eye", "A nivel de los ojos"],
      ] as Array<[CameraPreset, string]>) {
        setScene((s) => ({ ...s, cameraPreset: preset }));
        await new Promise((r) => setTimeout(r, SNAPSHOT_SETTLE_MS));
        const dataUrl = snapshotRef.current?.();
        if (dataUrl && dataUrl.length > 1000) shots.push({ label, dataUrl });
      }
      setScene((s) => ({ ...s, cameraPreset: original }));
      const res = await fetch(`/api/admin/room-builder/projects/${project.id}/proposal-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshots: shots }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "No se pudo generar la propuesta");
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Propuesta_${project.name.replace(/[^\w\-]+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Propuesta descargada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar la propuesta");
    } finally {
      setScene((s) => ({ ...s, cameraPreset: original }));
      setProposalBusy(false);
    }
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
        `Autocompletado: ${json.filled} de ${json.attempted} equipos`,
      );
    });
  }

  async function reloadProject() {
    const res = await fetch(`/api/admin/room-builder/projects/${project.id}`);
    const json = await res.json();
    if (json.ok) {
      setProject(json.project);
      const parsed = parseScene(json.project.sceneJson) ?? scene;
      setScene(
        hydrateRoomScene(parsed, {
          templateKey: json.project.templateKey,
          heightM: Number(json.project.heightM) || undefined,
        }).scene,
      );
    }
  }

  if (project.kind === "hub") {
    const hubPlan = readHubPlan(project.sceneJson);
    return (
      <div className={`mx-auto space-y-6 p-6 ${view === "tecnico" ? "max-w-[1600px]" : "max-w-5xl"}`}>
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
              Proyecto con {project.children.length} ambientes
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

        <div className="flex rounded-lg border border-slate-300 bg-slate-50 p-0.5 w-fit" role="tablist" aria-label="Vista del proyecto">
          {(["3d", "tecnico"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold ${view === v ? "bg-[#1e3553] text-white" : "text-slate-700 hover:bg-white"}`}>
              {v === "tecnico" ? <Cable className="h-3.5 w-3.5" /> : null}
              {v === "3d" ? "Ambientes" : "Plano técnico del proyecto"}
            </button>
          ))}
        </div>

        {view === "tecnico" ? <ProjectTechnicalView hubId={project.id} projectName={project.name} /> : null}

        {view === "3d" && hubPlan ? (
          <section className="space-y-2">
            <p className="text-sm text-slate-600">Tocá un ambiente en el plano para entrar a su sala 3D.</p>
            <HubPlan data={hubPlan} existingIds={new Set(project.children.map((c) => c.id))} />
          </section>
        ) : null}

        {view === "3d" ? <ProjectSystemPanel hubId={project.id} /> : null}

        {view === "3d" ? (
        <HubSpaces
          spaces={project.children}
          onDeleted={(id) => setProject({ ...project, children: project.children.filter((c) => c.id !== id) })}
        />
        ) : null}
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
            <div className="flex rounded-md border border-slate-300 bg-slate-50 p-0.5" role="tablist" aria-label="Vista">
              {(["3d", "tecnico"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold ${view === v ? "bg-[#1e3553] text-white" : "text-slate-700 hover:bg-white"}`}
                >
                  {v === "tecnico" ? <Cable className="h-3.5 w-3.5" /> : null}
                  {v === "3d" ? "3D" : "Plano técnico"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={repairLayout}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-950"
              title="Rehace el layout 3D del template y mantiene los productos asignados"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reparar 3D
            </button>
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
            <button
              type="button"
              onClick={() => void downloadProposal()}
              disabled={proposalBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#1e3553] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1e3553] disabled:opacity-60"
              title="Propuesta técnica en PDF: vistas 3D, plano con cotas, equipos, cableado y diagrama de conexiones"
            >
              {proposalBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              Propuesta PDF
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          {view === "tecnico" ? (
            <TechnicalPlan
              scene={scene}
              category={project.category}
              cabling={cabling}
              onSceneChange={(next) => {
                setScene(next);
                void persistScene(next);
              }}
              onUnitsChange={onUnitsChange}
              onResolve={async () => {
                const res = await fetch(`/api/admin/room-builder/projects/${project.id}/cabling`, { method: "POST" });
                const json = await res.json().catch(() => null);
                if (!json?.ok) {
                  toast.error(json?.error || "No se pudo resolver el cableado");
                  return null;
                }
                setProject(json.project);
                const parsed = parseScene(json.project.sceneJson);
                if (parsed) setScene(hydrateRoomScene(parsed, { templateKey: json.project.templateKey || project.templateKey, heightM: Number(json.project.heightM) || undefined }).scene);
                return { added: json.added ?? [], removed: json.removed ?? [], remaining: json.remaining ?? [], wires: json.wires ?? 0 };
              }}
            />
          ) : (
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
            onUnitsChange={onUnitsChange}
            onFurnitureChange={onFurnitureChange}
            projectName={project.name}
            cables={showCables ? (cabling.plan?.links ?? null) : null}
            snapshotRef={snapshotRef}
          />
          )}
        </div>
      </div>

      {view === "3d" ? (
      <EditorSidebar
        projectId={project.id}
        category={project.category}
        platform={project.platform}
        scene={scene}
        staged={staged}
        ranked={ranked}
        ranking={ranking}
        query={query}
        rankMode={rankMode}
        pending={pending}
        onSelectSlot={onSelectSlot}
        onCancelStaged={() => setStaged(null)}
        onQuery={setQuery}
        onRankMode={setRankMode}
        onPickProduct={pickProductForPlacement}
        onClearProduct={() => assignProduct(null)}
        onQuantity={onQuantity}
        onFurnitureChange={onFurnitureChange}
        onPickAny={(slotKey: string, productId: string) => assignToSlot(slotKey, productId)}
        onAddDevice={onAddDevice}
        onAddGeneric={onAddGeneric}
        onUpdateGeneric={onUpdateGeneric}
        onRemoveDevice={onRemoveDevice}
        onReload={() => void reloadProject()}
        cabling={cabling}
        showCables={showCables}
        onShowCables={setShowCables}
        onOpenTechnical={() => setView("tecnico")}
      />
      ) : null}
    </div>
  );
}
