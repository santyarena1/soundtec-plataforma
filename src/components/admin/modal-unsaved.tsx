"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUnsavedArea } from "@/components/unsaved-guard/unsaved-area";
import { confirmDiscard } from "@/hooks/use-unsaved-changes-guard";

/**
 * Para modales con formulario: el contenido va dentro de <UnsavedArea> (se monta con el modal,
 * así la foto inicial es la del momento en que se abre) y <DirtyReporter> le cuenta al modal si
 * hay cambios, para preguntar «¿Descartar?» al cerrarlo.
 */
export function DirtyReporter({ onChange }: { onChange: (dirty: boolean) => void }) {
  const area = useUnsavedArea();
  const dirty = area?.isDirty ?? false;
  useEffect(() => {
    onChange(dirty);
  }, [dirty, onChange]);
  useEffect(() => () => onChange(false), [onChange]);
  return null;
}

/** Cierre de modal que pregunta si hay cambios sin guardar. */
export function useGuardedModalClose(close: () => void) {
  const [dirty, setDirty] = useState(false);
  const asking = useRef(false);
  const requestClose = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    try {
      if (await confirmDiscard(dirty)) close();
    } finally {
      asking.current = false;
    }
  }, [dirty, close]);
  return { setDirty, requestClose };
}
