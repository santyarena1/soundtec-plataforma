"use client";

/**
 * Módulo técnico del Room Builder: el conexionado real del proyecto (puertos,
 * cables, recorridos, largos) separado del render 3D. Comparte el proyecto y su
 * escena con el módulo 3D, pero funciona solo: si al 3D le falta algo, acá se
 * sigue cableando, y al revés.
 */

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeft, Box, Cable } from "lucide-react";
import { toast } from "sonner";
import { useCabling } from "@/components/room-builder/cabling/use-cabling";
import { TechnicalPlan } from "@/components/room-builder/technical/technical-plan";
import { hydrateRoomScene } from "@/services/room-builder/hydrate-scene";
import { parseScene, type RoomScene } from "@/services/room-builder/scene";
import type { DeviceUnit } from "@/services/room-builder/units";

type Project = {
  id: string;
  name: string;
  kind: string;
  category: string;
  templateKey: string;
  heightM: string | number;
  sceneJson: unknown;
  parent?: { id: string; name: string } | null;
  children: Array<{ id: string; name: string; templateKey: string; _count: { devices: number } }>;
};

function sceneOf(project: Project): RoomScene | null {
  const parsed = parseScene(project.sceneJson);
  if (!parsed) return null;
  try {
    return hydrateRoomScene(parsed, { templateKey: project.templateKey, heightM: Number(project.heightM) || undefined }).scene;
  } catch {
    return parsed;
  }
}

export function TechnicalModule({ initialProject }: { initialProject: Project }) {
  if (initialProject.kind === "hub") return <HubSpacesIndex project={initialProject} />;
  return <RoomTechnical initialProject={initialProject} />;
}

function Header({ project, children }: { project: Project; children?: React.ReactNode }) {
  const back = project.parent ? `/admin/room-builder/${project.parent.id}/tecnico` : "/admin/room-builder";
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
      <div className="min-w-0">
        <Link href={back} className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3.5 w-3.5" />
          {project.parent ? project.parent.name : "Room Builder"}
        </Link>
        <h1 className="flex items-center gap-2 truncate text-base font-semibold leading-tight text-slate-900">
          <Cable className="h-4 w-4 text-[#1e3553]" />
          {project.name} · Plano técnico
        </h1>
      </div>
      <div className="flex shrink-0 gap-1.5">
        {children}
        <Link href={`/admin/room-builder/${project.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <Box className="h-3.5 w-3.5" />
          Vista 3D
        </Link>
      </div>
    </header>
  );
}

function RoomTechnical({ initialProject }: { initialProject: Project }) {
  const initialScene = sceneOf(initialProject);
  if (!initialScene) {
    return (
      <div className="flex min-h-0 flex-col">
        <Header project={initialProject} />
        <p className="p-6 text-sm text-slate-500">Este ambiente todavía no tiene sala armada. Armala desde la vista 3D o el plano.</p>
      </div>
    );
  }
  return <RoomWiring initialProject={initialProject} initialScene={initialScene} />;
}

function RoomWiring({ initialProject, initialScene }: { initialProject: Project; initialScene: RoomScene }) {
  const [project, setProject] = useState(initialProject);
  const [scene, setScene] = useState<RoomScene>(initialScene);
  const cabling = useCabling(project.id, scene, project.category);

  const persist = useCallback(
    async (next: RoomScene) => {
      const res = await fetch(`/api/admin/room-builder/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: next }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        toast.error(json?.error || "No se pudo guardar");
        return;
      }
      setProject(json.project);
    },
    [project.id],
  );

  const change = (next: RoomScene) => {
    setScene(next);
    void persist(next);
  };

  const onUnitsChange = (slotKey: string, units: DeviceUnit[]) => {
    if (!units.length) return;
    change({ ...scene, devices: scene.devices.map((d) => (d.slotKey === slotKey ? { ...d, units, quantity: units.length, pose: units[0]!.pose } : d)) });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col">
      <Header project={project} />
      <div className="min-h-0 flex-1">
        <TechnicalPlan
          scene={scene}
          category={project.category}
          cabling={cabling}
          onSceneChange={change}
          onUnitsChange={onUnitsChange}
          onResolve={async () => {
            const res = await fetch(`/api/admin/room-builder/projects/${project.id}/cabling`, { method: "POST" });
            const json = await res.json().catch(() => null);
            if (!json?.ok) {
              toast.error(json?.error || "No se pudo resolver el cableado");
              return null;
            }
            setProject(json.project);
            const next = sceneOf(json.project);
            if (next) setScene(next);
            return { added: json.added ?? [], remaining: json.remaining ?? [], wires: json.wires ?? 0 };
          }}
        />
      </div>
    </div>
  );
}

/** Proyecto con varios ambientes: se cablea ambiente por ambiente. */
function HubSpacesIndex({ project }: { project: Project }) {
  return (
    <div className="flex min-h-0 flex-col">
      <Header project={project} />
      <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {project.children.map((c) => (
          <Link key={c.id} href={`/admin/room-builder/${c.id}/tecnico`} className="rounded-lg border border-slate-200 bg-white p-3 hover:border-[#1e3553] hover:shadow-sm">
            <p className="font-semibold text-slate-900">{c.name}</p>
            <p className="text-xs text-slate-500">
              {c.templateKey} · {c._count.devices} equipos
            </p>
          </Link>
        ))}
        {!project.children.length ? <p className="text-sm text-slate-500">El proyecto todavía no tiene ambientes.</p> : null}
      </div>
    </div>
  );
}
