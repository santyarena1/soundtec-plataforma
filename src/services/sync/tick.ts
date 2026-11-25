// Decisiones del cron horario de sincronización (sin base, para poder testearlas).

export interface SourceScheduleLike {
  enabled: boolean;
  everyHours: number;
  atHourArg: number | null;
}

/**
 * Margen para el «cada N horas»: el cron entra a las HH:00:05 y la corrida
 * anterior arrancó unos segundos más tarde, así que a la semana justa le faltan
 * segundos y se salteaba al día siguiente (168 h se volvían 8 días).
 */
export function dueSlackMs(everyHours: number): number {
  return Math.min(30 * 60_000, everyHours * 3_600_000 * 0.1);
}

/**
 * Le toca una corrida nueva: fuente activa, en la hora elegida (ART) y pasado el
 * intervalo desde el INICIO de la última corrida aplicada (con margen).
 */
export function isDueAt(schedule: SourceScheduleLike, nowUtcMs: number, lastRunStartedMs: number | null): boolean {
  if (!schedule.enabled) return false;
  const artHour = (new Date(nowUtcMs).getUTCHours() - 3 + 24) % 24;
  if (schedule.atHourArg != null && artHour !== schedule.atHourArg) return false;
  if (lastRunStartedMs == null) return true;
  return nowUtcMs - lastRunStartedMs >= schedule.everyHours * 3_600_000 - dueSlackMs(schedule.everyHours);
}

export type TickAction = "resume" | "start" | "skip";

/**
 * Qué hace el cron con una fuente en este tick. Una corrida aplicándose que quedó
 * a medias (corte por tiempo de la función) se retoma en CADA tick hasta terminar;
 * solo las corridas nuevas esperan su horario.
 */
export function syncTickAction(input: { enabled: boolean; due: boolean; hasUnfinishedRun: boolean }): TickAction {
  if (!input.enabled) return "skip";
  if (input.hasUnfinishedRun) return "resume";
  return input.due ? "start" : "skip";
}

/**
 * ¿Arranca otro lote antes de que Vercel corte la función? Deja lugar para un
 * lote como el más lento visto hasta ahora (o el estimado si todavía no hubo).
 */
export function hasTimeForBatch(nowMs: number, deadlineMs: number, slowestBatchMs: number, estimateMs = 45_000): boolean {
  return nowMs + Math.max(slowestBatchMs, estimateMs) <= deadlineMs;
}
