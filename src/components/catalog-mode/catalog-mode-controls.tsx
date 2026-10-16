"use client";

import { useState, useTransition } from "react";
import { EyeOff, Loader2, Lock } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { disableCatalogMode, enableCatalogMode } from "@/server/actions/catalog-mode";

/**
 * Botón del panel: abre el portal en modo catálogo sin precios para
 * mostrárselo a un cliente. `compact` = versión del encabezado del celular.
 */
export function CatalogModeButton({ compact = false }: { compact?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = () =>
    start(async () => {
      setError(null);
      const r = await enableCatalogMode();
      if (!r.ok) return setError(r.error);
      window.location.assign("/catalogo");
    });
  if (compact) {
    return (
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#1e3553] px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm active:scale-[0.98] disabled:opacity-60"
        aria-label="Mostrar catálogo sin precios"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
        Catálogo
      </button>
    );
  }
  return (
    <div data-tour="catalog-mode">
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className="flex w-full items-center gap-2.5 rounded-lg bg-[#1e3553] px-3 py-2.5 text-left text-white shadow-sm transition hover:bg-[#25426a] active:scale-[0.99] disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <EyeOff className="h-4 w-4 shrink-0" />}
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-tight">Catálogo sin precios</span>
          <span className="block text-[11px] leading-tight text-white/70">Para mostrarle a un cliente</span>
        </span>
      </button>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Cinta del portal en modo catálogo: indica el modo y permite salir con la clave. */
export function CatalogModeExit() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-secondary"
        aria-label="Salir del modo catálogo"
      >
        <Lock className="h-3 w-3" /> Salir
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Volver a mostrar precios" size="sm">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const password = String(new FormData(e.currentTarget).get("password") ?? "");
            start(async () => {
              setError(null);
              const r = await disableCatalogMode(password);
              if (!r.ok) return setError(r.error);
              window.location.assign("/admin");
            });
          }}
        >
          <p className="text-sm text-muted-foreground">Para salir del catálogo sin precios confirmá con tu clave.</p>
          <div>
            <Label htmlFor="cm-pw">Tu clave</Label>
            <PasswordInput id="cm-pw" name="password" autoComplete="current-password" required />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Verificando…" : "Salir del modo catálogo"}
          </Button>
        </form>
      </Modal>
    </>
  );
}
