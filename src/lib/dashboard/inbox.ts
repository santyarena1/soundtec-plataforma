/**
 * Bandeja «Para hacer hoy» del inicio del panel: junta lo pendiente de varios
 * módulos y lo ordena por urgencia. Puro (sin base): lo prueban los tests.
 */

export type InboxSeverity = "urgent" | "high" | "normal" | "low";

export type InboxEntry = {
  /** Texto corto de un caso puntual («SC-0142 · Estudio Ruiz»). */
  label: string;
  href: string;
  /** Aclaración al costado («vence mañana», «hace 9 días»). */
  note?: string;
};

export type InboxItem = {
  key: string;
  severity: InboxSeverity;
  count: number;
  title: string;
  detail?: string;
  href: string;
  actionLabel: string;
  /** Cuándo vence lo más próximo (cotización, invitación, tarea). */
  dueAt?: Date | null;
  /** Desde cuándo espera lo más viejo. */
  oldestAt?: Date | null;
  /** Hasta 3 casos para ir directo. */
  entries?: InboxEntry[];
};

const SEVERITY_RANK: Record<InboxSeverity, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/** Lo que vence en menos de esto sube a urgente, sea lo que sea. */
export const ESCALATE_WITHIN_MS = 48 * 3_600_000;
/** Lo que espera hace más de esto sube un escalón (de normal a alto, de bajo a normal). */
export const STALE_AFTER_MS = 14 * 86_400_000;

/** Severidad efectiva: vencimientos inminentes y esperas largas suben. */
export function effectiveSeverity(item: InboxItem, now: Date): InboxSeverity {
  if (item.dueAt && item.dueAt.getTime() - now.getTime() <= ESCALATE_WITHIN_MS) return "urgent";
  if (item.oldestAt && now.getTime() - item.oldestAt.getTime() >= STALE_AFTER_MS) {
    if (item.severity === "normal") return "high";
    if (item.severity === "low") return "normal";
  }
  return item.severity;
}

/**
 * Ordena la bandeja: primero la severidad (con las subidas de arriba), después
 * lo que vence antes, después lo que espera hace más, y por último lo que
 * tiene más casos. Lo que está en cero no aparece.
 */
export function prioritizeInbox(items: InboxItem[], now: Date = new Date()): Array<InboxItem & { severity: InboxSeverity }> {
  const far = Number.MAX_SAFE_INTEGER;
  return items
    .filter((item) => item.count > 0)
    .map((item) => ({ ...item, severity: effectiveSeverity(item, now) }))
    .sort((a, b) => {
      const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (bySeverity) return bySeverity;
      const byDue = (a.dueAt?.getTime() ?? far) - (b.dueAt?.getTime() ?? far);
      if (byDue) return byDue;
      const byAge = (a.oldestAt?.getTime() ?? far) - (b.oldestAt?.getTime() ?? far);
      if (byAge) return byAge;
      return b.count - a.count;
    });
}

/** «hoy», «mañana», «en 3 días», «hace 2 días», «vencido hace 5 días». */
export function relativeDays(target: Date, now: Date): string {
  const days = Math.round((startOfLocalDay(target) - startOfLocalDay(now)) / 86_400_000);
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days === -1) return "ayer";
  return days > 0 ? `en ${days} días` : `hace ${-days} días`;
}

/** Día calendario de Buenos Aires (UTC−3) como número de días. */
function startOfLocalDay(d: Date): number {
  const shifted = d.getTime() - 3 * 3_600_000;
  return Math.floor(shifted / 86_400_000) * 86_400_000;
}
