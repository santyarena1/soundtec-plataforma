"use client";

/**
 * "Describí la sala en una frase": la IA la interpreta como el asistente
 * (tipología, medidas, sistemas, marcas), se muestra para confirmar y se
 * genera el ambiente con productos del catálogo.
 */

import { useState } from "react";
import { Loader2, MessageSquareText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { TextRoomPlan } from "@/server/room-builder/room-from-text";

const EXAMPLES = [
  "Sala de reuniones de 6x4 para 10 personas con Teams, dos pantallas y control Crestron",
  "Living de 7 por 5 con audio en techo, una TV de 75 y Crestron Home",
  "Restaurante de 15x10 con música funcional por zonas y pantallas para partidos",
];
const SYSTEM_LABEL: Record<string, string> = { audio: "Audio", video: "Video", vc: "Videoconferencia", control: "Control", lighting: "Iluminación", shades: "Cortinas", signage: "Cartelería" };
const CONTROL_LABEL: Record<string, string> = { "crestron-home": "Crestron Home", "crestron-pro": "Crestron", none: "Sin control" };

export function TextRoomCard() {
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<TextRoomPlan | null>(null);
  const [busy, setBusy] = useState<"read" | "create" | null>(null);

  async function interpret() {
    setBusy("read");
    setPlan(null);
    try {
      const res = await fetch("/api/admin/room-builder/from-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error ?? "No se pudo interpretar");
      setPlan(json.plan as TextRoomPlan);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo interpretar");
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!plan) return;
    setBusy("create");
    try {
      const res = await fetch("/api/admin/room-builder/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "space", name: plan.name, templateKey: plan.templateKey, unitCount: plan.unitCount, widthM: plan.widthM, depthM: plan.depthM, heightM: plan.heightM, areaM2: Math.round(plan.widthM * plan.depthM * 100) / 100, brief: plan.brief }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok || !json.project?.id) throw new Error(json?.error ?? "No se pudo generar el ambiente");
      toast.success("Ambiente generado con productos del catálogo");
      window.location.href = `/admin/room-builder/${json.project.id}`;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el ambiente");
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-[#1e3553]">
        <MessageSquareText className="h-5 w-5" />
        <h2 className="text-base font-semibold">Describí la sala en una frase</h2>
      </div>
      <p className="mt-1 text-sm text-slate-600">Qué ambiente es, medidas, cuántas personas, plataforma, pantallas y marcas. La interpretamos, la confirmás y se arma con equipos del catálogo.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder={EXAMPLES[0]}
        className="mt-3 w-full resize-none rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-[#1e3553] focus:ring-2 focus:ring-[#1e3553]/15"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy !== null || text.trim().length < 8} onClick={() => void interpret()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e3553] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy === "read" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Interpretar
        </button>
        {EXAMPLES.slice(1).map((ex) => (
          <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
            {ex.length > 46 ? `${ex.slice(0, 45)}…` : ex}
          </button>
        ))}
      </div>

      {plan ? (
        <div className="mt-4 rounded-xl border border-[#1e3553]/20 bg-[#1e3553]/[0.03] p-4 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="font-semibold text-slate-900">
              {plan.name} <span className="font-normal text-slate-500">· {plan.templateName}</span>
            </div>
            <div className="text-xs text-slate-600">
              {plan.widthM} × {plan.depthM} m · alto {plan.heightM} m{plan.unitCount > 1 ? ` · ${plan.unitCount} iguales` : ""}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {plan.brief.systems.map((s) => (
              <span key={s} className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                {SYSTEM_LABEL[s] ?? s}
              </span>
            ))}
            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">{CONTROL_LABEL[plan.brief.control] ?? plan.brief.control}</span>
            {plan.brief.vcPlatform ? <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">{plan.brief.vcPlatform === "byod" ? "BYOD" : plan.brief.vcPlatform === "teams" ? "Microsoft Teams" : "Zoom"}</span> : null}
            {plan.brief.video ? <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">{plan.brief.video.displays} pantalla(s){plan.brief.video.sizeIn ? ` de ${plan.brief.video.sizeIn}"` : ""}</span> : null}
            {Object.entries(plan.brief.brands).flatMap(([, v]) => v ?? []).map((b) => (
              <span key={b} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 ring-1 ring-emerald-200">
                {b}
              </span>
            ))}
          </div>
          {plan.assumptions.length ? (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
              {plan.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy !== null} onClick={() => void create()} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Generar sala
            </button>
            <button type="button" onClick={() => setPlan(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
              Corregir la frase
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
