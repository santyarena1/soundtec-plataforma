import * as React from "react";
import type { SyncSourceKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncHealth, syncNeedsAttention, type SyncHealth } from "@/lib/dashboard/sync-health";
import { getSchedule, type ScheduledSource } from "@/services/sync/schedule";

const cache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  (React as unknown as { cache?: <T>(fn: T) => T }).cache ?? ((fn) => fn);

/** Fuentes que se sincronizan solas (las del horario de Sincronización). */
const SOURCES: Array<{ kind: SyncSourceKind; key: ScheduledSource; label: string }> = [
  { kind: "CRESTRON", key: "crestron", label: "Crestron (Xtrabone)" },
  { kind: "SONANCE", key: "sonance", label: "Sonance" },
  { kind: "SOUNDTUBE", key: "soundtube", label: "SoundTube" },
  { kind: "CRESTRON_WEB", key: "crestron-web", label: "crestron.com (fichas)" },
  { kind: "HALL_RESEARCH_WEB", key: "hall-research-web", label: "Hall Research (fichas)" },
];

export type SyncSourceStatus = {
  kind: SyncSourceKind;
  label: string;
  health: SyncHealth;
  needsAttention: boolean;
  lastRunAt: Date | null;
  lastAppliedAt: Date | null;
  lastPriceChanges: number | null;
  scheduled: boolean;
};

/** Estado de cada sincronización. Una vez por request (lo usan la bandeja y el bloque de catálogo). */
export const loadSyncStatus = cache(async (now: Date = new Date()): Promise<SyncSourceStatus[]> => {
  const kinds = SOURCES.map((s) => s.kind);
  const [latest, applied, schedule] = await Promise.all([
    prisma.$queryRaw<Array<{ source: SyncSourceKind; status: string; mode: string; startedAt: Date; finishedAt: Date | null; error: string | null }>>`
      SELECT DISTINCT ON (source) source, status::text AS status, mode, "startedAt", "finishedAt", error
      FROM "SyncRun"
      WHERE source::text = ANY(${kinds as string[]})
      ORDER BY source, "startedAt" DESC
    `,
    prisma.$queryRaw<Array<{ source: SyncSourceKind; finishedAt: Date | null; priceChanges: number }>>`
      SELECT DISTINCT ON (source) source, "finishedAt", "priceChanges"
      FROM "SyncRun"
      WHERE source::text = ANY(${kinds as string[]}) AND status = 'COMPLETED' AND mode = 'apply'
      ORDER BY source, "finishedAt" DESC NULLS LAST
    `,
    getSchedule(),
  ]);
  return SOURCES.map((s) => {
    const last = latest.find((r) => r.source === s.kind) ?? null;
    const ok = applied.find((r) => r.source === s.kind) ?? null;
    const health = syncHealth({ latest: last, lastAppliedAt: ok?.finishedAt ?? null, schedule: schedule[s.key], now });
    return {
      kind: s.kind,
      label: s.label,
      health,
      needsAttention: syncNeedsAttention(health),
      lastRunAt: last?.startedAt ?? null,
      lastAppliedAt: ok?.finishedAt ?? null,
      lastPriceChanges: ok ? Number(ok.priceChanges) : null,
      scheduled: schedule[s.key].enabled,
    };
  });
});
