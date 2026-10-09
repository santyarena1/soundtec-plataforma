"use client";

/**
 * Proyecto desde un plano: se sube, la IA detecta qué es y sus ambientes,
 * se revisa sobre el plano (mover, estirar, dibujar, tipo, escala) y se
 * genera un ambiente 3D por cada recuadro.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, MousePointer2, Ruler, ScanLine, Sparkles, SquareDashed, Trash2, Upload } from "lucide-react";
import {
  PLAN_KINDS,
  PLAN_KIND_LABELS,
  estimateMetersPerPixel,
  roomSizeMeters,
  type DetectedRoom,
  type PlanAnalysis,
  type PlanBox,
  type PlanKind,
} from "@/services/room-builder/plan-analysis";
import type { BriefControl, BriefTier, BriefVcPlatform } from "@/services/room-builder/brief";
import { CONTROL_OPTIONS, TIER_OPTIONS, VC_OPTIONS } from "../wizard/wizard-data";
import { shrinkForUpload } from "../plan-panel";
import { PlanCanvas, ROOM_COLORS, type CanvasMode, type PlanPoint } from "./plan-canvas";

type Template = { key: string; name: string; category: string };
type PlanImage = { dataUrl: string; widthPx: number; heightPx: number };

const CATEGORY_LABELS: Record<string, string> = {
  residential: "Residencial",
  hotel: "Hotelería",
  videoconference: "Corporativo",
  training: "Capacitación",
  classroom: "Educación",
  event: "Eventos",
  lobby: "Lobby",
  commercial: "Comercial",
  "control-room": "Sala técnica",
  signage: "Cartelería",
  office: "Oficinas",
  common: "Espacios comunes",
};

const DEFAULT_HEIGHT: Record<PlanKind, number> = {
  residencial: 2.6,
  corporativo: 2.7,
  hoteleria: 2.6,
  educacion: 3,
  comercial: 3.2,
  eventos: 4,
  otro: 2.7,
};

const input = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-[#1e3553] focus:outline-none focus:ring-2 focus:ring-[#1e3553]/15";

export function PlanWizard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [image, setImage] = useState<PlanImage | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [rooms, setRooms] = useState<DetectedRoom[]>([]);
  const [summary, setSummary] = useState("");
  const [kind, setKind] = useState<PlanKind>("residencial");
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<CanvasMode>("select");
  const [calibration, setCalibration] = useState<PlanPoint[]>([]);
  const [calibrationMeters, setCalibrationMeters] = useState(4);
  const [manualMpp, setManualMpp] = useState<number | null>(null);
  const [control, setControl] = useState<BriefControl>("crestron-home");
  const [vcPlatform, setVcPlatform] = useState<BriefVcPlatform>("teams");
  const [tier, setTier] = useState<BriefTier>("recomendado");
  const [heightM, setHeightM] = useState(2.6);
  const [, startTransition] = useTransition();
  /** Estado propio: en React 18 la transición no queda "pendiente" durante un await. */
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch("/api/admin/room-builder/templates")
      .then((r) => r.json())
      .then((j) => j.ok && setTemplates(j.templates))
      .catch(() => toast.error("No se pudieron cargar los tipos de ambiente"));
  }, []);

  const autoMpp = useMemo(() => (image ? estimateMetersPerPixel(rooms, image.widthPx, image.heightPx) : null), [rooms, image]);
  const mpp = manualMpp ?? autoMpp;
  const templateByKey = useMemo(() => new Map(templates.map((t) => [t.key, t])), [templates]);
  const byCategory = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of templates) map.set(t.category, [...(map.get(t.category) ?? []), t]);
    return [...map.entries()];
  }, [templates]);

  function analyze(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Subí el plano como imagen (PNG, JPG o WebP). Si es PDF, exportá la página como imagen.");
      return;
    }
    setAnalyzing(true);
    startTransition(async () => {
      try {
        const small = await shrinkForUpload(file);
        const body = new FormData();
        body.set("file", new File([small], "plano.webp", { type: small.type || file.type }));
        const res = await fetch("/api/admin/room-builder/plan-analyze", { method: "POST", body });
        const json = await res.json().catch(() => null);
        if (!json?.ok) {
          toast.error(json?.error || (res.status === 413 ? "La imagen es muy pesada" : "No se pudo leer el plano"));
          return;
        }
        const analysis = json.analysis as PlanAnalysis;
        setImage(json.image);
        setRooms(analysis.rooms);
        setSummary(analysis.summary);
        setKind(analysis.kind === "otro" ? "residencial" : analysis.kind);
        setHeightM(DEFAULT_HEIGHT[analysis.kind]);
        setControl(analysis.kind === "residencial" || analysis.kind === "hoteleria" ? "crestron-home" : analysis.kind === "corporativo" ? "crestron-pro" : "none");
        setName((n) => n || analysis.summary.split(/[.,]/)[0]?.slice(0, 80) || "Proyecto desde plano");
        setManualMpp(null);
        setCalibration([]);
        if (json.warning) toast.warning(`${json.warning} Podés marcar los ambientes a mano.`);
        else if (!analysis.rooms.length) toast.warning("No detectamos ambientes: dibujalos sobre el plano.");
        else toast.success(`Detectamos ${analysis.rooms.length} ambientes. Revisalos y generá el proyecto.`);
      } catch {
        toast.error("No pudimos procesar esa imagen.");
      } finally {
        setAnalyzing(false);
      }
    });
  }

  const updateRoom = (id: string, patch: Partial<DetectedRoom>) => setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function addRoom(box: PlanBox) {
    const id = `m${Date.now().toString(36)}`;
    setRooms((rs) => [...rs, { id, name: `Ambiente ${rs.length + 1}`, templateKey: null, box, widthM: null, depthM: null, include: false }]);
    setSelectedId(id);
    setMode("select");
  }

  function calibrationPoint(p: PlanPoint) {
    setCalibration((c) => (c.length >= 2 ? [p] : [...c, p]));
  }

  function applyCalibration() {
    if (!image || calibration.length < 2) return;
    const dx = (calibration[1].x - calibration[0].x) * image.widthPx;
    const dy = (calibration[1].y - calibration[0].y) * image.heightPx;
    const px = Math.hypot(dx, dy);
    if (px < 5 || calibrationMeters <= 0) return;
    setManualMpp(calibrationMeters / px);
    setMode("select");
    toast.success("Escala aplicada");
  }

  const included = rooms.filter((r) => r.include && r.templateKey);
  const sizes = new Map(included.map((r) => [r.id, image ? roomSizeMeters(r, mpp, image.widthPx, image.heightPx) : null]));
  const missingSize = included.some((r) => !sizes.get(r.id));
  const hasVc = included.some((r) => templateByKey.get(r.templateKey ?? "")?.category === "videoconference");

  function generate() {
    if (!image) return;
    if (!included.length) {
      toast.error("Marcá al menos un ambiente con equipos");
      return;
    }
    if (missingSize) {
      toast.error("Falta la escala: calibrala tocando dos puntos de una medida conocida");
      return;
    }
    setGenerating(true);
    startTransition(async () => {
      const res = await fetch("/api/admin/room-builder/from-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "Proyecto desde plano",
          kind,
          image,
          heightM,
          control,
          vcPlatform: hasVc ? vcPlatform : null,
          tier,
          brands: {},
          rooms: included.map((r) => ({ name: r.name, templateKey: r.templateKey, box: r.box, ...(sizes.get(r.id) as { widthM: number; depthM: number }) })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok || !json.project?.id) {
        setGenerating(false);
        toast.error(json?.error || "No se pudo generar el proyecto");
        return;
      }
      toast.success("Proyecto generado con todos los ambientes");
      window.location.href = `/admin/room-builder/${json.project.id}`;
    });
  }

  if (!image) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
        <Link href="/admin/room-builder" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Room Builder
        </Link>
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Proyecto desde un plano</h1>
          <p className="mt-1 text-sm text-slate-500">
            Subí el plano y detectamos qué es y cada ambiente. Después lo revisás y generamos todas las salas con sus equipos.
          </p>
        </header>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) analyze(f);
          }}
        />
        <button
          type="button"
          disabled={analyzing}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) analyze(f);
          }}
          className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-16 text-center transition hover:border-[#1e3553] hover:bg-slate-50 disabled:cursor-wait"
        >
          {analyzing ? (
            <>
              <ScanLine className="h-10 w-10 animate-pulse text-[#1e3553]" />
              <span className="text-sm font-semibold text-slate-800">Leyendo el plano…</span>
              <span className="text-xs text-slate-500">Detectamos el tipo de proyecto, los ambientes y sus medidas. Tarda unos segundos.</span>
            </>
          ) : (
            <>
              <Upload className="h-10 w-10 text-[#1e3553]" />
              <span className="text-sm font-semibold text-slate-800">Arrastrá el plano acá o tocá para elegirlo</span>
              <span className="text-xs text-slate-500">PNG, JPG o WebP · una planta o el plano completo · si tiene cotas, mejor</span>
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5 p-4 lg:flex-row">
      {generating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="max-w-sm rounded-2xl bg-white px-6 py-5 text-center shadow-2xl">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1e3553]" />
            <p className="mt-3 text-sm font-semibold text-slate-900">
              Generando {included.length} ambiente{included.length === 1 ? "" : "s"}…
            </p>
            <p className="mt-1 text-xs text-slate-500">Armamos cada sala 3D con sus medidas y elegimos los productos. Tarda unos segundos por ambiente.</p>
          </div>
        </div>
      ) : null}
      <main className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Link href="/admin/room-builder" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
              <ArrowLeft className="h-3.5 w-3.5" /> Room Builder
            </Link>
            <h1 className="text-lg font-semibold text-slate-900">Revisá el plano</h1>
            {summary ? <p className="text-xs text-slate-500">{summary}</p> : null}
          </div>
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {(
              [
                ["select", MousePointer2, "Mover / estirar"],
                ["draw", SquareDashed, "Dibujar ambiente"],
                ["calibrate", Ruler, "Calibrar escala"],
              ] as const
            ).map(([m, Icon, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  if (m === "calibrate") setCalibration([]);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${mode === m ? "bg-[#1e3553] text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        {mode === "calibrate" ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-teal-50 px-4 py-2.5 text-sm text-teal-900">
            <span>{calibration.length < 2 ? "Tocá los dos extremos de una medida que conozcas (por ejemplo una pared)." : "¿Cuánto mide?"}</span>
            {calibration.length === 2 ? (
              <>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={calibrationMeters}
                  onChange={(e) => setCalibrationMeters(Number(e.target.value) || 1)}
                  className="w-24 rounded-lg border border-teal-300 bg-white px-2 py-1 text-sm"
                />
                <span>m</span>
                <button type="button" onClick={applyCalibration} className="rounded-lg bg-teal-800 px-3 py-1 text-xs font-semibold text-white">
                  Aplicar escala
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {mode === "draw" ? <p className="rounded-xl bg-sky-50 px-4 py-2.5 text-sm text-sky-900">Arrastrá sobre el plano para marcar un ambiente nuevo.</p> : null}

        <PlanCanvas
          imageUrl={image.dataUrl}
          widthPx={image.widthPx}
          heightPx={image.heightPx}
          rooms={rooms}
          selectedId={selectedId}
          mode={mode}
          calibration={calibration}
          onSelect={setSelectedId}
          onBoxChange={(id, box) => updateRoom(id, { box })}
          onDraw={addRoom}
          onCalibrationPoint={calibrationPoint}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className="text-xs font-semibold text-[#1e3553] underline">
          Subir otro plano
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) analyze(f);
          }}
        />
      </main>

      <aside className="w-full shrink-0 space-y-4 lg:w-[400px]">
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Proyecto</h2>
          <label className="block text-xs font-semibold text-slate-600">
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={`${input} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold text-slate-600">
              Tipo
              <select value={kind} onChange={(e) => setKind(e.target.value as PlanKind)} className={`${input} mt-1`}>
                {PLAN_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PLAN_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Alto de techo (m)
              <input type="number" min={2.2} max={12} step={0.1} value={heightM} onChange={(e) => setHeightM(Number(e.target.value) || 2.6)} className={`${input} mt-1`} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Control
              <select value={control} onChange={(e) => setControl(e.target.value as BriefControl)} className={`${input} mt-1`}>
                {CONTROL_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Nivel
              <select value={tier} onChange={(e) => setTier(e.target.value as BriefTier)} className={`${input} mt-1`}>
                {TIER_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {hasVc ? (
              <label className="col-span-2 block text-xs font-semibold text-slate-600">
                Videoconferencia
                <select value={vcPlatform} onChange={(e) => setVcPlatform(e.target.value as BriefVcPlatform)} className={`${input} mt-1`}>
                  {VC_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <p className={`rounded-lg px-3 py-2 text-xs ${mpp ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
            {mpp
              ? manualMpp
                ? "Escala calibrada a mano."
                : "Escala tomada de las medidas escritas en el plano."
              : "Sin escala: usá “Calibrar escala” y tocá una medida conocida."}
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Ambientes</h2>
            <span className="text-xs text-slate-500">
              {included.length} con equipos de {rooms.length}
            </span>
          </div>
          {!rooms.length ? <p className="text-xs text-slate-500">Dibujá los ambientes sobre el plano con “Dibujar ambiente”.</p> : null}
          <ul className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
            {rooms.map((r, i) => {
              const size = image ? roomSizeMeters(r, mpp, image.widthPx, image.heightPx) : null;
              return (
                <li
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`rounded-xl border p-2.5 transition ${r.id === selectedId ? "border-[#1e3553] shadow-sm" : "border-slate-200"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: ROOM_COLORS[i % ROOM_COLORS.length] }} />
                    <input value={r.name} onChange={(e) => updateRoom(r.id, { name: e.target.value })} className="min-w-0 flex-1 rounded-md border border-transparent px-1 py-0.5 text-sm font-semibold hover:border-slate-200 focus:border-slate-300 focus:outline-none" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRooms((rs) => rs.filter((x) => x.id !== r.id));
                      }}
                      className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Quitar del plano"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <select
                      value={r.templateKey ?? ""}
                      onChange={(e) => updateRoom(r.id, { templateKey: e.target.value || null, include: Boolean(e.target.value) })}
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      <option value="">Sin equipos (baño, pasillo…)</option>
                      {byCategory.map(([cat, list]) => (
                        <optgroup key={cat} label={CATEGORY_LABELS[cat] ?? cat}>
                          {list.map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <label className="flex shrink-0 items-center gap-1 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        disabled={!r.templateKey}
                        checked={r.include && Boolean(r.templateKey)}
                        onChange={(e) => updateRoom(r.id, { include: e.target.checked })}
                        className="h-3.5 w-3.5 accent-[#1e3553]"
                      />
                      Incluir
                    </label>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {size ? `${size.widthM} × ${size.depthM} m · ${(size.widthM * size.depthM).toFixed(1)} m²` : "Medidas: falta la escala"}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <button
          type="button"
          onClick={generate}
          disabled={generating || !included.length}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1e3553] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#162a44] disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generar {included.length} ambiente{included.length === 1 ? "" : "s"} con equipos
        </button>
        <p className="text-center text-[11px] text-slate-500">Puede tardar unos segundos por ambiente: elegimos los productos de cada uno.</p>
      </aside>
    </div>
  );
}
