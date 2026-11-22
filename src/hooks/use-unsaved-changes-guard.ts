"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { autosaveNeedsWarning, serializeFormControls, stableSerialize, type AutosaveStatus, type ControlLike } from "@/lib/unsaved-guard/core";
import { guardedNavigate, newGuardId, setGuard } from "@/lib/unsaved-guard/registry";

export { confirmDiscard, confirmLeave, guardedNavigate, hasUnsavedChanges } from "@/lib/unsaved-guard/registry";

/**
 * Avisa antes de salir de la pantalla (cerrar pestaña, enlaces, botón atrás, router de la app)
 * mientras `isDirty` sea true. El aviso lo muestra UnsavedChangesHost (montado en Providers).
 *
 *   const { isDirty, markSaved } = useDirtyTracker(form);
 *   useUnsavedChangesGuard(isDirty);
 *   …al guardar con éxito: markSaved();
 */
export function useUnsavedChangesGuard(isDirty: boolean, message?: string) {
  const idRef = useRef<number | null>(null);
  if (idRef.current === null) idRef.current = newGuardId();

  useEffect(() => {
    const id = idRef.current!;
    setGuard(id, isDirty ? (message ?? "Tenés cambios sin guardar. Si salís ahora, se pierden.") : null);
  }, [isDirty, message]);

  useEffect(() => {
    const id = idRef.current!;
    return () => setGuard(id, null);
  }, []);
}

/** Para pantallas con autoguardado: avisa solo si hay algo pendiente, guardándose o con error. */
export function useAutosaveGuard(status: AutosaveStatus, message?: string) {
  useUnsavedChangesGuard(autosaveNeedsWarning(status), message ?? (status === "error" ? "El último autoguardado falló: hay cambios sin guardar." : "Se están guardando los últimos cambios. Si salís ahora, se pueden perder."));
}

/**
 * Compara el valor actual contra el inicial (o el último guardado), no contra «si tocó algo».
 * `ready=false` mientras los datos todavía se cargan: la foto inicial se toma cuando pasa a true.
 */
export function useDirtyTracker<T>(value: T, options: { ready?: boolean } = {}) {
  const ready = options.ready ?? true;
  const serialized = useMemo(() => stableSerialize(value), [value]);
  const [baseline, setBaseline] = useState<string | null>(() => (ready ? serialized : null));
  const latest = useRef(serialized);
  latest.current = serialized;

  useEffect(() => {
    if (ready && baseline === null) setBaseline(latest.current);
  }, [ready, baseline]);

  /** Llamar después de guardar con éxito. Sin argumento toma el valor actual. */
  const markSaved = useCallback((saved?: T) => {
    setBaseline(saved === undefined ? latest.current : stableSerialize(saved));
  }, []);

  const isDirty = ready && baseline !== null && serialized !== baseline;
  return { isDirty, markSaved };
}

/** Atajo: compara y registra el aviso en una sola línea. */
export function useUnsavedValue<T>(value: T, options: { ready?: boolean; message?: string; enabled?: boolean } = {}) {
  const tracker = useDirtyTracker(value, options);
  useUnsavedChangesGuard((options.enabled ?? true) && tracker.isDirty, options.message);
  return tracker;
}

// Los deshabilitados también cuentan: muchos formularios ponen disabled={pending} mientras guardan.
function controlsOf(root: HTMLElement): ControlLike[] {
  const elements = root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea");
  const out: ControlLike[] = [];
  elements.forEach((el) => {
    const ignore = !!el.closest("[data-unsaved-guard='ignore']");
    if (el instanceof HTMLSelectElement && el.multiple) {
      out.push({ name: el.name, type: "select-multiple", value: "", selectedValues: Array.from(el.selectedOptions).map((o) => o.value), ignore });
    } else if (el instanceof HTMLInputElement && el.type === "file") {
      out.push({ name: el.name, type: "file", value: "", fileCount: el.files?.length ?? 0, ignore });
    } else if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      out.push({ name: el.name, type: el.type, value: el.value, checked: el.checked, ignore });
    } else {
      out.push({ name: el.name, type: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(), value: el.value, ignore });
    }
  });
  return out;
}

/**
 * Cambios en un formulario leyendo el DOM (sirve para <form action={serverAction}> con
 * campos no controlados). La foto inicial se toma al montar; se actualiza al enviar el
 * formulario (`saveOnSubmit`, por defecto) o con `markSaved()`.
 */
export function useFormDirty(ref: RefObject<HTMLElement | null>, options: { saveOnSubmit?: boolean; message?: string; enabled?: boolean } = {}) {
  const saveOnSubmit = options.saveOnSubmit ?? true;
  const baseline = useRef<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const snapshot = useCallback(() => (ref.current ? serializeFormControls(controlsOf(ref.current)) : null), [ref]);
  const recompute = useCallback(() => {
    const now = snapshot();
    setIsDirty(now !== null && baseline.current !== null && now !== baseline.current);
  }, [snapshot]);
  const markSaved = useCallback(() => {
    baseline.current = snapshot();
    setIsDirty(false);
  }, [snapshot]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // Un tick después de montar: los inputs controlados ya tienen su valor inicial.
    const timer = setTimeout(() => {
      baseline.current = snapshot();
    }, 0);
    const onEdit = () => queueMicrotask(recompute);
    const onSubmit = () => {
      if (saveOnSubmit) markSaved();
    };
    root.addEventListener("input", onEdit);
    root.addEventListener("change", onEdit);
    // Campos ocultos que cambia React (modales, selectores) y filas agregadas/quitadas.
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        recompute();
      });
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["value", "checked"] });
    // submit y reset burbujean: cubren todos los <form> de adentro. Un <form action> de React
    // se vacía solo al terminar (reset): esa es la nueva foto.
    const onReset = () => setTimeout(markSaved, 0);
    root.addEventListener("submit", onSubmit);
    root.addEventListener("reset", onReset);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      root.removeEventListener("input", onEdit);
      root.removeEventListener("change", onEdit);
      root.removeEventListener("submit", onSubmit);
      root.removeEventListener("reset", onReset);
    };
  }, [ref, snapshot, recompute, markSaved, saveOnSubmit]);

  useUnsavedChangesGuard((options.enabled ?? true) && isDirty, options.message);
  return { isDirty, markSaved, recompute };
}

/**
 * useRouter con aviso: push/replace/back/forward preguntan antes si hay cambios sin guardar.
 * refresh() no pregunta (no sale de la pantalla).
 */
export function useGuardedRouter() {
  const router = useRouter();
  return useMemo(
    () => ({
      ...router,
      push: (href: string, opts?: Parameters<typeof router.push>[1]) => void guardedNavigate(() => router.push(href, opts)),
      replace: (href: string, opts?: Parameters<typeof router.replace>[1]) => void guardedNavigate(() => router.replace(href, opts)),
      back: () => void guardedNavigate(() => router.back()),
      forward: () => void guardedNavigate(() => router.forward()),
    }),
    [router],
  );
}
