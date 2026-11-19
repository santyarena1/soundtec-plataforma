/**
 * Estado de cada sincronización de proveedor para el inicio del panel.
 * Puro: recibe la última corrida, la última aplicación completa y el horario.
 */

export type SyncRunLite = {
  status: string;
  mode: string;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
};

export type SyncHealthState = "ok" | "failed" | "late" | "running" | "stuck" | "off" | "never";

export type SyncHealth = { state: SyncHealthState; label: string; detail?: string };

/** Margen sobre la frecuencia antes de avisar que está atrasada (el cron corre a una hora fija). */
export const SYNC_LATE_GRACE_MS = 24 * 3_600_000;
/** Una corrida que sigue «en curso» después de esto quedó trabada. */
export const SYNC_STUCK_AFTER_MS = 6 * 3_600_000;

export function syncHealth(input: {
  latest: SyncRunLite | null;
  lastAppliedAt: Date | null;
  schedule: { enabled: boolean; everyHours: number } | null;
  now: Date;
}): SyncHealth {
  const { latest, lastAppliedAt, schedule, now } = input;
  if (latest && ["PENDING", "RUNNING", "APPLYING"].includes(latest.status)) {
    return now.getTime() - latest.startedAt.getTime() > SYNC_STUCK_AFTER_MS
      ? { state: "stuck", label: "Trabada", detail: "Arrancó hace más de 6 horas y no terminó." }
      : { state: "running", label: "Corriendo" };
  }
  if (latest?.status === "FAILED") {
    return { state: "failed", label: "Falló", detail: latest.error?.slice(0, 160) || undefined };
  }
  if (schedule?.enabled) {
    if (!lastAppliedAt) return { state: "never", label: "Nunca se aplicó" };
    const due = schedule.everyHours * 3_600_000 + SYNC_LATE_GRACE_MS;
    if (now.getTime() - lastAppliedAt.getTime() > due) return { state: "late", label: "Atrasada" };
    return { state: "ok", label: "Al día" };
  }
  if (!latest) return { state: "off", label: "Sin programar" };
  return { state: "off", label: "Manual" };
}

/** Necesita que alguien la mire. */
export function syncNeedsAttention(h: SyncHealth): boolean {
  return h.state === "failed" || h.state === "late" || h.state === "stuck" || h.state === "never";
}
