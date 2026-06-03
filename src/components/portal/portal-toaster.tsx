"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, X, ShoppingBag, ArrowRight } from "lucide-react";

export interface ToastDetail {
  type: "success" | "error";
  title: string;
  description?: string;
  /** Si está, agrega un CTA "Ver mi solicitud" al toast */
  requestId?: string;
  /** Contadores opcionales — si están, se renderizan en una pill */
  itemsTotal?: number;
  unitsTotal?: number;
}

/** Helper para disparar el toast desde cualquier client component. */
export function showToast(detail: ToastDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("portal:toast", { detail }));
}

interface ActiveToast extends ToastDetail {
  id: number;
}

/**
 * Toaster global del portal. Vive en PortalShell y escucha eventos
 * "portal:toast" desde cualquier client component (AddToDraftButton,
 * AddToRequestPanel, etc).
 *
 * Posicionado bottom-right, encima del mini-cart, con animación de entrada
 * y auto-dismiss a los 5s. Hasta 3 toasts apilados.
 */
export function PortalToaster() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      if (!detail) return;
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-2), { ...detail, id }]);
      // auto-dismiss
      window.setTimeout(() => remove(id), 5000);
    }
    window.addEventListener("portal:toast", handler);
    return () => window.removeEventListener("portal:toast", handler);
  }, [remove]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-24 right-4 z-50 flex flex-col gap-2 sm:bottom-28 sm:right-6 pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onClose={() => remove(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onClose }: { toast: ActiveToast; onClose: () => void }) {
  const isSuccess = toast.type === "success";
  return (
    <div
      className={`pointer-events-auto w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-xl border-l-4 bg-card shadow-2xl animate-in slide-in-from-right-4 fade-in duration-300 ${
        isSuccess ? "border-l-success" : "border-l-destructive"
      }`}
    >
      <div className="flex items-start gap-3 p-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            isSuccess ? "bg-success/15" : "bg-destructive/15"
          }`}
        >
          {isSuccess ? (
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : (
            <AlertCircle className="h-5 w-5 text-destructive" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{toast.description}</p>
          ) : null}
          {isSuccess && (toast.itemsTotal != null || toast.unitsTotal != null) ? (
            <div className="mt-2 inline-flex items-center gap-2 rounded-md bg-secondary/60 px-2 py-1 text-[11px]">
              <ShoppingBag className="h-3 w-3 text-primary" />
              <span className="text-muted-foreground">En tu solicitud:</span>
              {toast.itemsTotal != null ? (
                <span className="font-semibold tabular-nums">
                  {toast.itemsTotal} producto{toast.itemsTotal === 1 ? "" : "s"}
                </span>
              ) : null}
              {toast.unitsTotal != null ? (
                <span className="font-semibold tabular-nums">
                  · {toast.unitsTotal} u.
                </span>
              ) : null}
            </div>
          ) : null}
          {toast.requestId ? (
            <Link
              href={`/portal/requests/${toast.requestId}`}
              onClick={onClose}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ver mi solicitud <ArrowRight className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
