"use client";

/**
 * Enlace de solo lectura para el cliente (sin cuenta): se elige el
 * vencimiento (7, 30 o 90 días), se copia la dirección y se ve hasta cuándo
 * vale y cuántas veces se abrió. Renovar cambia la dirección (la anterior
 * deja de andar); desactivar la corta en el momento.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, Link2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createRoomProjectShare, disableRoomProjectShare, getRoomProjectShare, type RoomProjectShare } from "@/server/actions/room-project-share";

const OPTIONS = [7, 30, 90] as const;

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" }) : "—");

export function ClientLinkButton({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<RoomProjectShare | null>(null);
  const [days, setDays] = useState<(typeof OPTIONS)[number]>(30);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || share) return;
    start(async () => {
      const res = await getRoomProjectShare(projectId);
      if (res.ok) setShare(res.share);
      else toast.error(res.error);
    });
  }, [open, share, projectId]);

  // Se cierra al tocar afuera o con Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function create() {
    if (share?.state === "active" && !window.confirm("Renovar genera una dirección nueva: la que ya enviaste deja de funcionar. ¿Seguir?")) return;
    start(async () => {
      const res = await createRoomProjectShare(projectId, days);
      if (!res.ok) return void toast.error(res.error);
      setShare(res.share);
      toast.success(share?.state === "active" ? "Enlace renovado" : "Enlace creado");
    });
  }

  function disable() {
    if (!window.confirm("El cliente ya no va a poder abrir el enlace. ¿Desactivarlo?")) return;
    start(async () => {
      const res = await disableRoomProjectShare(projectId);
      if (!res.ok) return void toast.error(res.error);
      setShare(res.share);
      toast.success("Enlace desactivado");
    });
  }

  async function copy() {
    if (!share?.url) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("No se pudo copiar: seleccioná el enlace y copialo a mano");
    }
  }

  const live = share?.state === "active";

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-md border border-[#1e3553] bg-white font-semibold text-[#1e3553] hover:bg-slate-50 ${compact ? "px-2.5 py-1.5 text-xs" : "rounded-lg px-4 py-2 text-sm"}`}
        title="Enlace de solo lectura para el cliente: planos, diagrama y equipos, sin precios"
      >
        <Link2 className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} /> Enlace para el cliente
      </button>
      {open ? (
        <div role="dialog" aria-label="Enlace para el cliente" className="absolute right-0 top-full z-50 mt-2 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-4 text-left text-sm shadow-xl">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">Enlace para el cliente</p>
              <p className="text-xs text-slate-500">Solo lectura y sin cuenta: planos, diagrama, equipos y láminas PDF. Nunca muestra precios.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!share ? (
            <p className="flex items-center gap-2 py-3 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Leyendo el enlace…
            </p>
          ) : (
            <div className="space-y-3">
              {share.url && live ? (
                <div className="space-y-1.5">
                  <div className="flex gap-1.5">
                    <input readOnly value={share.url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-slate-700" aria-label="Dirección del enlace" />
                    <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1 rounded-md bg-[#1e3553] px-2.5 text-xs font-semibold text-white">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                  <p className="text-xs text-slate-600">
                    Vence el <b>{fmt(share.expiresAt)}</b> · {share.views === 1 ? "1 visita" : `${share.views} visitas`}
                  </p>
                </div>
              ) : (
                <p className="rounded-md bg-slate-50 px-2.5 py-2 text-xs text-slate-600">{share.state === "expired" ? `El enlace venció el ${fmt(share.expiresAt)}. Generá uno nuevo.` : "Todavía no hay un enlace activo."}</p>
              )}

              <fieldset>
                <legend className="mb-1 text-xs font-medium text-slate-700">Vencimiento</legend>
                <div className="flex rounded-lg border border-slate-300 p-0.5" role="radiogroup">
                  {OPTIONS.map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)} className={`flex-1 rounded-md py-1 text-xs font-semibold ${days === d ? "bg-[#1e3553] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                      {d} días
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={create} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-[#1e3553] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {live ? "Renovar enlace" : "Crear enlace"}
                </button>
                {share.url ? (
                  <button type="button" onClick={disable} disabled={pending} className="text-xs font-semibold text-rose-700 hover:underline disabled:opacity-60">
                    Desactivar
                  </button>
                ) : null}
              </div>
              {live ? <p className="text-[11px] text-slate-500">Renovar cambia la dirección: la anterior deja de funcionar.</p> : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
