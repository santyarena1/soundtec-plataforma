"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Building2,
  Hotel,
  Loader2,
  Plus,
  ScanLine,
  Sparkles,
  Trash2,
} from "lucide-react";
import { IoProfilesCard } from "@/components/room-builder/io-profiles-card";
import { TextRoomCard } from "@/components/room-builder/text-room-card";

type HubPreset = {
  key: string;
  name: string;
  category: string;
  description: string;
  spaces: Array<{ templateKey: string; name: string; unitCount: number }>;
};

type ProjectRow = {
  id: string;
  name: string;
  kind: string;
  category: string;
  templateKey: string;
  status: string;
  unitCount: number;
  updatedAt: string;
  _count: { children: number; devices: number };
  children: Array<{
    id: string;
    name: string;
    unitCount: number;
    templateKey: string;
  }>;
  quote?: { id: string; number: string } | null;
};

type EnrichStats = {
  totalProducts: number;
  withProfile: number;
  missing: number;
  byRole: Array<{ designRole: string | null; count: number }>;
};

export function RoomBuilderHome() {
  const [hubs, setHubs] = useState<HubPreset[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [stats, setStats] = useState<EnrichStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [hubKey, setHubKey] = useState("");

  async function reload() {
    const [tRes, pRes, eRes] = await Promise.all([
      fetch("/api/admin/room-builder/templates"),
      fetch("/api/admin/room-builder/projects"),
      fetch("/api/admin/room-builder/enrich"),
    ]);
    const tJson = await tRes.json();
    const pJson = await pRes.json();
    const eJson = await eRes.json();
    if (tJson.ok) {
      setHubs(tJson.hubs);
      if (!hubKey && tJson.hubs[0]) setHubKey(tJson.hubs[0].key);
    }
    if (pJson.ok) setProjects(pJson.projects);
    if (eJson.ok) setStats(eJson.stats);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function createProject() {
    startTransition(async () => {
      const payload = {
        kind: "hub" as const,
        name: name || hubs.find((h) => h.key === hubKey)?.name || "Proyecto",
        hubPresetKey: hubKey,
      };
      const res = await fetch("/api/admin/room-builder/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error || "No se pudo crear");
        return;
      }
      toast.success("Proyecto creado");
      setName("");
      await reload();
      if (json.project?.id) {
        window.location.href = `/admin/room-builder/${json.project.id}`;
      }
    });
  }

  function runEnrich() {
    startTransition(async () => {
      toast.message("Enriqueciendo perfiles de diseño…");
      const res = await fetch("/api/admin/room-builder/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ take: 120, loops: 8, onlyMissing: true }),
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error || "Falló el enrich");
        return;
      }
      toast.success(
        `Perfiles: +${json.batch.upserted} (scan ${json.batch.scanned}, skip ${json.batch.skipped})`,
      );
      setStats(json.stats);
    });
  }

  function runOfficialEnrich() {
    startTransition(async () => {
      toast.message("Leyendo fichas oficiales (FOV/alcance)…");
      const res = await fetch("/api/admin/room-builder/enrich-official", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ take: 15, loops: 4 }),
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error || "Falló enrich oficial");
        return;
      }
      toast.success(
        `Oficial: +${json.batch.updated} (scan ${json.batch.scanned}, fail ${json.batch.failed})`,
      );
      await reload();
    });
  }

  async function removeProject(id: string) {
    if (!confirm("¿Eliminar este proyecto?")) return;
    const res = await fetch(`/api/admin/room-builder/projects/${id}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (!json.ok) {
      toast.error("No se pudo borrar");
      return;
    }
    toast.success("Eliminado");
    await reload();
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando Room Builder…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Interno Soundtec
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Room Builder
        </h1>
        <p className="max-w-2xl text-sm text-slate-600">
          Diseñá salas y proyectos multi-espacio (hotel, campus, etc.), asigná
          productos del catálogo con ranking real y generá la cotización.
        </p>
        <Link href="/admin/room-builder/reglas" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1e3553] underline">
          Reglas de integración y especificaciones
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Catálogo</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {stats?.totalProducts ?? "—"}
          </p>
          <p className="text-xs text-slate-500">productos activos</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Perfiles de diseño
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {stats?.withProfile ?? 0}
          </p>
          <p className="text-xs text-slate-500">
            faltan {stats?.missing ?? "—"} · base offline (specs + AI + dims)
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Proyectos</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {projects.length}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runEnrich}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Perfiles offline
            </button>
            <button
              type="button"
              onClick={runOfficialEnrich}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              Fichas oficiales
            </button>
          </div>
        </div>
      </section>

      <TextRoomCard />

      <IoProfilesCard />

      <section className="grid gap-4 lg:grid-cols-3">
        <Link
          href="/admin/room-builder/plano"
          className="group relative overflow-hidden rounded-2xl bg-[#1e3553] p-6 text-white shadow-lg transition hover:shadow-xl lg:col-span-2"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl transition group-hover:bg-white/15" />
          <ScanLine className="h-6 w-6 text-sky-200" />
          <h2 className="mt-3 text-xl font-semibold">Desde un plano</h2>
          <p className="mt-1 max-w-lg text-sm text-sky-100/90">
            Subí el plano: detectamos qué es, cada ambiente y sus medidas. Lo revisás sobre el plano y generamos todas las salas 3D con sus equipos.
          </p>
          <span className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#1e3553]">
            <Plus className="h-4 w-4" /> Subir plano
          </span>
        </Link>
        <Link
          href="/admin/room-builder/nuevo"
          className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-[#1e3553]/40 hover:shadow-md"
        >
          <Sparkles className="h-6 w-6 text-[#1e3553]" />
          <h2 className="mt-3 text-lg font-semibold text-slate-900">Un ambiente, sin plano</h2>
          <p className="mt-1 text-sm text-slate-500">Te preguntamos por pasos qué lleva (audio, video, control, marcas, nivel) y armamos la sala.</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#1e3553]">Empezar →</span>
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Hotel className="h-4 w-4" /> Proyecto multi-ambiente
          </div>
          <p className="mt-1 text-xs text-slate-500">Hotel completo, campus o colegio: varios ambientes de una vez, con sus cantidades.</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Hotel Costa · fase 1"
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={hubKey}
            onChange={(e) => setHubKey(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {hubs.map((h) => (
              <option key={h.key} value={h.key}>
                {h.name} — {h.spaces.length} ambientes
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={createProject}
            disabled={pending || !hubKey}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            Crear proyecto
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Tus proyectos</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay proyectos.</p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <Link
                    href={`/admin/room-builder/${p.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {p.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {p.kind === "hub" ? "Multi-espacio" : "Sala"} · {p.category} ·{" "}
                    {p.status}
                    {p.kind === "hub"
                      ? ` · ${p._count.children} espacios`
                      : ` · ${p._count.devices} slots`}
                    {p.quote ? ` · COT ${p.quote.number}` : ""}
                  </p>
                  {p.children?.length ? (
                    <p className="mt-1 text-[11px] text-slate-400">
                      {p.children
                        .map((c) => `${c.name}×${c.unitCount}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/room-builder/${p.id}`}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Abrir
                  </Link>
                  <button
                    type="button"
                    onClick={() => void removeProject(p.id)}
                    className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
