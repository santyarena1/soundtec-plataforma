"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Eye, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { IMPERSONATION_EXIT_PATH, IMPERSONATION_RENEW_PATH, READ_ONLY_MESSAGE } from "@/lib/impersonation/token";

interface ImpersonationBarProps {
  targetName: string;
  companyName: string | null;
  roleLabel: string;
  actorName: string;
  expiresAt: number;
}

/** Botones que cambian algo: formularios de Server Actions y los marcados a mano con data-mutates. */
const MUTATING_SELECTOR = 'form:has(input[name^="$ACTION_ID_"]) button[type="submit"], [data-mutates]';
const TOOLTIP = "Solo lectura: estás viendo como otro usuario";
const WARN_MS = 5 * 60 * 1000;

function remainingLabel(ms: number): string {
  const min = Math.max(0, Math.ceil(ms / 60_000));
  return min <= 1 ? "menos de 1 min" : `${min} min`;
}

function warnReadOnly() {
  toast.error(READ_ONLY_MESSAGE, { id: "ver-como-solo-lectura" });
}

/**
 * Franja fija de «Ver como»: quién se está viendo, cuánto queda y la salida.
 * También marca como deshabilitados los botones que cambian algo y corta en el
 * navegador cualquier envío (el servidor lo frena igual: esto es para avisar).
 */
export function ImpersonationBar({ targetName, companyName, roleLabel, actorName, expiresAt }: ImpersonationBarProps) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [now, setNow] = useState(() => Date.now());
  const left = expiresAt - now;
  const barRef = useRef<HTMLDivElement>(null);

  // Lo que mide la franja (puede ocupar dos renglones en el celular) para correr los encabezados pegados arriba.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const root = document.documentElement;
    const sync = () => root.style.setProperty("--ver-como-h", `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--ver-como-h");
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    const end = window.setTimeout(() => window.location.assign(`${IMPERSONATION_EXIT_PATH}?motivo=vencida`), Math.max(0, expiresAt - Date.now()));
    return () => {
      window.clearInterval(id);
      window.clearTimeout(end);
    };
  }, [expiresAt]);

  useEffect(() => {
    document.documentElement.dataset.readOnlyView = "1";
    const originalFetch = window.fetch;
    const guardedFetch: typeof fetch = (input, init) => {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (h.has("next-action") || !["GET", "HEAD", "OPTIONS"].includes(method)) {
        warnReadOnly();
        return Promise.reject(new Error(READ_ONLY_MESSAGE));
      }
      return originalFetch(input, init);
    };
    window.fetch = guardedFetch;

    const mark = () => {
      document.querySelectorAll<HTMLElement>(MUTATING_SELECTOR).forEach((el) => {
        if (el.dataset.readOnlyMarked) return;
        el.dataset.readOnlyMarked = "1";
        el.setAttribute("aria-disabled", "true");
        el.setAttribute("title", TOOLTIP);
      });
    };
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(document.body, { childList: true, subtree: true });
    const block = (event: Event) => {
      const el = event.target instanceof Element ? event.target.closest(MUTATING_SELECTOR) : null;
      if (!el) return;
      event.preventDefault();
      event.stopPropagation();
      warnReadOnly();
    };
    document.addEventListener("click", block, true);

    return () => {
      if (window.fetch === guardedFetch) window.fetch = originalFetch;
      observer.disconnect();
      document.removeEventListener("click", block, true);
      delete document.documentElement.dataset.readOnlyView;
    };
  }, []);

  const current = `${pathname}${search?.toString() ? `?${search.toString()}` : ""}`;
  const renewHref = `${IMPERSONATION_RENEW_PATH}?volver=${encodeURIComponent(current)}`;
  const who = companyName ? `${targetName} (${companyName})` : targetName;

  return (
    <div ref={barRef} role="status" aria-live="polite" data-testid="ver-como-bar" data-ver-como-bar="" className="sticky top-0 z-[60] border-b-2 border-amber-500 bg-amber-50 text-amber-950">
      <div className="mx-auto flex max-w-[96rem] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
        {/* En el celular el texto ocupa su renglón y los controles van abajo. */}
        <p className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <Eye className="mr-1.5 inline h-4 w-4 -translate-y-px text-amber-700" aria-hidden />
          Estás viendo {roleLabel.startsWith("Cliente") ? "el portal" : "el sistema"} como <strong className="font-semibold">{who}</strong>
          <span className="text-amber-800"> · solo lectura</span>
          <span className="hidden text-amber-800/80 sm:inline"> · {actorName}</span>
        </p>
        <span className={left < WARN_MS ? "font-medium text-red-700" : "text-amber-800"}>Quedan {remainingLabel(left)}</span>
        <a href={renewHref} className="inline-flex items-center gap-1 rounded px-2 py-1 text-amber-900 underline-offset-2 hover:bg-amber-100 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Renovar
        </a>
        <a href={IMPERSONATION_EXIT_PATH} data-testid="ver-como-salir" className="inline-flex items-center gap-1 rounded-md bg-amber-900 px-3 py-1 font-medium text-amber-50 hover:bg-amber-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600">
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Salir
        </a>
      </div>
    </div>
  );
}
