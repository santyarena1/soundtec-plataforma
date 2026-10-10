"use client";

/**
 * Equipos genéricos en el editor: elegir una plantilla (lo que falta en el
 * catálogo) y completar nombre, descripción y precio para la cotización.
 * No tocan el catálogo de productos.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { GENERIC_CATEGORIES, GENERIC_LIBRARY, genericByKey, genericMissing, type GenericInfo, type GenericTemplate } from "@/services/room-builder/generic/library";
import { IO_SIGNAL_LABEL } from "@/services/room-builder/io-profile/types";
import type { MountOption } from "@/services/room-builder/types";

const DIRECTION_LABEL = { in: "entrada", out: "salida", bidir: "E/S" } as const;

/** Resumen de conexiones de una plantilla ("3× HDMI entrada · LAN · RS-232"). */
export function portSummary(t: GenericTemplate): string {
  return t.ports.map((p) => `${p.count > 1 ? `${p.count}× ` : ""}${IO_SIGNAL_LABEL[p.signal]} ${DIRECTION_LABEL[p.direction]}`).join(" · ");
}

export function GenericPicker({
  pending,
  mountChoices,
  maxUnits,
  onAdd,
}: {
  pending: boolean;
  mountChoices: Array<[MountOption, string]>;
  maxUnits: number;
  onAdd: (key: string, mount: MountOption, quantity: number, name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<GenericTemplate | null>(null);
  const [name, setName] = useState("");
  const [mount, setMount] = useState<MountOption>("ceiling");
  const [quantity, setQuantity] = useState(1);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? GENERIC_LIBRARY.filter((t) => `${t.name} ${t.hint} ${t.category}`.toLowerCase().includes(q)) : GENERIC_LIBRARY;
  }, [query]);

  if (picked) {
    return (
      <div className="space-y-2.5">
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Genérico · {picked.category}</p>
          <p className="text-xs font-semibold text-slate-900">{picked.name}</p>
          <p className="mt-0.5 text-[10.5px] text-slate-500">{portSummary(picked)}</p>
          <button type="button" onClick={() => setPicked(null)} className="mt-1 text-[11px] font-semibold text-[#1e3553] underline">
            Cambiar
          </button>
        </div>
        <label className="block text-[11px] font-semibold text-slate-700">
          Nombre en el proyecto
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-normal" placeholder={picked.name} />
        </label>
        <div>
          <p className="mb-1 text-[11px] font-semibold text-slate-700">¿Dónde va?</p>
          <div className="flex flex-wrap gap-1">
            {mountChoices.map(([m, label]) => (
              <button key={m} type="button" onClick={() => setMount(m)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${mount === m ? "border-[#1e3553] bg-[#1e3553] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
          Cantidad
          <input type="number" min={1} max={maxUnits} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(maxUnits, Number(e.target.value) || 1)))} className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-right text-xs" />
        </label>
        <button type="button" disabled={pending} onClick={() => onAdd(picked.key, mount, quantity, name.trim() || picked.name)} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#1e3553] py-2 text-xs font-semibold text-white disabled:opacity-50">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Agregar genérico
        </button>
        <p className="text-[10.5px] text-slate-500">No se agrega al catálogo: queda solo en este proyecto y su cotización. Precio y descripción se completan después.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar: motor de cortina, TV, matriz…" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs" autoFocus />
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {GENERIC_CATEGORIES.map((cat) => {
          const items = list.filter((t) => t.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat}>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{cat}</p>
              <ul className="space-y-1">
                {items.map((t) => (
                  <li key={t.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(t);
                        setMount(t.mount);
                        setName("");
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left hover:border-[#1e3553]/50"
                    >
                      <p className="text-xs font-semibold text-slate-900">{t.name}</p>
                      <p className="truncate text-[10.5px] text-slate-500">{portSummary(t)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Completar un genérico del proyecto: nombre, descripción y precio para cotizar. */
export function GenericEditor({ generic, pending, onSave, onRemove }: { generic: GenericInfo; pending: boolean; onSave: (patch: { name: string; description: string | null; priceUsd: number | null }) => void; onRemove?: () => void }) {
  const [name, setName] = useState(generic.name);
  const [description, setDescription] = useState(generic.description ?? "");
  const [price, setPrice] = useState(generic.priceUsd == null ? "" : String(generic.priceUsd));
  const template = genericByKey(generic.key);
  const missing = genericMissing(generic);
  const priceNum = price.trim() === "" ? null : Number(price.replace(",", "."));
  const priceInvalid = priceNum != null && (!Number.isFinite(priceNum) || priceNum < 0);
  return (
    <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-2.5">
      {missing.length ? (
        <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5" /> A completar para cotizar: {missing.join(" y ")}
        </p>
      ) : null}
      {template ? <p className="text-[10.5px] text-slate-500">Conexiones: {portSummary(template)}. Se editan puerto por puerto en el Plano técnico.</p> : null}
      <label className="block text-[11px] font-semibold text-slate-700">
        Nombre
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-normal" />
      </label>
      <label className="block text-[11px] font-semibold text-slate-700">
        Descripción (va a la cotización)
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-normal" placeholder="Marca, modelo, características…" />
      </label>
      <label className="block text-[11px] font-semibold text-slate-700">
        Precio unitario (USD)
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-xs font-normal ${priceInvalid ? "border-rose-400" : "border-slate-300"}`} placeholder="A completar" />
      </label>
      <div className="flex gap-1.5">
        <button type="button" disabled={pending || priceInvalid || !name.trim()} onClick={() => onSave({ name: name.trim(), description: description.trim() || null, priceUsd: priceNum })} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#1e3553] py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
        </button>
        {onRemove ? (
          <button type="button" disabled={pending} onClick={onRemove} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
            <Trash2 className="h-3.5 w-3.5" /> Quitar
          </button>
        ) : null}
      </div>
    </div>
  );
}
