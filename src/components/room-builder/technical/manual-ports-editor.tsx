"use client";

/**
 * Puertos cargados a mano de un equipo, solo para este proyecto: para equipos
 * sin ficha o con la ficha incompleta / equivocada. Cada puerto lleva nombre,
 * señal (del vocabulario de fichas), sentido, cantidad y conector (y familia
 * si es un enlace UTP propietario). El motor y el cableado los usan igual que
 * los de ficha, pero quedan marcados "cargado a mano, sin ficha".
 */

import { useState } from "react";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { isSameValue } from "@/lib/unsaved-guard/core";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { IO_SIGNALS, type IoDirection, type IoSignal } from "@/services/room-builder/io-profile/types";
import { MANUAL_PORT_NOTE, normalizeManualPorts, type ManualPort } from "@/services/room-builder/manual-ports";
import { WIRE_SIGNAL_STYLE } from "@/services/room-builder/wiring/types";

const field = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] focus:border-[#1e3553] focus:outline-none focus:ring-2 focus:ring-[#1e3553]/15";
const DIRECTION_LABEL: Record<IoDirection, string> = { in: "entrada", out: "salida", bidir: "E/S" };
const EMPTY = { label: "", signal: "hdmi" as IoSignal, direction: "in" as IoDirection, count: 1, connector: "", family: "" };

type Draft = typeof EMPTY;

export function ManualPortsEditor({ ports, onChange }: { ports: ManualPort[]; onChange: (next: ManualPort[]) => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  // Puerto a medio cargar (o editado y sin «Guardar puerto»): avisar al salir.
  const [openedDraft, setOpenedDraft] = useState<Draft>(EMPTY);
  useUnsavedChangesGuard(open && !isSameValue(draft, openedDraft));

  function save() {
    const id = editing ?? nextId(ports);
    const row = { id, label: draft.label.trim(), signal: draft.signal, direction: draft.direction, count: draft.count, connector: draft.connector.trim() || null, family: draft.family.trim() || null };
    const list = editing ? ports.map((p) => (p.id === editing ? row : p)) : [...ports, row];
    onChange(normalizeManualPorts(list));
    setDraft(EMPTY);
    setEditing(null);
    setOpen(false);
  }

  function edit(p: ManualPort) {
    const next = { label: p.label, signal: p.signal, direction: p.direction, count: p.count, connector: p.connector ?? "", family: p.family ?? "" };
    setDraft(next);
    setOpenedDraft(next);
    setEditing(p.id);
    setOpen(true);
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2">
      <div>
        <p className="font-semibold text-amber-900">Puertos cargados a mano (solo este proyecto)</p>
        <p className="text-[11px] leading-snug text-amber-800">Para un equipo sin ficha o con la ficha incompleta. Se cablean igual que los de ficha, marcados con * ({MANUAL_PORT_NOTE}).</p>
      </div>
      {ports.length ? (
        <ul className="divide-y divide-amber-100 rounded-md border border-amber-200 bg-white">
          {ports.map((p) => (
            <li key={p.id} className="flex items-center gap-1.5 px-2 py-1">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: WIRE_SIGNAL_STYLE[p.signal].color }} />
              <span className="min-w-0 flex-1 truncate">
                <b>{p.label}</b> · {WIRE_SIGNAL_STYLE[p.signal].label} · {DIRECTION_LABEL[p.direction]}
                {p.count > 1 ? ` × ${p.count}` : ""}
                {p.connector ? ` · ${p.connector}` : ""}
                {p.family ? ` · ${p.family}` : ""}
              </span>
              <button type="button" aria-label={`Editar ${p.label}`} className="rounded p-0.5 text-slate-500 hover:bg-slate-100" onClick={() => edit(p)}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" aria-label={`Quitar ${p.label}`} className="rounded p-0.5 text-rose-600 hover:bg-rose-50" onClick={() => onChange(ports.filter((x) => x.id !== p.id))}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <div className="grid grid-cols-2 gap-1.5">
          <label className="col-span-2 text-[11px] font-semibold text-slate-600">
            Nombre (como en el equipo)
            <input className={`${field} mt-0.5`} value={draft.label} maxLength={60} placeholder="HDMI IN 2" onChange={(e) => set({ label: e.target.value })} />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Señal
            <select className={`${field} mt-0.5`} value={draft.signal} onChange={(e) => set({ signal: e.target.value as IoSignal })}>
              {IO_SIGNALS.filter((s) => s !== "wireless").map((s) => (
                <option key={s} value={s}>
                  {WIRE_SIGNAL_STYLE[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Sentido
            <select className={`${field} mt-0.5`} value={draft.direction} onChange={(e) => set({ direction: e.target.value as IoDirection })}>
              <option value="in">entrada</option>
              <option value="out">salida</option>
              <option value="bidir">E/S</option>
            </select>
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Cantidad
            <input type="number" min={1} max={64} className={`${field} mt-0.5`} value={draft.count} onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Conector
            <input className={`${field} mt-0.5`} value={draft.connector} maxLength={40} placeholder="HDMI tipo A, RJ-45…" onChange={(e) => set({ connector: e.target.value })} />
          </label>
          {draft.signal === "cat-proprietary" ? (
            <label className="col-span-2 text-[11px] font-semibold text-slate-600">
              Familia del enlace
              <input className={`${field} mt-0.5 font-mono`} value={draft.family} maxLength={40} placeholder="hall-ultra-4k" onChange={(e) => set({ family: e.target.value })} />
            </label>
          ) : null}
          <div className="col-span-2 flex gap-1.5">
            <button type="button" className="inline-flex items-center gap-1 rounded-md bg-[#1e3553] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50" disabled={!draft.label.trim()} onClick={save}>
              {editing ? "Guardar puerto" : "Agregar puerto"}
            </button>
            <button type="button" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600" onClick={() => { setOpen(false); setEditing(null); setDraft(EMPTY); }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-50" onClick={() => {
          setOpenedDraft(draft);
          setOpen(true);
        }}>
          <Plus className="h-3.5 w-3.5" /> Agregar puerto a mano
        </button>
      )}
    </div>
  );
}

function nextId(ports: ManualPort[]): string {
  let k = ports.length + 1;
  while (ports.some((p) => p.id === `m${k}`)) k++;
  return `m${k}`;
}
