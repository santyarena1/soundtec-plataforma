"use client";

/**
 * Sistema del proyecto (varios ambientes): equipamiento central o por
 * ambiente, dónde va, la plataforma de control, lo que suma cada ambiente y
 * los equipos centrales con sugerencias del catálogo.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Info, Loader2, Server, Trash2, XCircle } from "lucide-react";
import type { HubSystemView } from "@/services/room-builder/project-system-db";
import { SYSTEM_LOCATION_LABELS, SYSTEM_LOCATIONS, type ProjectSystem, type SystemLocation, type SystemMode } from "@/services/room-builder/project-system";
import type { BriefControl } from "@/services/room-builder/brief";

const CONTROL_LABELS: Record<BriefControl, string> = {
  "crestron-home": "Crestron Home",
  "crestron-pro": "Crestron programado",
  none: "Sin sistema de control",
};

const LEVEL_STYLE = {
  error: { Icon: XCircle, cls: "border-red-200 bg-red-50 text-red-900" },
  warn: { Icon: AlertTriangle, cls: "border-amber-200 bg-amber-50 text-amber-900" },
  info: { Icon: Info, cls: "border-sky-200 bg-sky-50 text-sky-900" },
  ok: { Icon: CheckCircle2, cls: "border-emerald-200 bg-emerald-50 text-emerald-900" },
} as const;

const usd = (n: number | null) => (n == null ? "" : `USD ${Math.round(n).toLocaleString("es-AR")}`);

export function ProjectSystemPanel({ hubId, onChanged }: { hubId: string; onChanged?: () => void }) {
  const [view, setView] = useState<HubSystemView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const call = useCallback(
    async (init: RequestInit | undefined, busy: string | null, query = "") => {
      setSaving(busy);
      try {
        const res = await fetch(`/api/admin/room-builder/projects/${hubId}/project-system${query}`, init);
        const json = await res.json().catch(() => null);
        if (!json?.ok) {
          toast.error(json?.error || "No se pudo actualizar el sistema");
          return false;
        }
        setView(json.view);
        return true;
      } catch {
        toast.error("No se pudo actualizar el sistema");
        return false;
      } finally {
        setSaving(null);
        setLoading(false);
      }
    },
    [hubId],
  );

  useEffect(() => {
    void call(undefined, null);
  }, [call]);

  async function saveSettings(patch: Partial<ProjectSystem>, busy: string) {
    if (!view) return;
    const next = { ...view.system, ...patch };
    const ok = await call({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }, busy);
    if (ok) {
      toast.success("Sistema actualizado: los ambientes se re-armaron");
      onChanged?.();
    }
  }

  async function applyProduct(slotKey: string, productId: string, quantity: number) {
    const ok = await call({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotKey, productId, quantity }) }, `${slotKey}:${productId}`);
    if (ok) toast.success("Equipo central agregado");
  }

  async function removeDevice(slotKey: string) {
    const ok = await call({ method: "DELETE" }, `rm:${slotKey}`, `?slotKey=${encodeURIComponent(slotKey)}`);
    if (ok) toast.success("Equipo central quitado");
  }

  if (loading && !view) {
    return (
      <section className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Calculando el sistema del proyecto…
      </section>
    );
  }
  if (!view) return null;
  const { system, totals, rooms, central, findings } = view;
  const isCentral = system.mode === "central";

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Server className="h-4 w-4 text-[#1e3553]" /> Sistema del proyecto
          </h2>
          <p className="text-xs text-slate-500">Suma lo que necesita cada ambiente para elegir amplificación, control, streaming y red que sirvan para todo.</p>
        </div>
        {saving && !saving.includes(":") ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Re-armando ambientes…
          </span>
        ) : null}
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-600">Equipamiento</p>
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            {(["central", "per-room"] as SystemMode[]).map((m) => (
              <button
                key={m}
                type="button"
                disabled={Boolean(saving)}
                onClick={() => m !== system.mode && saveSettings({ mode: m }, "mode")}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold ${system.mode === m ? "bg-[#1e3553] text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {m === "central" ? "Central para todo" : "Cada ambiente con lo suyo"}
              </button>
            ))}
          </div>
        </div>
        <label className="space-y-1.5 text-xs font-semibold text-slate-600">
          Dónde va lo central
          <select
            value={system.location}
            disabled={!isCentral || Boolean(saving)}
            onChange={(e) => saveSettings({ location: e.target.value as SystemLocation }, "location")}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal disabled:opacity-50"
          >
            {SYSTEM_LOCATIONS.map((l) => (
              <option key={l} value={l}>
                {SYSTEM_LOCATION_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-600">
          Control
          <select
            value={system.control}
            disabled={Boolean(saving)}
            onChange={(e) => saveSettings({ control: e.target.value as BriefControl }, "control")}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal"
          >
            {(Object.keys(CONTROL_LABELS) as BriefControl[]).map((c) => (
              <option key={c} value={c}>
                {CONTROL_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {system.control === "crestron-home" ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          Crestron Home usa un único procesador para toda la obra: siempre va en el equipamiento central, aunque un ambiente tenga su propia amplificación.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Ambientes al central", `${totals.centralRooms} de ${totals.rooms}`],
          ["Parlantes", String(totals.speakers)],
          ["Zonas de audio", String(totals.zones)],
          ["Canales a amplificar", String(totals.channels)],
          ["Paneles y teclados", String(totals.touchPoints)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-200 px-3 py-2">
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
            <dd className="text-lg font-semibold tabular-nums text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-[10.5px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-1.5 pr-2">Ambiente</th>
              <th className="px-2">Parlantes</th>
              <th className="px-2">Zonas</th>
              <th className="px-2">Canales al central</th>
              <th className="px-2">Paneles</th>
              {isCentral ? <th className="px-2 text-right">Por su cuenta</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rooms.map((r) => (
              <tr key={r.id}>
                <td className="py-1.5 pr-2 font-medium text-slate-800">
                  {r.name}
                  {r.unitCount > 1 ? <span className="ml-1 text-slate-400">×{r.unitCount}</span> : null}
                </td>
                <td className="px-2 tabular-nums">{r.speakers}</td>
                <td className="px-2 tabular-nums">{r.speakers ? r.zones : "—"}</td>
                <td className="px-2 tabular-nums">{r.centralized.audio ? r.channels : "propios"}</td>
                <td className="px-2 tabular-nums">{r.touchPoints}</td>
                {isCentral ? (
                  <td className="px-2 text-right">
                    <input
                      type="checkbox"
                      checked={r.own}
                      disabled={Boolean(saving)}
                      onChange={(e) =>
                        saveSettings({ ownRooms: e.target.checked ? [...system.ownRooms, r.id] : system.ownRooms.filter((id) => id !== r.id) }, `own`)
                      }
                      className="h-3.5 w-3.5 accent-[#1e3553]"
                      aria-label={`${r.name} con su propio equipamiento`}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {central.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600">Equipamiento central · {SYSTEM_LOCATION_LABELS[system.location]}</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {central.map((d) => (
              <li key={d.slotKey} className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-2">
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-100 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {d.imageUrl ? <img src={d.imageUrl} alt="" className="h-full w-full object-contain p-0.5" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{d.label}</span>
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {d.quantity > 1 ? `${d.quantity} × ` : ""}
                    {d.brandName ? `${d.brandName} ` : ""}
                    {d.productName ?? "Sin elegir"}
                  </span>
                  {d.channels ? <span className="text-[11px] text-slate-500">{d.channels * d.quantity} canales</span> : null}
                </span>
                <button
                  type="button"
                  disabled={Boolean(saving)}
                  onClick={() => removeDevice(d.slotKey)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Quitar ${d.label}`}
                >
                  {saving === `rm:${d.slotKey}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="space-y-2">
        {findings.map((f) => {
          const { Icon, cls } = LEVEL_STYLE[f.level];
          return (
            <li key={f.id} className={`rounded-xl border px-3 py-2.5 ${cls}`}>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon className="h-4 w-4 shrink-0" /> {f.title}
              </p>
              <p className="mt-0.5 text-xs opacity-90">{f.detail}</p>
              {f.actions.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {f.actions.map((a) => (
                    <button
                      key={a.productId}
                      type="button"
                      disabled={Boolean(saving)}
                      onClick={() => applyProduct(a.slotKey, a.productId, a.quantity)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-current/20 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:shadow-sm disabled:opacity-50"
                    >
                      {saving === `${a.slotKey}:${a.productId}` ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Usar {a.label}
                      {a.priceUsd != null ? <span className="font-normal text-slate-500">· {usd(a.priceUsd)}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
