import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { analyzeHubSystem, removeCentralDevice, saveHubSystem, setCentralDevice } from "@/services/room-builder/project-system-db";
import { SYSTEM_LOCATIONS, SYSTEM_MODES } from "@/services/room-builder/project-system";
import { BRIEF_CONTROLS } from "@/services/room-builder/brief";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Cambiar el modo re-arma cada ambiente: puede tardar. */
export const maxDuration = 120;

type Ctx = { params: { id: string } };

const fail = (error: unknown, fallback: string, status = 400) => {
  console.error("[room-builder/project-system]", error);
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback }, { status });
};

/** Sistema del proyecto: totales, equipos centrales y sugerencias. */
export async function GET(_req: Request, { params }: Ctx) {
  await requireAdmin();
  try {
    const view = await analyzeHubSystem(params.id);
    if (!view) return NextResponse.json({ ok: false, error: "Proyecto no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, view });
  } catch (error) {
    return fail(error, "No se pudo calcular el sistema", 500);
  }
}

const settingsSchema = z.object({
  mode: z.enum(SYSTEM_MODES as [string, ...string[]]),
  location: z.enum(SYSTEM_LOCATIONS as [string, ...string[]]),
  control: z.enum(BRIEF_CONTROLS),
  ownRooms: z.array(z.string().min(1).max(64)).max(200).default([]),
});

/** Guarda central / por ambiente, dónde va y la plataforma; re-arma los ambientes. */
export async function PUT(req: Request, { params }: Ctx) {
  await requireAdmin();
  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Configuración inválida" }, { status: 400 });
  try {
    const view = await saveHubSystem(params.id, { version: 1, ...parsed.data });
    if (!view) return NextResponse.json({ ok: false, error: "Proyecto no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, view });
  } catch (error) {
    return fail(error, "No se pudo guardar");
  }
}

const deviceSchema = z.object({
  slotKey: z.string().min(1).max(40),
  productId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(48).default(1),
});

/** Pone un equipo central (amplificación, procesador, streaming, switch). */
export async function POST(req: Request, { params }: Ctx) {
  await requireAdmin();
  const parsed = deviceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Equipo inválido" }, { status: 400 });
  try {
    const view = await setCentralDevice(params.id, parsed.data.slotKey, parsed.data.productId, parsed.data.quantity);
    return NextResponse.json({ ok: true, view });
  } catch (error) {
    return fail(error, "No se pudo agregar");
  }
}

/** Saca un equipo central. */
export async function DELETE(req: Request, { params }: Ctx) {
  await requireAdmin();
  const slotKey = new URL(req.url).searchParams.get("slotKey");
  if (!slotKey) return NextResponse.json({ ok: false, error: "Falta el equipo" }, { status: 400 });
  try {
    const view = await removeCentralDevice(params.id, slotKey);
    return NextResponse.json({ ok: true, view });
  } catch (error) {
    return fail(error, "No se pudo quitar");
  }
}
