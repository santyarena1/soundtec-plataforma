import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  getSchedule,
  saveSchedule,
  type SyncScheduleConfig,
  type SyncSourceSchedule,
} from "@/services/sync/schedule";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function validateSource(value: unknown, name: string): SyncSourceSchedule {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid schedule for ${name}`);
  }
  const source = value as Record<string, unknown>;
  if (typeof source.enabled !== "boolean") {
    throw new Error(`${name}.enabled must be boolean`);
  }
  if (
    typeof source.everyHours !== "number" ||
    !Number.isFinite(source.everyHours) ||
    source.everyHours <= 0
  ) {
    throw new Error(`${name}.everyHours must be a positive number`);
  }
  if (
    source.atHourArg !== null &&
    (
      typeof source.atHourArg !== "number" ||
      !Number.isInteger(source.atHourArg) ||
      source.atHourArg < 0 ||
      source.atHourArg > 23
    )
  ) {
    throw new Error(`${name}.atHourArg must be null or an integer from 0 to 23`);
  }
  return {
    enabled: source.enabled,
    everyHours: Math.min(8760, Math.max(1, source.everyHours)),
    atHourArg: source.atHourArg as number | null,
  };
}

function validateSchedule(value: unknown): SyncScheduleConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid sync schedule");
  }
  const schedule = value as Record<string, unknown>;
  return {
    crestron: validateSource(schedule.crestron, "crestron"),
    sonance: validateSource(schedule.sonance, "sonance"),
  };
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ ok: true, schedule: await getSchedule() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown schedule error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const schedule = validateSchedule(await req.json());
    await saveSchedule(schedule);
    return NextResponse.json({ ok: true, schedule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown schedule error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
