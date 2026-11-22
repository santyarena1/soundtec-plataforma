"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useFormDirty } from "@/hooks/use-unsaved-changes-guard";

type AreaCtx = { markSaved: () => void; isDirty: boolean };
const UnsavedAreaContext = createContext<AreaCtx | null>(null);

/**
 * Envuelve un formulario (sirve desde páginas de servidor) y avisa al salir si sus campos
 * quedaron distintos de como se cargaron. Al enviar un <form> se toma como guardado;
 * si los datos guardados cambian (p. ej. `resetKey={updatedAt}`) se vuelve a tomar la foto.
 * Dentro, `useUnsavedArea()?.markSaved()` marca guardado a mano.
 */
export function UnsavedArea({
  children,
  className,
  resetKey,
  message,
  saveOnSubmit = true,
}: {
  children: ReactNode;
  className?: string;
  resetKey?: string | number | null;
  message?: string;
  saveOnSubmit?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { isDirty, markSaved } = useFormDirty(ref, { saveOnSubmit, message });
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // Los datos guardados cambiaron (refresh del servidor): la foto nueva es la referencia.
    const timer = setTimeout(markSaved, 0);
    return () => clearTimeout(timer);
  }, [resetKey, markSaved]);

  return (
    <UnsavedAreaContext.Provider value={{ markSaved, isDirty }}>
      <div ref={ref} className={className}>
        {children}
      </div>
    </UnsavedAreaContext.Provider>
  );
}

export function useUnsavedArea(): AreaCtx | null {
  return useContext(UnsavedAreaContext);
}
