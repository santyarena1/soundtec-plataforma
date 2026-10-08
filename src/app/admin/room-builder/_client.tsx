"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Building2,
  Hotel,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { PlatformGuideCard } from "@/components/room-builder/platform-guide-card";
import { suggestPlatform } from "@/services/room-builder/platform-guide";

type Template = {
  key: string;
  name: string;
  category: string;
  sizePreset: string;
  areaM2: number;
  description: string;
};

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
  const [templates, setTemplates] = useState<Template[]>([]);
  const [hubs, setHubs] = useState<HubPreset[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [stats, setStats] = useState<EnrichStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"space" | "hub">("hub");
  const [name, setName] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [hubKey, setHubKey] = useState("");
  const [unitCount, setUnitCount] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [widthM, setWidthM] = useState<number | "">("");
  const [depthM, setDepthM] = useState<number | "">("");
  const [platform, setPlatform] = useState("crestron-home");

  const CATEGORY_LABELS: Record<string, string> = {
    videoconference: "Videoconferencia",
    classroom: "Aula",
    training: "Capacitación",
    hotel: "Hotel",
    event: "Eventos",
    residential: "Residencial / Home",
    lobby: "Lobby",
    "control-room": "Sala técnica",
    signage: "Signage",
  };

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
      setTemplates(tJson.templates);
      setHubs(tJson.hubs);
      if (!categoryFilter && tJson.templates[0]) {
        setCategoryFilter(tJson.templates[0].category);
        setTemplateKey(tJson.templates[0].key);
      }
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

  const templatesByCategory = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of templates) {
      const list = map.get(t.category) ?? [];
      list.push(t);
      map.set(t.category, list);
    }
    return [...map.entries()];
  }, [templates]);

  function createProject() {
    startTransition(async () => {
      const payload =
        mode === "hub"
          ? {
              kind: "hub" as const,
              name: name || hubs.find((h) => h.key === hubKey)?.name || "Proyecto",
              hubPresetKey: hubKey,
            }
          : {
              kind: "space" as const,
              name:
                name ||
                templates.find((t) => t.key === templateKey)?.name ||
                "Sala",
              templateKey,
              unitCount,
              platform,
              widthM: typeof widthM === "number" ? widthM : undefined,
              depthM: typeof depthM === "number" ? depthM : undefined,
              areaM2:
                typeof widthM === "number" && typeof depthM === "number"
                  ? widthM * depthM
                  : undefined,
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

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("hub")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
              mode === "hub"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            <Hotel className="h-4 w-4" /> Proyecto multi-espacio
          </button>
          <button
            type="button"
            onClick={() => setMode("space")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
              mode === "space"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            <Building2 className="h-4 w-4" /> Sala individual
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Nombre</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                mode === "hub" ? "Hotel Costa · fase 1" : "Boardroom piso 12"
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          {mode === "hub" ? (
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Preset</span>
              <select
                value={hubKey}
                onChange={(e) => setHubKey(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {hubs.map((h) => (
                  <option key={h.key} value={h.key}>
                    {h.name} — {h.spaces.length} espacios
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Plataforma</span>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="crestron-home">Crestron Home</option>
                  <option value="teams">Microsoft Teams</option>
                  <option value="zoom">Zoom Rooms</option>
                  <option value="byod">BYOD</option>
                  <option value="none">Sin UC / solo AV</option>
                </select>
              </label>
            </>
          )}
          {mode === "space" ? (
            <div className="mt-3">
              <PlatformGuideCard
                category={categoryFilter || "videoconference"}
                platform={platform}
              />
            </div>
          ) : null}
        </div>

        {mode === "space" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-slate-800">
              1. Elegí el tipo de espacio (no son todas salas de reunión)
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {templatesByCategory.map(([cat, list]) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategoryFilter(cat);
                    setTemplateKey(list[0]?.key ?? "");
                    setPlatform(suggestPlatform(cat));
                  }}
                  className={`rounded-xl border px-3 py-3 text-left ${
                    categoryFilter === cat
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-400"
                  }`}
                >
                  <span className="block text-sm font-semibold">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </span>
                  <span
                    className={`mt-0.5 block text-[11px] ${
                      categoryFilter === cat ? "text-slate-300" : "text-slate-500"
                    }`}
                  >
                    {list.length} layouts · ej. {list[0]?.name}
                  </span>
                </button>
              ))}
            </div>

            <p className="text-sm font-medium text-slate-800">2. Layout</p>
            <select
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {(templatesByCategory.find(([c]) => c === categoryFilter)?.[1] ??
                []).map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name} ({t.sizePreset}, default {t.areaM2} m²)
                </option>
              ))}
            </select>

            <p className="text-sm font-medium text-slate-800">
              3. Metros (opcional — también se editan adentro)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-slate-600">
                Ancho (m)
                <input
                  type="number"
                  min={1.5}
                  step={0.1}
                  value={widthM}
                  onChange={(e) =>
                    setWidthM(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="auto"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
                />
              </label>
              <label className="text-xs text-slate-600">
                Fondo (m)
                <input
                  type="number"
                  min={1.5}
                  step={0.1}
                  value={depthM}
                  onChange={(e) =>
                    setDepthM(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="auto"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
                />
              </label>
              <label className="text-xs text-slate-600">
                Unidades ×
                <input
                  type="number"
                  min={1}
                  value={unitCount}
                  onChange={(e) => setUnitCount(Number(e.target.value) || 1)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
                />
              </label>
            </div>
          </div>
        ) : null}

        {mode === "hub" && hubKey ? (
          <ul className="mt-4 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
            {hubs
              .find((h) => h.key === hubKey)
              ?.spaces.map((s) => (
                <li
                  key={s.templateKey}
                  className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  {s.name}{" "}
                  <span className="text-slate-400">× {s.unitCount}</span>
                </li>
              ))}
          </ul>
        ) : null}

        <button
          type="button"
          onClick={createProject}
          disabled={pending}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1e3553] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#16293f] disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Crear y abrir
        </button>
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
