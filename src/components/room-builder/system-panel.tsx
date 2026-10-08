"use client";

/**
 * Pestaña "Sistema": lo que el motor revisó (amplificación, control, red,
 * streaming), explicado, con el producto sugerido para resolverlo.
 */

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Info, Loader2, Plus, RefreshCw, XCircle } from "lucide-react";
import type { FindingAction, ResolvedFinding } from "@/services/room-builder/system-check-db";

const LEVEL_STYLE = {
  error: { icon: XCircle, box: "border-red-200 bg-red-50", icon_: "text-red-600" },
  warn: { icon: AlertTriangle, box: "border-amber-200 bg-amber-50", icon_: "text-amber-600" },
  info: { icon: Info, box: "border-sky-200 bg-sky-50", icon_: "text-sky-600" },
  ok: { icon: CheckCircle2, box: "border-emerald-200 bg-white", icon_: "text-emerald-600" },
} as const;

const AREA_LABEL = { audio: "Audio", control: "Control", red: "Red", streaming: "Streaming" } as const;

/** Chequeo del ambiente; se vuelve a pedir cuando cambian los equipos. */
export function useSystemCheck(projectId: string, devicesKey: string) {
  const [findings, setFindings] = useState<ResolvedFinding[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/room-builder/projects/${projectId}/system`);
      const json = await res.json().catch(() => null);
      setFindings(json?.ok ? json.findings : []);
    } catch {
      setFindings([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load, devicesKey]);

  return { findings, loading, reload: load };
}

function ActionButton({ action, pending, onRun }: { action: FindingAction; pending: boolean; onRun: () => void }) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onRun}
      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white p-1.5 text-left transition hover:border-[#1e3553]/50 hover:shadow-sm disabled:opacity-50"
    >
      <span className="h-8 w-8 shrink-0 overflow-hidden rounded border border-slate-100 bg-white">
        {action.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={action.imageUrl} alt="" className="h-full w-full object-contain" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 text-[11px] font-medium leading-snug text-slate-800">{action.label}</span>
      {action.priceUsd != null ? <span className="shrink-0 text-[10.5px] font-semibold text-slate-600">USD {action.priceUsd.toFixed(0)}</span> : null}
      <Plus className="h-3.5 w-3.5 shrink-0 text-[#1e3553]" />
    </button>
  );
}

export function SystemPanel({
  projectId,
  findings,
  loading,
  onReload,
  onProjectChanged,
}: {
  projectId: string;
  findings: ResolvedFinding[] | null;
  loading: boolean;
  onReload: () => void;
  onProjectChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function run(action: FindingAction) {
    startTransition(async () => {
      const res =
        action.type === "assign"
          ? await fetch(`/api/admin/room-builder/projects/${projectId}/assign`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ slotKey: action.slotKey, productId: action.productId, quantity: action.quantity }),
            })
          : await fetch(`/api/admin/room-builder/projects/${projectId}/system`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ productId: action.productId, quantity: action.quantity }),
            });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        toast.error(json?.error || "No se pudo aplicar");
        return;
      }
      toast.success("Listo, lo sumamos al proyecto");
      onProjectChanged();
    });
  }

  const problems = findings?.filter((f) => f.level === "error" || f.level === "warn").length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Revisión del sistema</h2>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Chequeamos que lo elegido funcione junto: amplificación, control, red y streaming.
          </p>
        </div>
        <button type="button" onClick={onReload} disabled={loading} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Volver a revisar">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {findings && findings.length > 0 ? (
        <p className={`rounded-lg px-3 py-2 text-xs font-semibold ${problems ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>
          {problems ? `${problems} punto${problems > 1 ? "s" : ""} para resolver` : "Todo en orden"}
        </p>
      ) : null}
      {findings && findings.length === 0 && !loading ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500">
          Elegí productos para revisar el sistema.
        </p>
      ) : null}

      <ul className="space-y-2">
        {(findings ?? []).map((f) => {
          const style = LEVEL_STYLE[f.level];
          const Icon = style.icon;
          return (
            <li key={f.id} className={`rounded-xl border p-2.5 ${style.box}`}>
              <div className="flex gap-2">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.icon_}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{AREA_LABEL[f.area]}</p>
                  <p className="text-[13px] font-semibold leading-snug text-slate-900">{f.title}</p>
                  {f.detail ? <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-600">{f.detail}</p> : null}
                </div>
              </div>
              {f.actions.length ? (
                <div className="mt-2 space-y-1.5 pl-6">
                  {f.actions.map((a) => (
                    <ActionButton key={`${a.type}-${a.productId}-${a.quantity}`} action={a} pending={pending} onRun={() => run(a)} />
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Link href="/admin/room-builder/reglas" className="block text-[11px] font-semibold text-[#1e3553] underline">
        Editar reglas de integración y especificaciones
      </Link>
    </div>
  );
}
