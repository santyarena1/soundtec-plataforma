import type { SyncSourceKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting, setSetting } from "@/lib/settings";

type ScheduledSource = "crestron" | "sonance";

export interface SyncSourceSchedule {
  enabled: boolean;
  everyHours: number;
  atHourArg: number | null;
}

export interface SyncScheduleConfig {
  crestron: SyncSourceSchedule;
  sonance: SyncSourceSchedule;
}

const SCHEDULE_KEY = "sync.schedule";

export const DEFAULT_SCHEDULE: SyncScheduleConfig = {
  crestron: { enabled: true, everyHours: 24, atHourArg: 8 },
  sonance: { enabled: true, everyHours: 168, atHourArg: 6 },
};

function normalizedSource(
  value: unknown,
  fallback: SyncSourceSchedule
): SyncSourceSchedule {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...fallback };
  }
  const source = value as Record<string, unknown>;
  const everyHours =
    typeof source.everyHours === "number" &&
    Number.isFinite(source.everyHours) &&
    source.everyHours > 0
      ? Math.min(8760, Math.max(1, source.everyHours))
      : fallback.everyHours;
  const atHourArg =
    source.atHourArg === null
      ? null
      : typeof source.atHourArg === "number" &&
          Number.isInteger(source.atHourArg) &&
          source.atHourArg >= 0 &&
          source.atHourArg <= 23
        ? source.atHourArg
        : fallback.atHourArg;
  return {
    enabled:
      typeof source.enabled === "boolean"
        ? source.enabled
        : fallback.enabled,
    everyHours,
    atHourArg,
  };
}

export async function getSchedule(): Promise<SyncScheduleConfig> {
  try {
    const raw = await getSetting(SCHEDULE_KEY, "");
    if (!raw) {
      return {
        crestron: { ...DEFAULT_SCHEDULE.crestron },
        sonance: { ...DEFAULT_SCHEDULE.sonance },
      };
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      crestron: normalizedSource(
        parsed?.crestron,
        DEFAULT_SCHEDULE.crestron
      ),
      sonance: normalizedSource(
        parsed?.sonance,
        DEFAULT_SCHEDULE.sonance
      ),
    };
  } catch {
    return {
      crestron: { ...DEFAULT_SCHEDULE.crestron },
      sonance: { ...DEFAULT_SCHEDULE.sonance },
    };
  }
}

export async function saveSchedule(cfg: SyncScheduleConfig): Promise<void> {
  await setSetting(SCHEDULE_KEY, JSON.stringify(cfg));
}

export function isDue(
  source: ScheduledSource,
  cfg: SyncScheduleConfig,
  nowUtcMs: number,
  lastRunMs: number | null
): boolean {
  const schedule = cfg[source];
  if (!schedule.enabled) return false;
  const artHour = Math.floor(
    ((new Date(nowUtcMs).getUTCHours() - 3) + 24) % 24
  );
  if (
    schedule.atHourArg != null &&
    artHour !== schedule.atHourArg
  ) {
    return false;
  }
  if (lastRunMs == null) return true;
  return (
    nowUtcMs - lastRunMs >=
    schedule.everyHours * 3_600_000
  );
}

export async function lastCompletedRunMs(
  source: ScheduledSource
): Promise<number | null> {
  const sourceKind: Record<ScheduledSource, SyncSourceKind> = {
    crestron: "CRESTRON",
    sonance: "SONANCE",
  };
  const run = await prisma.syncRun.findFirst({
    where: { source: sourceKind[source], status: "COMPLETED" },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true },
  });
  return run?.finishedAt?.getTime() ?? null;
}
