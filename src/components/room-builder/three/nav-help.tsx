"use client";

/** Ayuda de navegación del 3D: se abre sola la primera vez y queda a mano. */

import { useEffect, useState } from "react";
import { Move3d, X } from "lucide-react";

const SEEN_KEY = "rb-nav-help-seen";

const TIPS: Array<[string, string]> = [
  ["Arrastrar", "girar alrededor"],
  ["Rueda / pellizcar", "acercar y alejar"],
  ["Clic derecho o Shift + arrastrar", "desplazarse"],
  ["W A S D o flechas", "caminar"],
  ["Q / E", "girar a los costados"],
  ["Doble clic en el piso", "ir a ese punto"],
  ["Vistas de arriba", "Planta, A nivel (ojos), Frente AV"],
];

export function NavHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      // sin almacenamiento: queda cerrada
    }
  }, []);

  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // no pasa nada
    }
  };

  return (
    <div className="pointer-events-auto absolute bottom-12 left-2 z-10 sm:left-3">
      {open ? (
        <div className="w-64 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold text-slate-900">Cómo moverse</p>
            <button type="button" onClick={close} className="rounded p-0.5 text-slate-400 hover:bg-slate-100" aria-label="Cerrar ayuda">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <dl className="space-y-1">
            {TIPS.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="font-medium text-slate-700">{k}</dt>
                <dd className="text-right text-slate-500">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-md backdrop-blur hover:bg-white"
        >
          <Move3d className="h-3.5 w-3.5" /> Cómo moverse
        </button>
      )}
    </div>
  );
}
