"use client";

/**
 * Panel del plano técnico: resumen de cables y avisos, ficha del equipo
 * (puertos y a qué están conectados, o carga de señales para genéricos y
 * equipos sin ficha) y ficha del cable (puertos, cable del catálogo,
 * etiqueta, largo, recto, otro cable, invertir, eliminar).
 */

import { useState } from "react";
import { ArrowLeftRight, Cable, CheckCircle2, Plus, Spline, Trash2, TriangleAlert, Wand2 } from "lucide-react";
import type { CableProduct } from "@/services/room-builder/cable-picks";
import { IO_SIGNALS, type IoSignal } from "@/services/room-builder/io-profile/types";
import type { WiringModel } from "@/services/room-builder/wiring/model";
import { portsFromSignals, signalFamily, signalsCompatible } from "@/services/room-builder/wiring/ports";
import { WIRE_SIGNAL_STYLE, type Wire, type WirePort } from "@/services/room-builder/wiring/types";
import type { WireIssue } from "@/services/room-builder/wiring/validate";
import type { TechSelection } from "./technical-canvas";

const input = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-[#1e3553] focus:outline-none focus:ring-2 focus:ring-[#1e3553]/15";
const btn = "inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const primary = "inline-flex items-center gap-1.5 rounded-md bg-[#1e3553] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#162a44] disabled:opacity-50";

/** Familia de señal → grupo de cables del catálogo. */
const CABLE_GROUP: Record<string, CableProduct["signal"] | null> = { hdmi: "hdmi", usb: "usb", net: "utp", hdbaset: "utp", speaker: "speaker", audio: "line", rs232: "rs232" };

type Props = {
  model: WiringModel;
  selection: TechSelection;
  catalog: CableProduct[] | null;
  autoAvailable: boolean;
  /** Lo que el sistema resolvió solo en la última pasada (equipos genéricos agregados). */
  resolved: Array<{ name: string; reason: string }> | null;
  /** Lo que no se pudo resolver solo (queda para revisar a mano). */
  review: Array<{ title: string; detail: string }>;
  resolving: boolean;
  onSelect: (s: TechSelection) => void;
  onUpdateWire: (id: string, patch: Partial<Wire>) => void;
  onDeleteWire: (id: string) => void;
  onReverseWire: (id: string) => void;
  onAnotherWire: (w: Wire) => void;
  onSetPorts: (deviceId: string, ports: WirePort[] | null) => void;
  onAutoWire: () => void;
  onClearAuto: () => void;
};

export function TechnicalInspector(p: Props) {
  const sel = p.selection;
  if (sel?.kind === "wire") {
    const w = p.model.wires.find((x) => x.id === sel.id) ?? null;
    if (w) return <WirePanel {...p} wire={w} />;
  }
  if (p.selection?.kind === "device") {
    const d = p.model.devices.find((x) => p.selection?.kind === "device" && x.deviceId === p.selection.deviceId && x.unit === p.selection.unit) ?? null;
    if (d) return <DevicePanel {...p} deviceId={d.deviceId} unit={d.unit} label={d.label} />;
  }
  return <SummaryPanel {...p} />;
}

function deviceName(model: WiringModel, id: string, unit: number) {
  const d = model.devices.find((x) => x.deviceId === id && x.unit === unit);
  const same = model.devices.filter((x) => x.deviceId === id).length;
  return d ? `${d.short}${same > 1 ? ` (${unit + 1})` : ""}` : "—";
}
const portName = (model: WiringModel, id: string, portId: string) => model.ports[id]?.find((q) => q.id === portId)?.label ?? portId;

function SummaryPanel(p: Props) {
  const errors = p.model.issues.filter((i) => i.level === "error");
  const warns = p.model.issues.filter((i) => i.level === "warn");
  const bySignal = new Map<string, number>();
  for (const w of p.model.wires) bySignal.set(WIRE_SIGNAL_STYLE[w.signal].label, (bySignal.get(WIRE_SIGNAL_STYLE[w.signal].label) ?? 0) + w.lengthM);
  return (
    <div className="space-y-3 p-3 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Equipos" value={p.model.devices.length} />
        <Stat label="Cables" value={p.model.wires.length} />
      </div>
      <div className="space-y-1.5">
        <button type="button" className={`${primary} w-full justify-center`} disabled={!p.autoAvailable || p.resolving} onClick={p.onAutoWire}>
          <Wand2 className="h-3.5 w-3.5" /> {p.resolving ? "Resolviendo…" : "Resolver y trazar todo"}
        </button>
        <p className="text-[11px] leading-snug text-slate-500">Detecta lo que falta (amplificación, fuentes, gateways, red), lo suma solo y traza todo el conexionado con los puertos reales. Lo que tocaste a mano queda fijo.</p>
        {p.model.wires.some((w) => w.origin === "auto") ? (
          <button type="button" className={`${btn} w-full justify-center`} onClick={p.onClearAuto}>
            Borrar cables automáticos
          </button>
        ) : null}
      </div>
      {p.resolved?.length ? (
        <div className="space-y-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-sky-950">
          <p className="font-semibold">Cambios del sistema (genéricos, editables):</p>
          <ul className="space-y-0.5 text-[11px]">
            {p.resolved.map((r, k) => (
              <li key={k}>
                <b>{r.name}</b> — por: {r.reason.toLowerCase()}
              </li>
            ))}
          </ul>
          <p className="text-[10.5px] text-sky-800">Cambialos por un producto del catálogo o quitalos desde la Vista 3D.</p>
        </div>
      ) : null}
      {p.review.length ? (
        <details className="rounded-md border border-slate-200 px-2 py-1.5 text-slate-700">
          <summary className="cursor-pointer font-semibold">Para revisar a mano ({p.review.length})</summary>
          <ul className="mt-1 space-y-1 text-[11px]">
            {p.review.map((n, k) => (
              <li key={k}>
                <b>{n.title}</b>: {n.detail}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {errors.length || warns.length ? (
        <div className="space-y-1">
          <p className="font-semibold text-slate-700">Avisos</p>
          {[...errors, ...warns].map((i, k) => (
            <IssueRow key={k} issue={i} onClick={() => p.onSelect({ kind: "wire", id: i.wireId })} />
          ))}
        </div>
      ) : p.model.wires.length ? (
        <p className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1.5 text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" /> Todos los cables tienen señal compatible y puertos libres.
        </p>
      ) : null}
      {bySignal.size ? (
        <div>
          <p className="mb-1 font-semibold text-slate-700">Metros por señal</p>
          {[...bySignal].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-slate-100 py-1">
              <span>{k}</span>
              <span className="font-mono">{v.toFixed(1)} m</span>
            </div>
          ))}
        </div>
      ) : null}
      <div>
        <p className="mb-1 font-semibold text-slate-700">Cables</p>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {p.model.wires.map((w) => (
            <li key={w.id}>
              <button type="button" onClick={() => p.onSelect({ kind: "wire", id: w.id })} className="flex w-full items-start gap-2 rounded px-1.5 py-1 text-left hover:bg-slate-50">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: WIRE_SIGNAL_STYLE[w.signal].color }} />
                <span className="min-w-0 flex-1">
                  <span className="font-mono font-semibold">{w.label ?? "sin etiqueta"}</span> · {w.lengthM.toFixed(1)} m
                  <span className="block truncate text-slate-500">
                    {deviceName(p.model, w.from.deviceId, w.from.unit)} {portName(p.model, w.from.deviceId, w.from.portId)} → {deviceName(p.model, w.to.deviceId, w.to.unit)} {portName(p.model, w.to.deviceId, w.to.portId)}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {!p.model.wires.length ? <li className="text-slate-500">Todavía no hay cables. Usá la herramienta Cable o “Trazar cables automáticamente”.</li> : null}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

function IssueRow({ issue, onClick }: { issue: WireIssue; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left ${issue.level === "error" ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-900"}`}>
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{issue.text}</span>
    </button>
  );
}

function WirePanel(p: Props & { wire: Wire & { lengthM: number } }) {
  const w = p.wire;
  const issues = p.model.issues.filter((i) => i.wireId === w.id);
  const fromPorts = p.model.ports[w.from.deviceId] ?? [];
  const toPorts = p.model.ports[w.to.deviceId] ?? [];
  const fromPort = fromPorts.find((q) => q.id === w.from.portId);
  const group = CABLE_GROUP[signalFamily(w.signal)] ?? null;
  const cables = (p.catalog ?? []).filter((c) => c.signal === group);
  const update = (patch: Partial<Wire>) => p.onUpdateWire(w.id, { ...patch, origin: "manual" });
  return (
    <div className="space-y-3 p-3 text-xs">
      <div className="flex items-center gap-2">
        <Cable className="h-4 w-4 text-[#1e3553]" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Cable {w.label ?? ""}</p>
          <p className="truncate text-slate-500">
            {deviceName(p.model, w.from.deviceId, w.from.unit)} → {deviceName(p.model, w.to.deviceId, w.to.unit)}
          </p>
        </div>
      </div>
      <label className="block font-semibold text-slate-600">
        Puerto de origen
        <select className={`${input} mt-1`} value={w.from.portId} onChange={(e) => update({ from: { ...w.from, portId: e.target.value }, signal: fromPorts.find((q) => q.id === e.target.value)?.signal ?? w.signal })}>
          {fromPorts.map((q) => (
            <option key={q.id} value={q.id}>
              {q.label} · {WIRE_SIGNAL_STYLE[q.signal].label}
            </option>
          ))}
        </select>
      </label>
      <label className="block font-semibold text-slate-600">
        Puerto de destino
        <select className={`${input} mt-1`} value={w.to.portId} onChange={(e) => update({ to: { ...w.to, portId: e.target.value } })}>
          {toPorts.map((q) => (
            <option key={q.id} value={q.id} disabled={fromPort ? !signalsCompatible(fromPort.signal, q.signal) : false}>
              {q.label} · {WIRE_SIGNAL_STYLE[q.signal].label}
            </option>
          ))}
        </select>
      </label>
      <p className="flex items-center gap-1.5 text-slate-600">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: WIRE_SIGNAL_STYLE[w.signal].color }} /> {WIRE_SIGNAL_STYLE[w.signal].label}
      </p>
      {issues.length ? issues.map((i, k) => <IssueRow key={k} issue={i} />) : <p className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Señal compatible en ambos equipos.</p>}
      <label className="block font-semibold text-slate-600">
        Cable del catálogo
        <select className={`${input} mt-1`} value={w.cableProductId ?? ""} onChange={(e) => update({ cableProductId: e.target.value || null })}>
          <option value="">{cables.length ? "Elegí un cable…" : "No hay cables de esta señal en el catálogo"}</option>
          {cables.map((c) => (
            <option key={c.id} value={c.id}>
              {c.brand ? `${c.brand} · ` : ""}
              {c.name}
              {c.lengthM ? ` · ${c.lengthM} m` : c.kind === "bulk" ? " · por metro" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block font-semibold text-slate-600">
        Etiqueta
        <input className={`${input} mt-1 font-mono`} value={w.label ?? ""} maxLength={40} onChange={(e) => update({ label: e.target.value || null })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="font-semibold text-slate-600">Largo del recorrido</p>
          <p className="mt-1 font-mono text-sm">{w.lengthM.toFixed(1)} m</p>
        </div>
        <label className="block font-semibold text-slate-600">
          Largo a mano (m)
          <input type="number" min={0.3} max={300} step={0.5} className={`${input} mt-1`} value={w.lengthOverrideM ?? ""} placeholder="auto" onChange={(e) => update({ lengthOverrideM: e.target.value ? Number(e.target.value) : null })} />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={btn} onClick={() => update({ points: [] })} disabled={!w.points.length}>
          <Spline className="h-3.5 w-3.5" /> Recto (quitar quiebres)
        </button>
        <button type="button" className={btn} onClick={() => p.onAnotherWire(w)}>
          <Plus className="h-3.5 w-3.5" /> Otro cable entre estos equipos
        </button>
        <button type="button" className={btn} onClick={() => p.onReverseWire(w.id)}>
          <ArrowLeftRight className="h-3.5 w-3.5" /> Invertir sentido
        </button>
      </div>
      <p className="text-[11px] leading-snug text-slate-500">En el plano: tocá un círculo blanco sobre el cable para agregar un quiebre; arrastrá los quiebres; doble clic en un quiebre lo borra.</p>
      <button type="button" className={`${btn} border-rose-200 text-rose-700 hover:bg-rose-50`} onClick={() => p.onDeleteWire(w.id)}>
        <Trash2 className="h-3.5 w-3.5" /> Eliminar cable
      </button>
    </div>
  );
}

function DevicePanel(p: Props & { deviceId: string; unit: number; label: string }) {
  const ports = p.model.ports[p.deviceId] ?? [];
  const [editing, setEditing] = useState(false);
  const conn = (portId: string) =>
    p.model.wires.filter((w) => (w.from.deviceId === p.deviceId && w.from.unit === p.unit && w.from.portId === portId) || (w.to.deviceId === p.deviceId && w.to.unit === p.unit && w.to.portId === portId));
  const manual = ports.some((q) => q.source !== "datasheet");
  return (
    <div className="space-y-3 p-3 text-xs">
      <div>
        <p className="text-sm font-semibold text-slate-900">{p.label}</p>
        <p className="text-slate-500">{manual ? "Puertos cargados a mano" : ports.length ? "Puertos de la ficha del fabricante" : "Sin puertos: cargá las señales que admite"}</p>
      </div>
      {ports.length && !editing ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {ports.map((q) => {
            const used = conn(q.id);
            return (
              <li key={q.id} className="flex items-start gap-2 px-2 py-1.5">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: WIRE_SIGNAL_STYLE[q.signal].color }} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{q.label}</span> <span className="text-slate-400">{q.direction === "in" ? "entrada" : q.direction === "out" ? "salida" : "E/S"}</span>
                  {used.map((w) => {
                    const other = w.from.deviceId === p.deviceId && w.from.unit === p.unit ? w.to : w.from;
                    return (
                      <button key={w.id} type="button" onClick={() => p.onSelect({ kind: "wire", id: w.id })} className="block truncate text-left text-[#1e3553] hover:underline">
                        → {deviceName(p.model, other.deviceId, other.unit)} · {portName(p.model, other.deviceId, other.portId)} ({w.label ?? "cable"})
                      </button>
                    );
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {editing || !ports.length ? <SignalEditor onSave={(next) => { p.onSetPorts(p.deviceId, next); setEditing(false); }} /> : null}
      <div className="flex flex-wrap gap-1.5">
        {ports.length && !editing ? (
          <button type="button" className={btn} onClick={() => setEditing(true)}>
            Cargar puertos a mano
          </button>
        ) : null}
        {manual ? (
          <button type="button" className={btn} onClick={() => p.onSetPorts(p.deviceId, null)}>
            Volver a la ficha
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Señales que admite un equipo genérico o sin ficha: cada una con su sentido y cantidad. */
function SignalEditor({ onSave }: { onSave: (ports: WirePort[]) => void }) {
  const [rows, setRows] = useState<Record<string, { on: boolean; direction: "in" | "out" | "bidir"; count: number }>>({});
  const signals = IO_SIGNALS.filter((s) => s !== "wireless");
  return (
    <div className="space-y-2">
      <p className="font-semibold text-slate-600">Señales que admite</p>
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {signals.map((s) => {
          const r = rows[s] ?? { on: false, direction: "in" as const, count: 1 };
          const set = (patch: Partial<typeof r>) => setRows((m) => ({ ...m, [s]: { ...r, ...patch } }));
          return (
            <li key={s} className="flex items-center gap-1.5">
              <input type="checkbox" checked={r.on} onChange={(e) => set({ on: e.target.checked })} className="h-3.5 w-3.5 accent-[#1e3553]" />
              <span className="h-2 w-2 rounded-full" style={{ background: WIRE_SIGNAL_STYLE[s as IoSignal].color }} />
              <span className="flex-1">{WIRE_SIGNAL_STYLE[s as IoSignal].label}</span>
              {r.on ? (
                <>
                  <select className="rounded border border-slate-300 px-1 py-0.5 text-[11px]" value={r.direction} onChange={(e) => set({ direction: e.target.value as "in" | "out" | "bidir" })}>
                    <option value="in">entrada</option>
                    <option value="out">salida</option>
                    <option value="bidir">E/S</option>
                  </select>
                  <input type="number" min={1} max={64} className="w-12 rounded border border-slate-300 px-1 py-0.5 text-[11px]" value={r.count} onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })} />
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className={primary}
        onClick={() => onSave(portsFromSignals(Object.entries(rows).filter(([, r]) => r.on).map(([s, r]) => ({ signal: s as IoSignal, direction: r.direction, count: r.count }))).map((q) => ({ ...q, source: "manual" as const })))}
      >
        Guardar puertos
      </button>
    </div>
  );
}
