"use client";

import { confirmDialog } from "@/components/ui/confirm-dialog";
import { DEFAULT_UNSAVED_MESSAGE } from "./core";

/**
 * Registro global de pantallas con cambios sin guardar (uno por componente que use el hook).
 * El host (UnsavedChangesHost, montado en Providers) lo consulta para avisar al cerrar la pestaña,
 * al tocar un enlace y con el botón «atrás».
 */

const guards = new Map<number, string>();
const listeners = new Set<() => void>();
let nextId = 1;
let suspended = false;
let suspendTimer: ReturnType<typeof setTimeout> | null = null;
let pendingConfirm: Promise<boolean> | null = null;

/** Lo provee el host: saca la entrada «centinela» del historial antes de navegar. */
let releaseHistoryImpl: () => Promise<void> = async () => {};

const SUSPEND_FALLBACK_MS = 5000;

function emit() {
  for (const listener of listeners) listener();
}

export function newGuardId(): number {
  return nextId++;
}

export function setGuard(id: number, message: string | null) {
  const had = guards.get(id);
  if (message === null) {
    if (had === undefined) return;
    guards.delete(id);
  } else {
    if (had === message) return;
    guards.set(id, message);
  }
  emit();
}

export function subscribeGuards(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Hay algo registrado (aunque el aviso esté en pausa porque ya se confirmó la salida). */
export function hasRegisteredGuards(): boolean {
  return guards.size > 0;
}

export function hasUnsavedChanges(): boolean {
  return guards.size > 0 && !suspended;
}

export function isSuspended(): boolean {
  return suspended;
}

function currentMessage(): string {
  for (const message of guards.values()) return message;
  return DEFAULT_UNSAVED_MESSAGE;
}

/** Después de confirmar «Salir sin guardar»: no volver a preguntar mientras se navega. */
export function suspendGuards() {
  suspended = true;
  if (suspendTimer) clearTimeout(suspendTimer);
  suspendTimer = setTimeout(resumeGuards, SUSPEND_FALLBACK_MS);
  emit();
}

export function resumeGuards() {
  if (suspendTimer) clearTimeout(suspendTimer);
  suspendTimer = null;
  if (!suspended) return;
  suspended = false;
  emit();
}

export function setReleaseHistoryImpl(impl: () => Promise<void>) {
  releaseHistoryImpl = impl;
}

/**
 * Pregunta «¿Salir sin guardar?» si hay cambios. Devuelve true si se puede seguir.
 * Si el usuario confirma, el aviso queda en pausa hasta que cambie la página.
 */
export async function confirmLeave(message?: string): Promise<boolean> {
  if (!hasUnsavedChanges()) return true;
  if (!pendingConfirm) {
    pendingConfirm = confirmDialog({
      title: "Cambios sin guardar",
      message: message ?? `${currentMessage()}\n¿Salir igual?`,
      confirmLabel: "Salir sin guardar",
      cancelLabel: "Seguir editando",
      tone: "danger",
    }).finally(() => {
      pendingConfirm = null;
    });
  }
  const ok = await pendingConfirm;
  if (ok) suspendGuards();
  return ok;
}

/** Envuelve una navegación hecha por código (router.push, router.back, location.assign…). */
export async function guardedNavigate(navigate: () => void): Promise<boolean> {
  if (!(await confirmLeave())) return false;
  await releaseHistoryImpl();
  navigate();
  return true;
}

/**
 * Para cerrar un modal o descartar un borrador dentro de la misma página:
 * pregunta solo si `isDirty`. No pausa el aviso global.
 */
export async function confirmDiscard(isDirty: boolean, message = "Tenés cambios sin guardar en esta ventana. ¿Descartarlos?"): Promise<boolean> {
  if (!isDirty) return true;
  return confirmDialog({ title: "Cambios sin guardar", message, confirmLabel: "Descartar cambios", cancelLabel: "Seguir editando", tone: "danger" });
}
