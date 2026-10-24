"use client";

import { useEffect, useRef } from "react";

/**
 * Completa en segundo plano las descripciones cortas faltantes (máximo 5 por
 * apertura, en el servidor). Va por fetch a una ruta y no como server action
 * para no bloquear los guardados de la pantalla mientras responde la IA.
 */
export function FillMissingShortDescriptions({ quoteId, needed }: { quoteId: string; needed: boolean }) {
  const ran = useRef(false);

  useEffect(() => {
    if (!needed || ran.current) return;
    ran.current = true;
    const key = `quote-shortdesc-${quoteId}`;
    try {
      // Una vez por sesión del navegador: si la IA falla, no reintenta en cada apertura.
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* sin sessionStorage: sigue igual, el tope del servidor limita el costo */
    }
    fetch(`/api/admin/quotes/${quoteId}/short-descriptions`, { method: "POST" }).catch((error) => {
      console.error("No se pudieron completar las descripciones cortas", error);
    });
  }, [needed, quoteId]);

  return null;
}
